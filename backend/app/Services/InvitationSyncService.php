<?php

namespace App\Services;

use App\Models\Member;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\TrainingDate;
use App\Models\TrainingUpdateRequest;
use App\Models\Transaction;
use App\Helpers\FeeHelper;
use App\Helpers\MailHelper;
use App\Helpers\WalletHelper;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InvitationSyncService
{
    private static bool $isSyncing = false;

    /**
     * Synchronize invitations for a specific member across all active Play Schedules and Training Programs.
     */
    public static function syncMemberInvitations(Member $member): void
    {
        if (self::$isSyncing) {
            return;
        }

        self::$isSyncing = true;

        try {
            self::syncMemberPlayInvitations($member);
            self::syncMemberTrainingInvitations($member);
        } finally {
            self::$isSyncing = false;
        }
    }

    /**
     * Synchronize Play Schedule invitations for a member.
     */
    public static function syncMemberPlayInvitations(Member $member): void
    {
        $schedules = PlaySchedule::whereIn('status', ['released', 'open'])->get();

        foreach ($schedules as $sch) {
            $isEligible = false;

            if ($member->status === 'active') {
                if ($member->member_type === 'adult') {
                    if ((bool) $member->membership) {
                        if ($sch->is_league_match && !empty($sch->league_group_ids)) {
                            $inLeague = DB::table('league_group_member')
                                ->whereIn('league_group_id', $sch->league_group_ids)
                                ->where('member_id', $member->id)
                                ->exists();
                            $isEligible = $inLeague;
                        } else {
                            $isEligible = true;
                        }
                    }
                } elseif ($member->member_type === 'junior') {
                    if (!(bool) $sch->is_league_match && (bool) $member->play_eligible) {
                        $isEligible = true;
                    }
                }
            }

            $invite = PlayInvitation::where('schedule_id', $sch->id)
                ->where('member_id', $member->id)
                ->first();

            if ($isEligible) {
                if (!$invite) {
                    PlayInvitation::create([
                        'id' => 'pi_' . Str::random(8),
                        'schedule_id' => $sch->id,
                        'member_id' => $member->id,
                        'status' => 'open',
                        'accepted_at' => null,
                        'debited' => false,
                    ]);
                }
            } else {
                if ($invite) {
                    $wasAccepted = $invite->status === 'accepted';

                    if ($wasAccepted) {
                        self::refundPlayInvite($sch, $invite, $member);
                    }

                    $invite->delete();

                    if ($wasAccepted) {
                        self::promoteNextWaitingPlayMember($sch);
                    }
                }
            }
        }
    }

    /**
     * Synchronize Training Program invitations for a member.
     */
    public static function syncMemberTrainingInvitations(Member $member): void
    {
        $trainings = Training::whereIn('status', ['released', 'open', 'created'])->get();

        foreach ($trainings as $tr) {
            $targetType = strtolower($tr->target_type ?? 'junior');
            $isEligible = false;

            if ($member->status === 'active') {
                if ($targetType === 'adult') {
                    if ($member->member_type === 'adult' && (bool) $member->training_eligible) {
                        $isEligible = true;
                    }
                } else {
                    if ($member->member_type === 'junior' && (bool) $member->training_eligible) {
                        $isEligible = true;
                    }
                }
            }

            $invite = TrainingInvitation::where('training_id', $tr->id)
                ->where('member_id', $member->id)
                ->first();

            if ($isEligible) {
                if (!$invite) {
                    $parentId = $tr->parent_id ?: $tr->id;
                    $series = Training::where('parent_id', $parentId)
                        ->orWhere('id', $parentId)
                        ->orderBy('start_date', 'asc')
                        ->get();

                    $idx = $series->search(fn($item) => $item->id === $tr->id);
                    if ($idx === false) $idx = 0;

                    $repeatWeeks = max(1, (int)($tr->repeat_weeks ?? 3));
                    $monthIndex = intdiv($idx, $repeatWeeks);
                    $monthSessions = $series->slice($monthIndex * $repeatWeeks, $repeatWeeks);
                    $monthSessionIds = $monthSessions->pluck('id')->all();

                    $hasConfiguredInvites = TrainingInvitation::whereIn('training_id', $monthSessionIds)
                        ->where('member_id', $member->id)
                        ->whereIn('status', ['open', 'accepted', 'waiting', 'declined'])
                        ->exists();

                    if (!$hasConfiguredInvites) {
                        $snapshot = TrainingInvitation::getSnapshotData($tr, $member);
                        TrainingInvitation::create(array_merge([
                            'id' => 'ti_' . Str::random(8),
                            'training_id' => $tr->id,
                            'member_id' => $member->id,
                            'status' => 'pending',
                        ], $snapshot));
                    }
                }
            } else {
                if ($invite) {
                    if ($invite->status === 'accepted') {
                        self::cancelAndRefundTrainingEnrollment($tr, $member);
                    } else {
                        TrainingUpdateRequest::where('member_id', $member->id)
                            ->where('training_id', $tr->id)
                            ->delete();
                        TrainingDate::where('member_id', $member->id)
                            ->where('training_id', $tr->id)
                            ->delete();
                        $invite->delete();
                    }
                }
            }
        }
    }

    /**
     * Synchronize invitations for a single training program across all active eligible members.
     */
    public static function syncTrainingInvitationsForProgram(Training $tr): void
    {
        $targetType = strtolower($tr->target_type ?? 'junior');
        $eligibleMembers = Member::where('status', 'active')
            ->where('member_type', $targetType)
            ->where('training_eligible', true)
            ->get();

        $parentId = $tr->parent_id ?: $tr->id;
        $series = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();

        $idx = $series->search(fn($item) => $item->id === $tr->id);
        if ($idx === false) $idx = 0;

        $repeatWeeks = max(1, (int)($tr->repeat_weeks ?? 3));
        $monthIndex = intdiv($idx, $repeatWeeks);
        $monthSessions = $series->slice($monthIndex * $repeatWeeks, $repeatWeeks);
        $monthSessionIds = $monthSessions->pluck('id')->all();

        foreach ($eligibleMembers as $member) {
            $invite = TrainingInvitation::where('training_id', $tr->id)
                ->where('member_id', $member->id)
                ->first();

            if (!$invite) {
                $hasConfiguredInvites = TrainingInvitation::whereIn('training_id', $monthSessionIds)
                    ->where('member_id', $member->id)
                    ->whereIn('status', ['open', 'accepted', 'waiting', 'declined'])
                    ->exists();

                if (!$hasConfiguredInvites) {
                    $snapshot = TrainingInvitation::getSnapshotData($tr, $member);
                    TrainingInvitation::create(array_merge([
                        'id' => 'ti_' . Str::random(8),
                        'training_id' => $tr->id,
                        'member_id' => $member->id,
                        'status' => 'pending',
                    ], $snapshot));
                }
            }
        }

        // Clean up any invitations for members who are NOT eligible
        $allInvs = TrainingInvitation::where('training_id', $tr->id)->get();
        foreach ($allInvs as $inv) {
            $m = Member::find($inv->member_id);
            if (!$m || $m->status !== 'active' || $m->member_type !== $targetType || !(bool) $m->training_eligible) {
                if ($inv->status === 'accepted' && $m) {
                    self::cancelAndRefundTrainingEnrollment($tr, $m);
                } else {
                    TrainingUpdateRequest::where('member_id', $inv->member_id)
                        ->where('training_id', $tr->id)
                        ->delete();
                    TrainingDate::where('member_id', $inv->member_id)
                        ->where('training_id', $tr->id)
                        ->delete();
                    $inv->delete();
                }
            }
        }
    }

    /**
     * Synchronize all active Training Program invitations across all members.
     */
    public static function syncAllTrainingInvitations(): void
    {
        $trainings = Training::whereIn('status', ['released', 'open', 'created'])->get();
        foreach ($trainings as $tr) {
            self::syncTrainingInvitationsForProgram($tr);
        }
    }

    /**
     * Refund play session fee when a member becomes ineligible after acceptance.
     */
    private static function refundPlayInvite(PlaySchedule $schedule, PlayInvitation $invite, Member $member): void
    {
        if (!$invite->debited) {
            return;
        }

        if ($member->skip_credit_consumption || self::memberSkipsLeagueFee($schedule, $member->id)) {
            return;
        }

        $memberFee = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);
        if ($memberFee > 0) {
            $walletMember = WalletHelper::resolveMember($member);
            $walletMember->credit = round($walletMember->credit + $memberFee, 2);
            $walletMember->saveQuietly();

            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $walletMember->id,
                'type' => 'refund',
                'amount' => $memberFee,
                'description' => 'Refund — cancelled play session: ' . $schedule->name,
                'date' => now(),
            ]);

            try {
                MailHelper::sendTransactionEmail($walletMember, $transaction);
            } catch (\Exception $e) {
                logger()->error("Transaction refund email failed for member {$walletMember->id}: " . $e->getMessage());
            }
        }
    }

    private static function memberSkipsLeagueFee(PlaySchedule $schedule, string $memberId): bool
    {
        if (!(bool) $schedule->is_league_match || empty($schedule->league_group_ids)) {
            return false;
        }
        $groupPositions = DB::table('league_group_member')
            ->whereIn('league_group_id', $schedule->league_group_ids)
            ->where('member_id', $memberId)
            ->pluck('position')
            ->toArray();
        foreach ($groupPositions as $pos) {
            if (in_array((int) $pos, [1, 2], true)) {
                return true;
            }
        }
        return false;
    }

    private static function promoteNextWaitingPlayMember(PlaySchedule $sch): void
    {
        $next = PlayInvitation::where('schedule_id', $sch->id)
            ->where('status', 'waiting')
            ->orderBy('updated_at', 'asc')
            ->orderBy('id', 'asc')
            ->first();

        if ($next) {
            $nextMember = Member::find($next->member_id);
            if (
                $nextMember
                && !$nextMember->skip_credit_consumption
                && !self::memberSkipsLeagueFee($sch, $nextMember->id)
                && !(bool) $sch->is_league_match
            ) {
                $estimatedFee = FeeHelper::playSessionFee((float) $sch->session_rate, 0, 1, $nextMember);
                $walletMember = WalletHelper::resolveMember($nextMember);
                if ($walletMember->credit < $estimatedFee) {
                    $next = null;
                }
            }

            if ($next) {
                $next->status = 'accepted';
                $next->accepted_at = now();
                $next->save();

                self::debitPlayInvite($sch, $next);
            }
        }
    }

    private static function debitPlayInvite(PlaySchedule $schedule, PlayInvitation $invite): void
    {
        $invite->refresh();
        if ($invite->debited || $invite->status !== 'accepted') {
            return;
        }

        $member = Member::find($invite->member_id);
        if (!$member) {
            return;
        }

        if (self::memberSkipsLeagueFee($schedule, $member->id)) {
            $invite->debited = true;
            $invite->save();
            return;
        }

        $memberFee = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);
        $isLeague = (bool) $schedule->is_league_match;
        $walletMember = WalletHelper::resolveMember($member);

        if (!$walletMember->skip_credit_consumption && $memberFee > 0) {
            if (!$isLeague && $walletMember->credit < $memberFee) {
                return;
            }
            $walletMember->credit = round($walletMember->credit - $memberFee, 2);
            $walletMember->saveQuietly();

            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $walletMember->id,
                'type' => 'debit',
                'amount' => $memberFee,
                'description' => 'Play session: ' . $schedule->name,
                'date' => now(),
            ]);

            try {
                MailHelper::sendTransactionEmail($walletMember, $transaction);
            } catch (\Exception $e) {
                logger()->error("Transaction debit email failed for member {$walletMember->id}: " . $e->getMessage());
            }
        }

        $invite->debited = true;
        $invite->save();
    }

    /**
     * Cancel training enrollment and refund remaining eligible amount when eligibility is disabled.
     */
    private static function cancelAndRefundTrainingEnrollment(Training $tr, Member $member): void
    {
        $parentId = $tr->parent_id ?: $tr->id;

        $seriesSessionIds = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->pluck('id')
            ->all();

        // 1. Calculate total deducted amount for this member across this training series
        $acceptedSeriesInvites = TrainingInvitation::whereIn('training_id', $seriesSessionIds)
            ->where('member_id', $member->id)
            ->where('status', 'accepted')
            ->get();

        $calculatedDeducted = 0.0;
        foreach ($acceptedSeriesInvites as $accInv) {
            if ($accInv->accepted_amount !== null) {
                $calculatedDeducted += (float) $accInv->accepted_amount;
            } else {
                $trSession = Training::find($accInv->training_id);
                if ($trSession) {
                    $repeatWeeks = max(1, (int) ($trSession->repeat_weeks ?? 1));
                    $discountedMonthlyFee = FeeHelper::forMember((float) $trSession->fees, $member);
                    $calculatedDeducted += round($discountedMonthlyFee / $repeatWeeks, 2);
                }
            }
        }

        $walletMember = WalletHelper::resolveMember($member);
        $baseName = trim(explode(' - Week', $tr->name)[0]);
        $cleanBaseName = trim(preg_replace('/ \(\d+\)$/', '', $baseName));

        $debitSum = (float) Transaction::where('member_id', $walletMember->id)
            ->where('type', 'debit')
            ->where(function ($q) use ($tr, $cleanBaseName) {
                $q->where('description', 'like', '%' . $tr->name . '%')
                    ->orWhere('description', 'like', '%' . $cleanBaseName . '%')
                    ->orWhere('description', 'like', 'Training%');
            })
            ->sum('amount');

        $totalDeducted = max($calculatedDeducted, $debitSum);

        // 2. Attendance Refunds Already Approved
        $tdAttendanceRefunds = TrainingDate::whereIn('training_id', $seriesSessionIds)
            ->where('member_id', $member->id)
            ->whereNotNull('refund_amount')
            ->sum('refund_amount');

        $txnAttendanceRefunds = Transaction::where('member_id', $walletMember->id)
            ->whereIn('type', Transaction::inflowTypes())
            ->where('description', 'like', 'Training session absent%')
            ->where(function ($q) use ($tr, $cleanBaseName) {
                $q->where('description', 'like', '%' . $tr->name . '%')
                    ->orWhere('description', 'like', '%' . $cleanBaseName . '%');
            })
            ->sum('amount');

        $alreadyRefundedAttendance = max((float) $tdAttendanceRefunds, (float) $txnAttendanceRefunds);

        // 3. Previous Cancellation Refunds Already Issued
        $alreadyRefundedCancellation = (float) Transaction::where('member_id', $walletMember->id)
            ->whereIn('type', Transaction::inflowTypes())
            ->where(function ($q) {
                $q->where('description', 'like', 'Refund — cancelled training session%')
                    ->orWhere('description', 'like', 'Refund — deleted training session%');
            })
            ->where(function ($q) use ($tr, $cleanBaseName) {
                $q->where('description', 'like', '%' . $tr->name . '%')
                    ->orWhere('description', 'like', '%' . $cleanBaseName . '%');
            })
            ->sum('amount');

        // 4. Remaining Refund
        $remainingRefund = round($totalDeducted - $alreadyRefundedAttendance - $alreadyRefundedCancellation, 2);

        if ($remainingRefund > 0 && !$walletMember->skip_credit_consumption) {
            $walletMember->credit = round($walletMember->credit + $remainingRefund, 2);
            $walletMember->saveQuietly();

            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $walletMember->id,
                'type' => 'refund',
                'amount' => $remainingRefund,
                'description' => 'Refund — cancelled training session: ' . $tr->name,
                'date' => now(),
            ]);

            try {
                MailHelper::sendTransactionEmail($walletMember, $transaction);
            } catch (\Exception $e) {
                logger()->error("Transaction refund email failed for member {$walletMember->id}: " . $e->getMessage());
            }
        }

        // 5. Remove attendance records that have not yet occurred
        TrainingDate::where('member_id', $member->id)
            ->whereIn('training_id', $seriesSessionIds)
            ->where(function ($q) {
                $q->where('date', '>', now()->toDateTimeString())
                    ->orWhere('attended', false);
            })
            ->delete();

        // 6. Delete pending update requests
        TrainingUpdateRequest::where('member_id', $member->id)
            ->whereIn('training_id', $seriesSessionIds)
            ->delete();

        // 7. Remove training invitations for this member across the series
        TrainingInvitation::whereIn('training_id', $seriesSessionIds)
            ->where('member_id', $member->id)
            ->delete();
    }
}

