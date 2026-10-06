<?php

namespace App\Jobs;

use App\Helpers\MailHelper;
use App\Models\Member;
use App\Models\PlaySchedule;
use App\Models\Transaction;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

class SendPlayScheduleReleaseNotifications implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public string $scheduleId;
    public array $releaseNotifications;
    public array $transactionNotifications;

    /**
     * Create a new job instance.
     *
     * @param string $scheduleId
     * @param array $releaseNotifications Array of ['member_id' => ..., 'status' => ...]
     * @param array $transactionNotifications Array of ['wallet_member_id' => ..., 'transaction_id' => ...]
     */
    public function __construct(string $scheduleId, array $releaseNotifications = [], array $transactionNotifications = [])
    {
        $this->scheduleId = $scheduleId;
        $this->releaseNotifications = $releaseNotifications;
        $this->transactionNotifications = $transactionNotifications;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        $schedule = PlaySchedule::find($this->scheduleId);
        if (!$schedule) {
            return;
        }

        // Apply SMTP settings once upfront if applicable
        MailHelper::applySmtpSettings();

        // 1. Send schedule release notifications
        foreach ($this->releaseNotifications as $notif) {
            $memberId = $notif['member_id'] ?? null;
            $status = $notif['status'] ?? 'open';
            if (!$memberId) {
                continue;
            }

            $member = Member::find($memberId);
            if (!$member || empty($member->email)) {
                continue;
            }

            try {
                MailHelper::sendScheduleNotification($member, $schedule, $status, 'release');
            } catch (\Throwable $e) {
                logger()->error("Background schedule release email failed for member {$memberId}: " . $e->getMessage());
            }
        }

        // 2. Send transaction debit notifications for auto-accepted players
        foreach ($this->transactionNotifications as $txNotif) {
            $walletMemberId = $txNotif['wallet_member_id'] ?? null;
            $transactionId = $txNotif['transaction_id'] ?? null;
            if (!$walletMemberId || !$transactionId) {
                continue;
            }

            $walletMember = Member::find($walletMemberId);
            $transaction = Transaction::find($transactionId);
            if (!$walletMember || !$transaction || empty($walletMember->email)) {
                continue;
            }

            try {
                MailHelper::sendTransactionEmail($walletMember, $transaction);
            } catch (\Throwable $e) {
                logger()->error("Background transaction email failed for member {$walletMemberId}: " . $e->getMessage());
            }
        }
    }
}
