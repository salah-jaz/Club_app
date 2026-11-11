<?php

namespace App\Http\Controllers\Api;

use App\Helpers\FamilyScopeHelper;
use App\Helpers\PermissionHelper;
use App\Http\Controllers\Controller;
use App\Models\CreditRequest;
use App\Models\Member;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use App\Helpers\MailHelper;

class CreditRequestController extends Controller
{
    // -------------------------------------------------------------------------
    // Wallet routing helper
    // -------------------------------------------------------------------------

    /**
     * Juniors share their parent adult's wallet.
     * Returns the (row-locked) wallet member: the parent if the given member is a
     * junior with a known parent, otherwise the member themselves.
     * Must be called inside a DB::transaction.
     */
    private function lockWalletMember(string $memberId): Member
    {
        $member = Member::findOrFail($memberId);
        $walletId = \App\Helpers\WalletHelper::resolveMember($member)->id;

        return Member::lockForUpdate()->findOrFail($walletId);
    }

    // -------------------------------------------------------------------------
    // CRUD
    // -------------------------------------------------------------------------

    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user->role === 'admin') {
            // Admins see ALL requests (including those with no member, e.g. expenses).
            if ($response = PermissionHelper::requireAdminPermission($request, 'credits.view')) {
                return $response;
            }
            $query = CreditRequest::query();
        } else {
            // Members only see requests for their own family (null member_id is admin-only).
            $familyIds = FamilyScopeHelper::familyMemberIds($user);
            $query = CreditRequest::whereIn('member_id', $familyIds);
        }

        $requests = $query->orderBy('created_at', 'desc')->get();
        return response()->json($requests->map(fn($r) => $this->formatRequest($r)));
    }

    public function store(Request $request)
    {
        if ($response = PermissionHelper::denyAdminUnless($request, 'credits.create')) {
            return $response;
        }

        $type = $request->input('type', 'credit');
        $user = $request->user();
        $isAdmin = $user && $user->role === 'admin';

        $request->validate([
            // Expenses are not tied to a member; every other entry requires one.
            'memberId' => $type === 'expense' ? 'nullable|string' : 'required|string|exists:members,id',
            'amount' => 'required|numeric|min:0.01',
            'date' => 'required|date',
            'type' => 'nullable|in:credit,debit,refund,expense',
        ]);

        if ($type === 'expense') {
            return $this->storeExpense($request, $user, $isAdmin);
        }

        if ($type === 'debit') {
            return $this->storeDebit($request, $user, $isAdmin);
        }

        if ($type === 'refund') {
            return $this->storeRefund($request, $user, $isAdmin);
        }

        // Non-admins may only request credit for members in their own family.
        if (!$isAdmin && !FamilyScopeHelper::ownsMember($user, (string) $request->memberId)) {
            return response()->json(['message' => 'You do not have access to this member.'], 403);
        }

        // Credit request — record is always against the requested memberId for auditability.
        [$cr, $walletMember, $transaction] = DB::transaction(function () use ($request, $isAdmin) {
            $cr = CreditRequest::create([
                'id' => 'c_' . Str::random(8),
                'member_id' => $request->memberId,
                'type' => 'credit',
                'amount' => $request->amount,
                'date' => substr(trim($request->date), 0, 10),
                'status' => $isAdmin ? 'approved' : 'created',
            ]);

            if (!$isAdmin) {
                return [$cr, null, null];
            }

            // Immediately credit the wallet member (parent for juniors).
            $walletMember = $this->lockWalletMember($request->memberId);
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
                'date' => $this->buildTransactionTimestamp($request->date),
            ]);

            return [$cr, $walletMember, $transaction];
        });

        if ($walletMember && $transaction) {
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

        [$cr, $walletMember, $transaction] = DB::transaction(function () use ($request) {
            $cr = CreditRequest::create([
                'id' => 'c_' . Str::random(8),
                'member_id' => $request->memberId,
                'type' => 'refund',
                'amount' => $request->amount,
                'date' => substr(trim($request->date), 0, 10),
                'status' => 'approved',
            ]);

            // Refund always goes to the wallet member (parent for juniors).
            $walletMember = $this->lockWalletMember($request->memberId);
            $walletMember->credit += $request->amount;
            $walletMember->save();

            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $walletMember->id,
                'credit_request_id' => $cr->id,
                'type' => 'refund',
                'amount' => $request->amount,
                'description' => 'Refund (Admin)',
                'date' => $this->buildTransactionTimestamp($request->date),
            ]);

            return [$cr, $walletMember, $transaction];
        });

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

        [$cr, $walletMember, $debitTxn] = DB::transaction(function () use ($request, $reason) {
            // Debit is always charged against the wallet member (parent for juniors).
            $walletMember = $this->lockWalletMember($request->memberId);

            if ((float) $walletMember->credit < (float) $request->amount) {
                abort(response()->json([
                    'message' => 'Insufficient member balance for this debit.',
                ], 400));
            }

            $cr = CreditRequest::create([
                'id' => 'c_' . Str::random(8),
                'member_id' => $request->memberId,
                'type' => 'debit',
                'amount' => $request->amount,
                'date' => substr(trim($request->date), 0, 10),
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
                'date' => $this->buildTransactionTimestamp($request->date),
            ]);

            return [$cr, $walletMember, $debitTxn];
        });

        try {
            MailHelper::sendTransactionEmail($walletMember, $debitTxn);
        } catch (\Exception $e) {
            logger()->error("Transaction debit email failed: " . $e->getMessage());
        }

        return response()->json($this->formatRequest($cr), 201);
    }

    private function storeExpense(Request $request, $user, bool $isAdmin)
    {
        if (!$isAdmin) {
            return response()->json(['message' => 'Only admins can record expenses.'], 403);
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

        $memberId = $request->input('memberId');

        $cr = DB::transaction(function () use ($request, $memberId, $reason) {
            $cr = CreditRequest::create([
                'id' => 'c_' . Str::random(8),
                'member_id' => $memberId,
                'type' => 'expense',
                'amount' => $request->amount,
                'date' => $request->date,
                'status' => 'approved',
                'reason' => $reason,
            ]);

            // Note: Expenses only log in ledger and do NOT deduct member balance.
            Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $memberId,
                'credit_request_id' => $cr->id,
                'type' => 'expense',
                'amount' => $request->amount,
                'description' => $reason,
                'reason' => $reason,
                'date' => $request->date,
            ]);

            return $cr;
        });

        return response()->json($this->formatRequest($cr), 201);
    }

    public function approve($id)
    {
        if ($response = PermissionHelper::requireAdminPermission(request(), 'credits.edit')) {
            return $response;
        }

        [$cr, $walletMember, $transaction] = DB::transaction(function () use ($id) {
            // Lock the request row so concurrent approvals cannot double-credit.
            $cr = CreditRequest::lockForUpdate()->findOrFail($id);

            if ($cr->type === 'debit') {
                abort(response()->json(['message' => 'Debit entries cannot be approved.'], 400));
            }

            if ($cr->status !== 'created') {
                abort(response()->json(['message' => 'Credit request already processed.'], 400));
            }

            $cr->status = 'approved';
            $cr->save();

            // Credit the wallet member (parent for juniors).
            $walletMember = $this->lockWalletMember($cr->member_id);
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

            return [$cr, $walletMember, $transaction];
        });

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

        return DB::transaction(function () use ($id) {
            $cr = CreditRequest::lockForUpdate()->findOrFail($id);

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
        });
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

        return DB::transaction(function () use ($id) {
            $cr = CreditRequest::lockForUpdate()->findOrFail($id);

            // Resolve wallet member for balance reversal (parent for juniors).
            $walletMember = null;
            if ($cr->status === 'approved') {
                // The transaction record holds the actual wallet member id used.
                $txn = Transaction::where('credit_request_id', $cr->id)->first();
                $walletMemberId = $txn ? $txn->member_id : $cr->member_id;
                $walletMember = $walletMemberId ? Member::lockForUpdate()->find($walletMemberId) : null;

                if ($walletMember) {
                    $type = $cr->type ?? 'credit';
                    if ($type === 'credit' || $type === 'refund') {
                        $newBalance = round((float) $walletMember->credit - (float) $cr->amount, 2);
                        if ($newBalance < 0) {
                            abort(response()->json([
                                'message' => 'Cannot reverse: insufficient remaining balance.',
                            ], 422));
                        }
                        $walletMember->credit = $newBalance;
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

    /**
     * Build the transaction datetime combining the selected date with the actual creation time
     * in the club's configured timezone.
     */
    private function buildTransactionTimestamp(string $dateString): \Carbon\Carbon
    {
        $tz = \App\Helpers\SessionTimingHelper::clubTimezone();
        $now = \App\Helpers\SessionTimingHelper::now();
        $dateOnly = substr(trim($dateString), 0, 10);

        try {
            return \Carbon\Carbon::createFromFormat('Y-m-d H:i:s', $dateOnly . ' ' . $now->format('H:i:s'), $tz);
        } catch (\Throwable $e) {
            return $now;
        }
    }

    private function formatRequest(CreditRequest|\stdClass $r)
    {
        $type = $r->type ?? 'credit';
        // Normalise: only valid types exposed to the frontend
        if (!in_array($type, ['credit', 'debit', 'refund', 'expense'])) {
            $type = 'credit';
        }

        $tz = \App\Helpers\SessionTimingHelper::clubTimezone();
        $createdAtIso = null;
        if (isset($r->created_at)) {
            if ($r->created_at instanceof \DateTimeInterface) {
                $createdAtIso = \Carbon\Carbon::instance($r->created_at)->setTimezone($tz)->toIso8601String();
            } elseif (is_string($r->created_at) && trim($r->created_at) !== '') {
                try {
                    $createdAtIso = \Carbon\Carbon::parse($r->created_at, $tz)->setTimezone($tz)->toIso8601String();
                } catch (\Throwable $e) {
                    $createdAtIso = null;
                }
            }
        }

        return [
            'id' => $r->id,
            'memberId' => $r->member_id,
            'amount' => (float)$r->amount,
            'date' => $r->date,
            'type' => $type,
            'status' => $r->status,
            'reason' => $r->reason,
            'createdAt' => $createdAtIso,
        ];
    }
}
