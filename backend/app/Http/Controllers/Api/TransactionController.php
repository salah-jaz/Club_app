<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Transaction;

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
            'date' => $t->date,
        ]));
    }
}
