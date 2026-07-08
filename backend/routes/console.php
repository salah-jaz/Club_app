<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\Member;
use App\Models\Transaction;
use App\Models\Setting;
use App\Helpers\MailHelper;
use Illuminate\Support\Str;
use Carbon\Carbon;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote')->hourly();

Artisan::command('debit:cancellations', function () {
    $debitTimingSetting = Setting::where('key', 'debit_timing_hours')->first();
    $debitTimingHours = $debitTimingSetting ? (int)$debitTimingSetting->value : 24;

    $now = Carbon::now();
    $targetTime = Carbon::now()->addHours($debitTimingHours);

    $schedules = PlaySchedule::whereIn('status', ['released', 'open'])
        ->where('date', '>=', $now)
        ->where('date', '<=', $targetTime)
        ->get();

    foreach ($schedules as $schedule) {
        $invitations = PlayInvitation::where('schedule_id', $schedule->id)->get();
        $acceptedInvs = $invitations->where('status', 'accepted');
        $undebitedAcceptedInvs = $acceptedInvs->where('debited', false);

        if ($undebitedAcceptedInvs->isEmpty()) {
            continue;
        }

        $playerCount = max($acceptedInvs->count(), 1);
        $fee = $schedule->session_rate + ($schedule->hall_rate / $playerCount);
        $feeRounded = round($fee, 2);

        foreach ($undebitedAcceptedInvs as $inv) {
            $member = Member::find($inv->member_id);
            if ($member) {
                if (!$member->skip_credit_consumption) {
                    $member->credit -= $feeRounded;
                    $member->save();

                    $transaction = Transaction::create([
                        'id' => 't_' . Str::random(8),
                        'member_id' => $member->id,
                        'type' => 'debit',
                        'amount' => $feeRounded,
                        'description' => "Auto Debit - Play session: " . $schedule->name,
                        'date' => now(),
                    ]);

                    try {
                        MailHelper::sendTransactionEmail($member, $transaction);
                    } catch (\Exception $e) {
                        logger()->error("Transaction auto-debit email failed for member {$member->id}: " . $e->getMessage());
                    }
                }
            }
            $inv->debited = true;
            $inv->save();
        }
    }
})->purpose('Auto-debit play session fee when cancellation window starts')->everyMinute();
