<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CreditRequest;
use App\Models\Member;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TransactionController extends Controller
{
    public function index()
    {
        $txs = Transaction::orderBy('date', 'desc')->get();
        return response()->json($txs->map(fn($t) => [
            'id' => $t->id,
            'memberId' => $t->member_id,
            'type' => $t->type,
            'amount' => (float)$t->amount,
            'description' => $t->description,
            'reason' => $t->reason ?? ($t->type === 'debit' ? $t->description : null),
            'date' => $t->date,
        ]));
    }

    public function destroy(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'admin') {
            return response()->json(['message' => 'Only admins can delete transactions.'], 403);
        }

        return DB::transaction(function () use ($id) {
            $txn = Transaction::findOrFail($id);
            $member = Member::lockForUpdate()->find($txn->member_id);

            if ($member) {
                if ($txn->type === 'credit') {
                    $member->credit -= (float) $txn->amount;
                } else if ($txn->type === 'debit') {
                    $member->credit += (float) $txn->amount;
                }
                $member->save();
            }

            // Find corresponding credit request record
            $cr = null;
            if ($txn->credit_request_id) {
                $cr = CreditRequest::find($txn->credit_request_id);
            }
            if (!$cr) {
                $cr = CreditRequest::where('member_id', $txn->member_id)
                    ->where('type', $txn->type)
                    ->where('amount', $txn->amount)
                    ->where('status', 'approved')
                    ->orderBy('created_at', 'desc')
                    ->first();
            }
            if ($cr) {
                $cr->delete();
            }

            $txn->delete();

            return response()->json([
                'message' => 'Transaction deleted and reversed successfully.',
                'memberCredit' => $member ? (float) $member->credit : 0,
            ]);
        });
    }
}
