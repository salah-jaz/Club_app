<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\Member;
use App\Models\Transaction;
use App\Models\Setting;
use App\Helpers\MailHelper;
use App\Helpers\FeeHelper;
use App\Helpers\WalletHelper;
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

        $fee = $schedule->session_rate;
        $feeRounded = round($fee, 2);

        foreach ($undebitedAcceptedInvs as $inv) {
            $member = Member::find($inv->member_id);
            if ($member) {
                $memberFee = FeeHelper::forMember($feeRounded, $member);
                $walletMember = WalletHelper::resolveMember($member);
                if (!$walletMember->skip_credit_consumption && $memberFee > 0) {
                    $walletMember->credit -= $memberFee;
                    $walletMember->save();

                    $transaction = Transaction::create([
                        'id' => 't_' . Str::random(8),
                        'member_id' => $walletMember->id,
                        'type' => 'debit',
                        'amount' => $memberFee,
                        'description' => "Auto Debit - Play session: " . $schedule->name,
                        'date' => now(),
                    ]);

                    try {
                        MailHelper::sendTransactionEmail($walletMember, $transaction);
                    } catch (\Exception $e) {
                        logger()->error("Transaction auto-debit email failed for member {$walletMember->id}: " . $e->getMessage());
                    }
                }
            }
            $inv->debited = true;
            $inv->save();
        }
    }
})->purpose('Safety net: debit any accepted play invites that were not charged on accept')->everyMinute();
