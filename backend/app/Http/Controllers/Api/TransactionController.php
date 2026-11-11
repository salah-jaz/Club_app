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

class TransactionController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $query = Transaction::query();

        if ($user->role === 'admin') {
            if ($response = PermissionHelper::requireAdminPermission($request, 'transactions.view')) {
                return $response;
            }
        } else {
            // Members see ledger entries for their family plus the shared wallet
            // (parent) of any junior in their family. Entries with no member are admin-only.
            $familyIds = FamilyScopeHelper::familyMemberIds($user);
            $walletParentIds = empty($familyIds)
                ? []
                : Member::whereIn('id', $familyIds)
                    ->whereNotNull('parent_member_id')
                    ->pluck('parent_member_id')
                    ->all();
            $visibleIds = array_values(array_unique(array_merge($familyIds, $walletParentIds)));
            $query->whereIn('member_id', $visibleIds);
        }

        $tz = \App\Helpers\SessionTimingHelper::clubTimezone();
        $txs = $query->orderBy('date', 'desc')->get();
        return response()->json($txs->map(function ($t) use ($tz) {
            $dateVal = $t->date;
            if ($dateVal instanceof \DateTimeInterface) {
                $dateVal = \Carbon\Carbon::instance($dateVal)->setTimezone($tz)->toIso8601String();
            } elseif (is_string($dateVal) && trim($dateVal) !== '') {
                try {
                    $dateVal = \Carbon\Carbon::parse($dateVal, $tz)->setTimezone($tz)->toIso8601String();
                } catch (\Throwable $e) {
                    // keep original string
                }
            }
            return [
                'id' => $t->id,
                'memberId' => $t->member_id,
                'type' => $t->resolvedType(),
                'amount' => (float)$t->amount,
                'description' => $t->description,
                'reason' => $t->reason ?? ($t->type === 'debit' ? $t->description : null),
                'date' => $dateVal,
            ];
        }));
    }

    public function destroy(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'transactions.delete')) {
            return $response;
        }

        $user = $request->user();
        if (!$user || $user->role !== 'admin') {
            return response()->json(['message' => 'Only admins can delete transactions.'], 403);
        }

        $txn = Transaction::findOrFail($id);

        // Only expense ledger entries may be deleted from the transactions module.
        // Strict type check: legacy credit/refund rows whose description merely mentions
        // "expense" must never be deleted here (that would orphan wallet balance).
        if ($txn->type !== 'expense') {
            return response()->json([
                'message' => 'Only expense transactions can be deleted.',
            ], 403);
        }

        return DB::transaction(function () use ($id) {
            $txn = Transaction::lockForUpdate()->findOrFail($id);

            if ($txn->type !== 'expense') {
                abort(response()->json([
                    'message' => 'Only expense transactions can be deleted.',
                ], 403));
            }

            // Expenses are ledger-only and never touch any wallet balance, so there is
            // nothing to reverse. Delete only the credit request explicitly linked to
            // this transaction (never match unrelated requests by amount/member).
            if ($txn->credit_request_id) {
                $cr = CreditRequest::lockForUpdate()->find($txn->credit_request_id);
                if ($cr && $cr->type === 'expense') {
                    $cr->delete();
                }
            }

            $txn->delete();

            return response()->json([
                'message' => 'Transaction deleted successfully.',
            ]);
        });
    }
}