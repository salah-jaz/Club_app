<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CreditRequest;
use App\Models\Member;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use App\Helpers\MailHelper;

class CreditRequestController extends Controller
{
    public function index()
    {
        $requests = CreditRequest::orderBy('created_at', 'desc')->get();
        return response()->json($requests->map(fn($r) => $this->formatRequest($r)));
    }

    public function store(Request $request)
    {
        $request->validate([
            'memberId' => 'required|string',
            'amount' => 'required|numeric|min:0.01',
            'date' => 'required|date',
            'type' => 'nullable|in:credit,debit',
        ]);

        $user = $request->user();
        $isAdmin = $user && $user->role === 'admin';
        $type = $request->input('type', 'credit');

        if ($type === 'debit') {
            return $this->storeDebit($request, $user, $isAdmin);
        }

        $cr = CreditRequest::create([
            'id' => 'c_' . Str::random(8),
            'member_id' => $request->memberId,
            'type' => 'credit',
            'amount' => $request->amount,
            'date' => $request->date,
            'status' => $isAdmin ? 'approved' : 'created',
        ]);

        if ($isAdmin) {
            // Credit the member directly
            $member = Member::findOrFail($request->memberId);
            $member->credit += $request->amount;
            $member->save();

            // Create transaction ledger entry
            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $request->memberId,
                'type' => 'credit',
                'amount' => $request->amount,
                'description' => 'Credit top-up (Admin direct)',
                'date' => $request->date,
            ]);

            try {
                MailHelper::sendTransactionEmail($member, $transaction);
            } catch (\Exception $e) {
                logger()->error("Transaction credit email failed: " . $e->getMessage());
            }
        }

        return response()->json($this->formatRequest($cr), 201);
    }

    private function storeDebit(Request $request, $user, bool $isAdmin)
    {
        if (!$isAdmin) {
            return response()->json(['message' => 'Only admins can create debit entries.'], 403);
        }

        $adminMember = $this->resolveAdminMember($user->id);
        if (!$adminMember) {
            return response()->json([
                'message' => 'Your admin account has no linked member profile to receive the debit transfer. Create a member profile for your admin user first.',
            ], 400);
        }

        if ($adminMember->id === $request->memberId) {
            return response()->json(['message' => 'Cannot debit your own member balance.'], 400);
        }

        $member = Member::findOrFail($request->memberId);

        if ((float) $member->credit < (float) $request->amount) {
            return response()->json([
                'message' => 'Insufficient member balance for this debit.',
            ], 400);
        }

        $cr = CreditRequest::create([
            'id' => 'c_' . Str::random(8),
            'member_id' => $request->memberId,
            'type' => 'debit',
            'amount' => $request->amount,
            'date' => $request->date,
            'status' => 'approved',
        ]);

        $member->credit -= $request->amount;
        $member->save();

        $adminMember->credit += $request->amount;
        $adminMember->save();

        $debitTxn = Transaction::create([
            'id' => 't_' . Str::random(8),
            'member_id' => $member->id,
            'type' => 'debit',
            'amount' => $request->amount,
            'description' => 'Debit (Admin transfer to club)',
            'date' => $request->date,
        ]);

        $creditTxn = Transaction::create([
            'id' => 't_' . Str::random(8),
            'member_id' => $adminMember->id,
            'type' => 'credit',
            'amount' => $request->amount,
            'description' => 'Credit from member debit (Admin)',
            'date' => $request->date,
        ]);

        try {
            MailHelper::sendTransactionEmail($member, $debitTxn);
        } catch (\Exception $e) {
            logger()->error("Transaction debit email failed: " . $e->getMessage());
        }

        try {
            MailHelper::sendTransactionEmail($adminMember, $creditTxn);
        } catch (\Exception $e) {
            logger()->error("Transaction admin credit email failed: " . $e->getMessage());
        }

        return response()->json($this->formatRequest($cr), 201);
    }

    /**
     * Prefer an active adult member linked to the admin user; fall back to any linked member.
     */
    private function resolveAdminMember(string $userId): ?Member
    {
        $members = Member::where('user_id', $userId)->get();
        if ($members->isEmpty()) {
            return null;
        }

        $preferred = $members
            ->filter(fn(Member $m) => $m->status === 'active' && $m->member_type === 'adult')
            ->first();

        if ($preferred) {
            return $preferred;
        }

        $active = $members->first(fn(Member $m) => $m->status === 'active');
        return $active ?: $members->first();
    }

    public function approve($id)
    {
        $cr = CreditRequest::findOrFail($id);

        if ($cr->type === 'debit') {
            return response()->json(['message' => 'Debit entries cannot be approved.'], 400);
        }

        if ($cr->status !== 'created') {
            return response()->json(['message' => 'Credit request already processed.'], 400);
        }

        $cr->status = 'approved';
        $cr->save();

        // Credit the member
        $member = Member::findOrFail($cr->member_id);
        $member->credit += $cr->amount;
        $member->save();

        // Create transaction ledger entry
        $transaction = Transaction::create([
            'id' => 't_' . Str::random(8),
            'member_id' => $cr->member_id,
            'type' => 'credit',
            'amount' => $cr->amount,
            'description' => 'Credit top-up approved',
            'date' => now(),
        ]);

        try {
            MailHelper::sendTransactionEmail($member, $transaction);
        } catch (\Exception $e) {
            logger()->error("Transaction credit email failed: " . $e->getMessage());
        }

        return response()->json([
            'message' => 'Credit request approved.',
            'request' => $this->formatRequest($cr),
            'memberCredit' => $member->credit
        ]);
    }

    public function reject($id)
    {
        $cr = CreditRequest::findOrFail($id);

        if ($cr->type === 'debit') {
            return response()->json(['message' => 'Debit entries cannot be rejected.'], 400);
        }

        if ($cr->status !== 'created') {
            return response()->json(['message' => 'Credit request already processed.'], 400);
        }

        $cr->status = 'rejected';
        $cr->save();

        return response()->json([
            'message' => 'Credit request rejected.',
            'request' => $this->formatRequest($cr)
        ]);
    }

    private function formatRequest(CreditRequest $r)
    {
        return [
            'id' => $r->id,
            'memberId' => $r->member_id,
            'amount' => (float)$r->amount,
            'date' => $r->date,
            'type' => $r->type ?? 'credit',
            'status' => $r->status,
            'createdAt' => $r->created_at->toISOString(),
        ];
    }
}
