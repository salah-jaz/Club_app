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

        $rawReason = $request->input('reason');
        $reason = is_string($rawReason) ? trim($rawReason) : '';

        if ($reason === '') {
            return response()->json([
                'message' => 'Reason is required.',
                'errors' => ['reason' => ['Reason is required.']]
            ], 422);
        }

        if (mb_strlen($reason) < 5) {
            return response()->json([
                'message' => 'Reason must be at least 5 characters.',
                'errors' => ['reason' => ['Reason must be at least 5 characters.']]
            ], 422);
        }

        if (mb_strlen($reason) > 500) {
            return response()->json([
                'message' => 'Reason must not exceed 500 characters.',
                'errors' => ['reason' => ['Reason must not exceed 500 characters.']]
            ], 422);
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
            'reason' => $reason,
        ]);

        // Same pattern as play-schedule debits: reduce member balance + one debit txn only
        $member->credit -= $request->amount;
        $member->save();

        $debitTxn = Transaction::create([
            'id' => 't_' . Str::random(8),
            'member_id' => $member->id,
            'type' => 'debit',
            'amount' => $request->amount,
            'description' => $reason,
            'reason' => $reason,
            'date' => $request->date,
        ]);

        try {
            MailHelper::sendTransactionEmail($member, $debitTxn);
        } catch (\Exception $e) {
            logger()->error("Transaction debit email failed: " . $e->getMessage());
        }

        return response()->json($this->formatRequest($cr), 201);
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
            'reason' => $r->reason,
            'createdAt' => $r->created_at->toISOString(),
        ];
    }
}
