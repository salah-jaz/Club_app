<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        // Find all junior members who have a non-zero credit balance and a known parent.
        $juniors = DB::table('members')
            ->where('member_type', 'junior')
            ->where('credit', '>', 0)
            ->whereNotNull('parent_member_id')
            ->get();

        foreach ($juniors as $junior) {
            $parent = DB::table('members')
                ->where('id', $junior->parent_member_id)
                ->lockForUpdate()
                ->first();

            if (!$parent) {
                continue;
            }

            $transfer = (float) $junior->credit;

            // Credit the parent
            DB::table('members')
                ->where('id', $parent->id)
                ->update(['credit' => round($parent->credit + $transfer, 2)]);

            // Zero out the junior
            DB::table('members')
                ->where('id', $junior->id)
                ->update(['credit' => 0.00]);

            // Create a ledger transaction on the parent for auditability
            DB::table('transactions')->insert([
                'id'          => 't_' . Str::random(8),
                'member_id'   => $parent->id,
                'type'        => 'credit',
                'amount'      => $transfer,
                'description' => 'Wallet migration: credit transferred from junior member '
                    . trim($junior->first_name . ' ' . $junior->last_name)
                    . ' (' . $junior->id . ') to shared family wallet.',
                'date'        => now(),
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
        }
    }

    public function down(): void
    {
        // This migration is intentionally not reversible because the
        // original per-junior balances cannot be reconstructed reliably.
    }
};
