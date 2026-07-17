<?php

use App\Helpers\FeeHelper;
use App\Models\Member;
use App\Models\PlayInvitation;
use App\Models\PlaySchedule;
use App\Models\Transaction;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Backfill: charge session fees for invites that were already accepted
 * before debit-on-accept existed (debited = false).
 */
return new class extends Migration
{
    public function up(): void
    {
        $invites = PlayInvitation::query()
            ->where('status', 'accepted')
            ->where('debited', false)
            ->get();

        foreach ($invites as $invite) {
            if (is_string($invite->member_id) && str_starts_with($invite->member_id, 'guest_')) {
                $invite->debited = true;
                $invite->save();
                continue;
            }

            $schedule = PlaySchedule::find($invite->schedule_id);
            if (!$schedule) {
                continue;
            }

            // Skip fully closed historical sessions that were never billed —
            // only charge open/released/rotated/published (still relevant).
            if (!in_array($schedule->status, ['open', 'released', 'rotated', 'published'], true)) {
                continue;
            }

            DB::transaction(function () use ($invite, $schedule) {
                $invite->refresh();
                if ($invite->debited || $invite->status !== 'accepted') {
                    return;
                }

                $member = Member::find($invite->member_id);
                if (!$member) {
                    return;
                }

                $fee = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);

                if (!$member->skip_credit_consumption && $fee > 0) {
                    // Allow going negative so existing acceptances are billed
                    $member->credit -= $fee;
                    $member->save();

                    Transaction::create([
                        'id' => 't_' . Str::random(8),
                        'member_id' => $member->id,
                        'type' => 'debit',
                        'amount' => $fee,
                        'description' => 'Play session (backfill): ' . $schedule->name,
                        'date' => now(),
                    ]);

                    Log::info("Backfilled play debit for invite {$invite->id}, member {$member->id}, fee {$fee}");
                }

                if (!$invite->accepted_at) {
                    $invite->accepted_at = $invite->updated_at ?? now();
                }
                $invite->debited = true;
                $invite->save();
            });
        }
    }

    public function down(): void
    {
        // Irreversible data backfill — do not auto-refund.
    }
};
