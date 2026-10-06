<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use App\Models\PlayInvitation;
use App\Models\PlaySchedule;
use App\Models\Member;
use App\Models\Transaction;
use App\Helpers\FeeHelper;
use App\Helpers\WalletHelper;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Deduplicate any existing duplicate play invitations
        $duplicates = DB::table('play_invitations')
            ->select('schedule_id', 'member_id', DB::raw('COUNT(*) as total'))
            ->groupBy('schedule_id', 'member_id')
            ->having('total', '>', 1)
            ->get();

        foreach ($duplicates as $dup) {
            $rows = PlayInvitation::where('schedule_id', $dup->schedule_id)
                ->where('member_id', $dup->member_id)
                ->orderByRaw("CASE WHEN status = 'accepted' THEN 1 WHEN status = 'waiting' THEN 2 WHEN status = 'open' THEN 3 ELSE 4 END")
                ->orderBy('created_at', 'asc')
                ->orderBy('id', 'asc')
                ->get();

            if ($rows->count() <= 1) {
                continue;
            }

            // Keep the primary record
            $primary = $rows->shift();

            foreach ($rows as $extra) {
                // If the extra duplicate was debited and accepted, issue a refund
                if ($extra->debited && $extra->status === 'accepted') {
                    $sch = PlaySchedule::find($dup->schedule_id);
                    $member = Member::find($dup->member_id);
                    if ($sch && $member && !$member->skip_credit_consumption) {
                        $memberFee = FeeHelper::playSessionFee((float) $sch->session_rate, 0, 1, $member);
                        if ($memberFee > 0) {
                            $walletMember = WalletHelper::resolveMember($member);
                            $walletMember->credit = round($walletMember->credit + $memberFee, 2);
                            $walletMember->saveQuietly();

                            Transaction::create([
                                'id' => 't_' . Str::random(8),
                                'member_id' => $walletMember->id,
                                'type' => 'refund',
                                'amount' => $memberFee,
                                'description' => 'Refund — duplicate play session invitation: ' . $sch->name . ' - ' . $member->name,
                                'date' => now(),
                            ]);
                        }
                    }
                }
                $extra->delete();
            }
        }

        // 2. Add unique constraint to prevent duplicates in the future
        Schema::table('play_invitations', function (Blueprint $table) {
            $table->unique(['schedule_id', 'member_id'], 'play_invitations_schedule_member_unique');
        });
    }

    public function down(): void
    {
        Schema::table('play_invitations', function (Blueprint $table) {
            $table->dropUnique('play_invitations_schedule_member_unique');
        });
    }
};
