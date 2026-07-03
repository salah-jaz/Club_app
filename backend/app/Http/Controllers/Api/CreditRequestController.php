<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CreditRequest;
use App\Models\Member;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

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
        ]);

        $cr = CreditRequest::create([
            'id' => 'c_' . Str::random(8),
            'member_id' => $request->memberId,
            'amount' => $request->amount,
            'date' => $request->date,
            'status' => 'created',
        ]);

        return response()->json($this->formatRequest($cr), 201);
    }

    public function approve($id)
    {
        $cr = CreditRequest::findOrFail($id);

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
        Transaction::create([
            'id' => 't_' . Str::random(8),
            'member_id' => $cr->member_id,
            'type' => 'credit',
            'amount' => $cr->amount,
            'description' => 'Credit top-up approved',
            'date' => now(),
        ]);

        return response()->json([
            'message' => 'Credit request approved.',
            'request' => $this->formatRequest($cr),
            'memberCredit' => $member->credit
        ]);
    }

    public function reject($id)
    {
        $cr = CreditRequest::findOrFail($id);

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
            'status' => $r->status,
            'createdAt' => $r->created_at->toISOString(),
        ];
    }
}
