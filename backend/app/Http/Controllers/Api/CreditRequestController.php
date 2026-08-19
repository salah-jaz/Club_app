<?php

namespace App\Http\Controllers\Api;

use App\Helpers\PermissionHelper;
use App\Http\Controllers\Controller;
use App\Models\CreditRequest;
use App\Models\Member;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use App\Helpers\MailHelper;

class CreditRequestController extends Controller
{
    // -------------------------------------------------------------------------
    // Wallet routing helper
    // -------------------------------------------------------------------------

    /**
     * Juniors share their parent adult's wallet.
     * Returns the parent if the given member is a junior with a known parent,
     * otherwise returns the member themselves.
     */
    private function resolveWalletMember(string $memberId): Member
    {
        return \App\Helpers\WalletHelper::resolveMember(Member::findOrFail($memberId));
    }

    // -------------------------------------------------------------------------
    // CRUD
    // -------------------------------------------------------------------------

    public function index()
    {
        $requests = CreditRequest::orderBy('created_at', 'desc')->get();
        return response()->json($requests->map(fn($r) => $this->formatRequest($r)));
    }

    public function store(Request $request)
    {
        if ($response = PermissionHelper::denyAdminUnless($request, 'credits.create')) {
            return $response;
        }

        $request->validate([
            'memberId' => 'required|string',
            'amount' => 'required|numeric|min:0.01',
            'date' => 'required|date',
            'type' => 'nullable|in:credit,debit,refund',
        ]);

        $user = $request->user();
        $isAdmin = $user && $user->role === 'admin';
        $type = $request->input('type', 'credit');

        if ($type === 'debit') {
            return $this->storeDebit($request, $user, $isAdmin);
        }

        if ($type === 'refund') {
            return $this->storeRefund($request, $user, $isAdmin);
        }

        // Credit request — record is always against the requested memberId for auditability.
        $cr = CreditRequest::create([
            'id' => 'c_' . Str::random(8),
            'member_id' => $request->memberId,
            'type' => 'credit',
            'amount' => $request->amount,
            'date' => $request->date,
            'status' => $isAdmin ? 'approved' : 'created',
        ]);

        if ($isAdmin) {
            // Immediately credit the wallet member (parent for juniors).
            $walletMember = $this->resolveWalletMember($request->memberId);
            $walletMember->credit += $request->amount;
            $walletMember->save();

            // Ledger entry recorded against the wallet member.
            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $walletMember->id,
                'credit_request_id' => $cr->id,
                'type' => 'credit',
                'amount' => $request->amount,
                'description' => 'Credit top-up (Admin direct)',
                'date' => $request->date,
            ]);

