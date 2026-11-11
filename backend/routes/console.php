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

    $schedules = PlaySchedule::whereIn('status', ['released', 'rotated', 'published'])
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

        // Reuse the controller's debit logic (FeeHelper, wallet locks, league skip, skip_credit,
        // 'Play session: ...' description). Non-league members with insufficient credit stay undebited.
        $controller = app(\App\Http\Controllers\Api\PlayScheduleController::class);

        foreach ($undebitedAcceptedInvs as $inv) {
            /** @var PlayInvitation $inv */
            try {
                $controller->debitPlayInvite($schedule, $inv);
            } catch (\Throwable $e) {
                logger()->error("Auto debit failed for play invite {$inv->id}: " . $e->getMessage());
            }
        }
    }
})->purpose('Safety net: debit any accepted play invites that were not charged on accept')->everyMinute();

Artisan::command('schedules:auto-publish', function () {
    \App\Helpers\SessionTimingHelper::applyClubTimezone();
    \App\Http\Controllers\Api\PlayScheduleController::processAutoPublishAndRotation();
})->purpose('Automatically publish schedule and generate player court rotation when Cancellation Lock Window is reached')->everyMinute();