            try {
                MailHelper::sendTransactionEmail($walletMember, $transaction);
            } catch (\Exception $e) {
                logger()->error("Transaction credit email failed: " . $e->getMessage());
            }
        }

        return response()->json($this->formatRequest($cr), 201);
    }

    private function storeRefund(Request $request, $user, bool $isAdmin)
    {
        if (!$isAdmin) {
            return response()->json(['message' => 'Only admins can create refund entries.'], 403);
        }

        $cr = CreditRequest::create([
            'id' => 'c_' . Str::random(8),
            'member_id' => $request->memberId,
            'type' => 'refund',
            'amount' => $request->amount,
            'date' => $request->date,
            'status' => 'approved',
        ]);

        // Refund always goes to the wallet member (parent for juniors).
        $walletMember = $this->resolveWalletMember($request->memberId);
        $walletMember->credit += $request->amount;
        $walletMember->save();

        $transaction = Transaction::create([
            'id' => 't_' . Str::random(8),
            'member_id' => $walletMember->id,
            'credit_request_id' => $cr->id,
            'type' => 'refund',
            'amount' => $request->amount,
            'description' => 'Refund (Admin)',
            'date' => $request->date,
        ]);

        try {
            MailHelper::sendTransactionEmail($walletMember, $transaction);
        } catch (\Exception $e) {
            logger()->error("Transaction refund email failed: " . $e->getMessage());
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

        // Debit is always charged against the wallet member (parent for juniors).
        $walletMember = $this->resolveWalletMember($request->memberId);

        if ((float) $walletMember->credit < (float) $request->amount) {
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

        $walletMember->credit -= $request->amount;
        $walletMember->save();

        $debitTxn = Transaction::create([
            'id' => 't_' . Str::random(8),
            'member_id' => $walletMember->id,
            'credit_request_id' => $cr->id,
            'type' => 'debit',
            'amount' => $request->amount,
            'description' => $reason,
            'reason' => $reason,
            'date' => $request->date,
        ]);

        try {
            MailHelper::sendTransactionEmail($walletMember, $debitTxn);
        } catch (\Exception $e) {
            logger()->error("Transaction debit email failed: " . $e->getMessage());
        }

        return response()->json($this->formatRequest($cr), 201);
    }

    public function approve($id)
    {
        if ($response = PermissionHelper::requireAdminPermission(request(), 'credits.edit')) {
            return $response;
        }

        $cr = CreditRequest::findOrFail($id);

        if ($cr->type === 'debit') {
            return response()->json(['message' => 'Debit entries cannot be approved.'], 400);
        }

        if ($cr->status !== 'created') {
            return response()->json(['message' => 'Credit request already processed.'], 400);
        }

        $cr->status = 'approved';
        $cr->save();

        // Credit the wallet member (parent for juniors).
        $walletMember = $this->resolveWalletMember($cr->member_id);
        $walletMember->credit += $cr->amount;
        $walletMember->save();

        $transaction = Transaction::create([
            'id' => 't_' . Str::random(8),
            'member_id' => $walletMember->id,
            'credit_request_id' => $cr->id,
            'type' => 'credit',
            'amount' => $cr->amount,
            'description' => 'Credit top-up approved',
            'date' => now(),
        ]);

        try {
            MailHelper::sendTransactionEmail($walletMember, $transaction);
        } catch (\Exception $e) {
            logger()->error("Transaction credit email failed: " . $e->getMessage());
        }

        return response()->json([
            'message' => 'Credit request approved.',
            'request' => $this->formatRequest($cr),
            'memberCredit' => $walletMember->credit
        ]);
    }

    public function reject($id)
    {
        if ($response = PermissionHelper::requireAdminPermission(request(), 'credits.edit')) {
            return $response;
        }

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

    public function destroy(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'credits.delete')) {
            return $response;
        }

        $user = $request->user();
        if (!$user || $user->role !== 'admin') {
            return response()->json(['message' => 'Only admins can delete transactions.'], 403);
        }

        return \Illuminate\Support\Facades\DB::transaction(function () use ($id) {
            $cr = CreditRequest::findOrFail($id);

            // Resolve wallet member for balance reversal (parent for juniors).
            $walletMember = null;
            if ($cr->status === 'approved') {
                // The transaction record holds the actual wallet member id used.
                $txn = Transaction::where('credit_request_id', $cr->id)->first();
                $walletMemberId = $txn ? $txn->member_id : $cr->member_id;
                $walletMember = Member::lockForUpdate()->find($walletMemberId);

                if ($walletMember) {
                    $type = $cr->type ?? 'credit';
                    if ($type === 'credit' || $type === 'refund') {
                        $walletMember->credit -= (float) $cr->amount;
                    } elseif ($type === 'debit') {
                        $walletMember->credit += (float) $cr->amount;
                    }
                    $walletMember->save();
                }

                // Delete corresponding transaction record
                if (!$txn) {
                    $type = $cr->type ?? 'credit';
                    $txn = Transaction::where('member_id', $walletMember?->id ?? $cr->member_id)
                        ->whereIn('type', $type === 'refund' ? ['refund', 'credit'] : [$type])
                        ->where('amount', $cr->amount)
                        ->orderBy('created_at', 'desc')
                        ->first();
                }
                if ($txn) {
                    $txn->delete();
                }
            }

            $cr->delete();

            return response()->json([
                'message' => 'Wallet transaction deleted and reversed successfully.',
                'memberCredit' => $walletMember ? (float) $walletMember->credit : 0,
            ]);
        });
    }

    private function formatRequest(CreditRequest|\stdClass $r)
    {
        $type = $r->type ?? 'credit';
        // Normalise: only valid types exposed to the frontend
        if (!in_array($type, ['credit', 'debit', 'refund'])) {
            $type = 'credit';
        }
        return [
            'id' => $r->id,
            'memberId' => $r->member_id,
            'amount' => (float)$r->amount,
            'date' => $r->date,
            'type' => $type,
            'status' => $r->status,
            'reason' => $r->reason,
            'createdAt' => $r->created_at instanceof \DateTimeInterface ? $r->created_at->format('c') : (string) $r->created_at,
        ];
    }
}
