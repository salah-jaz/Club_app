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
        // Ensure no invitations exist for unreleased ('open') schedules
        $openScheduleIds = PlaySchedule::where('status', 'open')->pluck('id');
        if ($openScheduleIds->isNotEmpty()) {
            PlayInvitation::whereIn('schedule_id', $openScheduleIds)->delete();
        }

        $schedules = PlaySchedule::whereIn('status', ['released', 'rotated', 'published'])->get();

        foreach ($schedules as $sch) {
            $isEligible = \App\Http\Controllers\Api\PlayScheduleController::isMemberEligibleForSchedule($member, $sch);

            $invites = PlayInvitation::where('schedule_id', $sch->id)
                ->where('member_id', $member->id)
                ->get();

            // Deduplicate if multiple records exist for this member in this schedule
            if ($invites->count() > 1) {
                $accepted = $invites->firstWhere('status', 'accepted');
                $keep = $accepted ?: $invites->first();
                foreach ($invites as $dup) {
                    if ($dup->id !== $keep->id) {
                        if ($dup->debited && $dup->status === 'accepted') {
                            self::refundPlayInvite($sch, $dup, $member);
                        }
                        $dup->delete();
                    }
                }
                $invite = $keep;
            } else {
                $invite = $invites->first();
            }

            if ($isEligible) {
                if (!$invite) {
                    try {
                        PlayInvitation::create([
                            'id' => 'pi_' . Str::random(8),
                            'schedule_id' => $sch->id,
                            'member_id' => $member->id,
                            'status' => 'open',
                            'accepted_at' => null,
                            'debited' => false,
                        ]);
                    } catch (\Throwable $e) {
                        // Unique constraint safely prevents duplicates
                    }
                }
            } else {
                if (!(bool) $member->membership) {
                    // If Club Membership is turned OFF after an invitation exists, preserve it
                    // without silently deleting financial, attendance, or transaction history.
                    // Further acceptance and restricted session access are enforced at API level.
                    continue;
                }

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
            $parentId = $tr->parent_id ?: $tr->id;
            $parentTr = ($parentId === $tr->id) ? $tr : Training::find($parentId);
            $targetType = strtolower($parentTr?->target_type ?? $tr->target_type ?? 'junior');
            if ($tr->target_type !== $targetType) {
                $tr->target_type = $targetType;
                $tr->save();
            }
            $isEligible = false;

            if ($member->status === 'active') {
                if ($targetType === 'adult') {
                    if ($member->member_type === 'adult' && (bool) $member->training_eligible) {
                        if ($tr->is_group_training && !empty($tr->league_group_ids)) {
                            $inGroup = DB::table('league_group_member')
                                ->whereIn('league_group_id', $tr->league_group_ids)
                                ->where('member_id', $member->id)
                                ->exists();
                            $isEligible = $inGroup;
                        } else {
                            $isEligible = true;
                        }
                    }
                } else {
                    if ($member->member_type === 'junior' && (bool) $member->training_eligible) {
                        if ($tr->is_group_training && !empty($tr->league_group_ids)) {
                            $inGroup = DB::table('league_group_member')
                                ->whereIn('league_group_id', $tr->league_group_ids)
                                ->where('member_id', $member->id)
                                ->exists();
                            $isEligible = $inGroup;
                        } else {
                            $isEligible = true;
                        }
                    }
                }
            }

            $invite = TrainingInvitation::where('training_id', $tr->id)
                ->where('member_id', $member->id)
                ->first();

            if ($isEligible) {
                $parentId = $tr->parent_id ?: $tr->id;
                $series = Training::where('parent_id', $parentId)
                    ->orWhere('id', $parentId)
                    ->orderBy('start_date', 'asc')
                    ->get();

                $trYearMonth = \Carbon\Carbon::parse($tr->start_date)->format('Y-m');
                $monthSessions = $series->filter(function ($sItem) use ($trYearMonth) {
                    return \Carbon\Carbon::parse($sItem->start_date)->format('Y-m') === $trYearMonth;
                });
                $monthSessionIds = $monthSessions->pluck('id')->all();

                $hasAcceptedInMonth = TrainingInvitation::whereIn('training_id', $monthSessionIds)
                    ->where('member_id', $member->id)
                    ->where('status', 'accepted')
                    ->exists();

                if ($hasAcceptedInMonth) {
                    TrainingInvitation::whereIn('training_id', $monthSessionIds)
                        ->where('member_id', $member->id)
                        ->where('status', '!=', 'accepted')
                        ->delete();
                    continue;
                }

                if (!$invite) {
                    // Only create a pending placeholder if admin has not already sent
                    // configured weeks for this member. Sending stays manual via Send.
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
        $parentId = $tr->parent_id ?: $tr->id;
        $parentTr = ($parentId === $tr->id) ? $tr : Training::find($parentId);
        $targetType = strtolower($parentTr?->target_type ?? $tr->target_type ?? 'junior');
        if ($tr->target_type !== $targetType) {
            $tr->target_type = $targetType;
            $tr->save();
        }

        $query = Member::where('status', 'active')
            ->where('member_type', $targetType)
            ->where('training_eligible', true);

        if ($tr->is_group_training && !empty($tr->league_group_ids)) {
            $groupMemberIds = DB::table('league_group_member')
                ->whereIn('league_group_id', $tr->league_group_ids)
                ->pluck('member_id')
                ->unique()
                ->toArray();
            $query->whereIn('id', $groupMemberIds);
        }

        $eligibleMembers = $query->get();

        $parentId = $tr->parent_id ?: $tr->id;
        $series = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();

        $trYearMonth = \Carbon\Carbon::parse($tr->start_date)->format('Y-m');
        $monthSessions = $series->filter(function ($sItem) use ($trYearMonth) {
            return \Carbon\Carbon::parse($sItem->start_date)->format('Y-m') === $trYearMonth;
        });
        $monthSessionIds = $monthSessions->pluck('id')->all();

        foreach ($eligibleMembers as $member) {
            $hasAcceptedInMonth = TrainingInvitation::whereIn('training_id', $monthSessionIds)
                ->where('member_id', $member->id)
                ->where('status', 'accepted')
                ->exists();

            if ($hasAcceptedInMonth) {
                TrainingInvitation::whereIn('training_id', $monthSessionIds)
                    ->where('member_id', $member->id)
                    ->where('status', '!=', 'accepted')
                    ->delete();
                continue;
            }

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
                $shouldDelete = true;
            } elseif ($tr->is_group_training && !empty($tr->league_group_ids)) {
                $inGroup = DB::table('league_group_member')
                    ->whereIn('league_group_id', $tr->league_group_ids)
                    ->where('member_id', $inv->member_id)
                    ->exists();
                $shouldDelete = !$inGroup;
            } else {
                $shouldDelete = false;
            }

            if ($shouldDelete) {
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

    private static ?float $lastSyncTime = null;

    /**
     * Synchronize all active Training Program invitations across all members.
     */
    public static function syncAllTrainingInvitations(bool $force = false): void
    {
        $now = microtime(true);
        if (!app()->runningUnitTests() && !$force && self::$lastSyncTime !== null && ($now - self::$lastSyncTime) < 5.0) {
            return;
        }
        self::$lastSyncTime = $now;

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
        DB::transaction(function () use ($schedule, $invite, $member) {
            // Lock the invite and only refund if it is still debited under the lock.
            $locked = PlayInvitation::where('id', $invite->id)->lockForUpdate()->first();
            if (!$locked || !$locked->debited) {
                return;
            }

            $snapshot = $locked->debited_amount;
            if ($snapshot !== null) {
                // Refund exactly what was charged, regardless of later rate/discount/flag changes.
                $memberFee = round((float) $snapshot, 2);
            } else {
                if ($member->skip_credit_consumption || self::memberSkipsLeagueFee($schedule, $member->id)) {
                    return;
                }
                $memberFee = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);
            }

            if ($memberFee > 0) {
                $walletMember = WalletHelper::resolveMember($member);
                $walletMember = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                $walletMember->credit = round($walletMember->credit + $memberFee, 2);
                $walletMember->saveQuietly();

                $transaction = Transaction::create([
                    'id' => 't_' . Str::random(8),
                    'member_id' => $walletMember->id,
                    'type' => 'refund',
                    'amount' => $memberFee,
                    'description' => 'Refund — cancelled play session: ' . $schedule->name . ' - ' . $member->name,
                    'date' => now(),
                ]);

                try {
                    MailHelper::sendTransactionEmail($walletMember, $transaction);
                } catch (\Exception $e) {
                    logger()->error("Transaction refund email failed for member {$walletMember->id}: " . $e->getMessage());
                }
            }

            $locked->debited = false;
            $locked->debited_amount = null;
            $locked->save();
            $invite->setRawAttributes($locked->getAttributes(), true);
        });
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

    public static function promoteNextWaitingPlayMember(PlaySchedule $sch): void
    {
        $controller = new \App\Http\Controllers\Api\PlayScheduleController();
        $controller->promoteWaitingMembers($sch);
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
            $invite->debited_amount = 0;
            $invite->save();
            return;
        }

        $memberFee = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);
        $isLeague = (bool) $schedule->is_league_match;
        $walletMember = WalletHelper::resolveMember($member);
        $chargedAmount = 0.0;

        if (!$walletMember->skip_credit_consumption && $memberFee > 0) {
            $walletMember = Member::where('id', $walletMember->id)->lockForUpdate()->first();
            if (!$isLeague && $walletMember->credit < $memberFee) {
                return;
            }
            $chargedAmount = $memberFee;
            $walletMember->credit = round($walletMember->credit - $memberFee, 2);
            $walletMember->saveQuietly();

            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $walletMember->id,
                'type' => 'debit',
                'amount' => $memberFee,
                'description' => 'Play session: ' . $schedule->name . ' - ' . $member->name,
                'date' => now(),
            ]);

            try {
                MailHelper::sendTransactionEmail($walletMember, $transaction);
            } catch (\Exception $e) {
                logger()->error("Transaction debit email failed for member {$walletMember->id}: " . $e->getMessage());
            }
        }

        $invite->debited = true;
        $invite->debited_amount = $chargedAmount;
        $invite->save();
    }

    /**
     * Build series-scoped + enrolled-member-scoped transaction matchers.
     *
     * Critical: refunds/debits for siblings that share a parent wallet must NOT share one
     * pool. Descriptions always include "for {member name}:", so we require that token.
     *
     * @return array{0: array<int,string>, 1: \Closure, 2: \Closure}
     */
    private static function seriesTransactionMatchers(Training $session, Member $member, array $seriesSessionIds): array
    {
        $baseName = trim(explode(' - Week', $session->name)[0]);
        $cleanBaseName = trim(preg_replace('/ \(\d+\)$/', '', $baseName));

        $seriesNames = Training::whereIn('id', $seriesSessionIds)->pluck('name')->all();
        $nameMatchers = collect($seriesNames)
            ->push($session->name)
            ->push($cleanBaseName)
            ->map(fn ($n) => trim((string) $n))
            ->filter(fn ($n) => $n !== '')
            ->unique()
            ->values()
            ->all();

        $memberName = trim((string) $member->name);
        $memberToken = $memberName !== '' ? ('for ' . $memberName . ':') : null;

        $matchSeriesName = function ($q) use ($nameMatchers) {
            foreach ($nameMatchers as $i => $name) {
                if ($i === 0) {
                    $q->where('description', 'like', '%' . $name . '%');
                } else {
                    $q->orWhere('description', 'like', '%' . $name . '%');
                }
            }
        };

        // Attribute to this enrolled member when the description contains
        // "for {name}:". Also allow legacy rows that have no "for Name:" clause
        // at all. Never include a sibling's "for Other Name:" rows on a shared wallet.
        $matchEnrolledMember = function ($q) use ($memberToken) {
            $q->where(function ($inner) use ($memberToken) {
                if ($memberToken !== null) {
                    $inner->where('description', 'like', '%' . $memberToken . '%');
                }
                $inner->orWhere(function ($legacy) {
                    $legacy->where('description', 'not like', '% for %:%');
                });
            });
        };

        return [$nameMatchers, $matchSeriesName, $matchEnrolledMember];
    }

    /**
     * Remaining refundable amount for ONE accepted session of a member
     * (individual-session cancel / decline / eligibility sync).
     *
     * - Session paid amount = invitation accepted_amount (actual share deducted).
     * - Minus attendance refund for THAT session only.
     * - Capped by this enrolled member's remaining series balance (never a sibling's
     *   refunds on a shared parent wallet, never other trainings).
     */
    public static function remainingSessionRefund(Training $session, Member $member, TrainingInvitation $invite): float
    {
        $parentId = $session->parent_id ?: $session->id;

        $seriesSessionIds = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->pluck('id')
            ->all();

        $walletMember = WalletHelper::resolveMember($member);

        $acceptedSeriesInvites = TrainingInvitation::whereIn('training_id', $seriesSessionIds)
            ->where('member_id', $member->id)
            ->where('status', 'accepted')
            ->get();
        if (!$acceptedSeriesInvites->contains('id', $invite->id)) {
            $acceptedSeriesInvites->push($invite);
        }

        [$nameMatchers, $matchSeriesName, $matchEnrolledMember] = self::seriesTransactionMatchers(
            $session,
            $member,
            $seriesSessionIds
        );

        $sumRefundsLike = function (array $patterns) use ($walletMember, $nameMatchers, $matchSeriesName, $matchEnrolledMember): float {
            if (empty($nameMatchers)) {
                return 0.0;
            }

            return (float) Transaction::where('member_id', $walletMember->id)
                ->whereIn('type', Transaction::inflowTypes())
                ->where(function ($q) use ($patterns) {
                    foreach ($patterns as $i => $pattern) {
                        if ($i === 0) {
                            $q->where('description', 'like', $pattern);
                        } else {
                            $q->orWhere('description', 'like', $pattern);
                        }
                    }
                })
                ->where($matchEnrolledMember)
                ->where($matchSeriesName)
                ->sum('amount');
        };

        // Legacy lump-sum debits: only this enrolled member's debits for this series.
        $legacyShare = null;
        $paidFor = function (TrainingInvitation $inv) use ($member, $walletMember, $nameMatchers, $matchSeriesName, $matchEnrolledMember, $acceptedSeriesInvites, &$legacyShare): float {
            if ($inv->accepted_amount !== null) {
                return (float) $inv->accepted_amount;
            }

            $computed = 0.0;
            $trSession = Training::find($inv->training_id);
            if ($trSession) {
                $repeatWeeks = max(1, (int) ($trSession->repeat_weeks ?? 1));
                $appDisc = $inv->apply_discount !== null ? (bool) $inv->apply_discount : (bool) $member->apply_discount;
                $discountedMonthlyFee = $inv->calculated_monthly_fee !== null
                    ? (float) $inv->calculated_monthly_fee
                    : FeeHelper::forMember((float) $trSession->fees, $member, $appDisc);
                $computed = round($discountedMonthlyFee / $repeatWeeks, 2);
            }

            if ($legacyShare === null) {
                $debitSum = empty($nameMatchers)
                    ? 0.0
                    : (float) Transaction::where('member_id', $walletMember->id)
                        ->where('type', 'debit')
                        ->where($matchEnrolledMember)
                        ->where($matchSeriesName)
                        ->sum('amount');
                $legacyShare = round($debitSum / max(1, $acceptedSeriesInvites->count()), 2);
            }

            return max($computed, $legacyShare);
        };

        $sessionPaid = $paidFor($invite);
        $seriesPaid = (float) $acceptedSeriesInvites->sum(fn ($inv) => $paidFor($inv));

        $sessionAttendanceRefund = (float) TrainingDate::where('training_id', $session->id)
            ->where('member_id', $member->id)
            ->whereNotNull('refund_amount')
            ->sum('refund_amount');
        $sessionRefundable = max(0.0, $sessionPaid - $sessionAttendanceRefund);

        $tdAttendanceRefunds = (float) TrainingDate::whereIn('training_id', $seriesSessionIds)
            ->where('member_id', $member->id)
            ->whereNotNull('refund_amount')
            ->sum('refund_amount');
        $txnAttendanceRefunds = $sumRefundsLike(['Training session absent%']);
        $alreadyRefundedAttendance = max($tdAttendanceRefunds, $txnAttendanceRefunds);

        $alreadyRefundedCancellation = $sumRefundsLike([
            'Refund — cancelled training program%',
            'Refund — cancelled training session%',
            'Refund — deleted training session%',
            'Refund — declined training session%',
        ]);
        $overpaymentRefunds = $sumRefundsLike(['Training program overpayment refund%']);
        $updateRefunds = $sumRefundsLike(['Training program update refund%']);

        $originalPaid = $seriesPaid + $overpaymentRefunds;
        $pool = $originalPaid
            - $alreadyRefundedAttendance
            - $alreadyRefundedCancellation
            - $overpaymentRefunds
            - $updateRefunds;

        return round(max(0.0, min($sessionRefundable, $pool)), 2);
    }

    /**
     * Remaining refundable amount when an entire monthly training program is cancelled.
     *
     * Uses the exact total actually charged for this enrolled member across the cancelled
     * sessions (sum of accepted_amount, with debit fallback) — NOT a fresh fees÷weeks split.
     * Sibling juniors on a shared parent wallet each keep their own balance.
     *
     * @param  \Illuminate\Support\Collection<int, Training>  $sessions
     * @param  \Illuminate\Support\Collection<int, TrainingInvitation>  $memberInvites
     */
    public static function remainingProgramRefund($sessions, Member $member, $memberInvites): float
    {
        if ($sessions->isEmpty() || $memberInvites->isEmpty()) {
            return 0.0;
        }

        $sessionIds = $sessions->pluck('id')->all();
        $first = $sessions->first();
        $parentId = $first->parent_id ?: $first->id;
        $seriesSessionIds = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->pluck('id')
            ->all();

        $walletMember = WalletHelper::resolveMember($member);
        [$nameMatchers, $matchSeriesName, $matchEnrolledMember] = self::seriesTransactionMatchers(
            $first,
            $member,
            $seriesSessionIds
        );

        $sumRefundsLike = function (array $patterns) use ($walletMember, $nameMatchers, $matchSeriesName, $matchEnrolledMember): float {
            if (empty($nameMatchers)) {
                return 0.0;
            }

            return (float) Transaction::where('member_id', $walletMember->id)
                ->whereIn('type', Transaction::inflowTypes())
                ->where(function ($q) use ($patterns) {
                    foreach ($patterns as $i => $pattern) {
                        if ($i === 0) {
                            $q->where('description', 'like', $pattern);
                        } else {
                            $q->orWhere('description', 'like', $pattern);
                        }
                    }
                })
                ->where($matchEnrolledMember)
                ->where($matchSeriesName)
                ->sum('amount');
        };

        $acceptedPaid = (float) $memberInvites->sum(function (TrainingInvitation $inv) {
            if ($inv->accepted_amount !== null) {
                return (float) $inv->accepted_amount;
            }
            if ($inv->accepted_per_session_fee !== null) {
                return (float) $inv->accepted_per_session_fee;
            }
            return 0.0;
        });

        // Source of truth for what was charged: prefer invitation snapshots; if missing,
        // fall back to this member's debit transaction(s) for this series only.
        $debitPaid = empty($nameMatchers)
            ? 0.0
            : (float) Transaction::where('member_id', $walletMember->id)
                ->where('type', 'debit')
                ->where($matchEnrolledMember)
                ->where($matchSeriesName)
                ->sum('amount');

        $totalPaid = round(max($acceptedPaid, $debitPaid), 2);
        if ($totalPaid <= 0) {
            return 0.0;
        }

        $tdAttendanceRefunds = (float) TrainingDate::whereIn('training_id', $sessionIds)
            ->where('member_id', $member->id)
            ->whereNotNull('refund_amount')
            ->sum('refund_amount');
        $txnAttendanceRefunds = $sumRefundsLike(['Training session absent%']);
        $alreadyRefundedAttendance = max($tdAttendanceRefunds, $txnAttendanceRefunds);

        $alreadyRefundedCancellation = $sumRefundsLike([
            'Refund — cancelled training program%',
            'Refund — cancelled training session%',
            'Refund — deleted training session%',
            'Refund — declined training session%',
        ]);
        $overpaymentRefunds = $sumRefundsLike(['Training program overpayment refund%']);
        $updateRefunds = $sumRefundsLike(['Training program update refund%']);

        $remaining = $totalPaid
            - $alreadyRefundedAttendance
            - $alreadyRefundedCancellation
            - $overpaymentRefunds
            - $updateRefunds;

        return round(max(0.0, $remaining), 2);
    }

    /**
     * Cancel ONE session enrollment (member no longer eligible) and refund the remaining eligible
     * amount for that session only (not the whole series).
     */
    private static function cancelAndRefundTrainingEnrollment(Training $tr, Member $member): void
    {
        DB::transaction(function () use ($tr, $member) {
            $invite = TrainingInvitation::where('training_id', $tr->id)
                ->where('member_id', $member->id)
                ->where('status', 'accepted')
                ->lockForUpdate()
                ->first();

            // WAL-01: skip flag lives on the wallet owner (parent for juniors).
            $walletMember = WalletHelper::resolveMember($member);

            if ($invite && !$walletMember->skip_credit_consumption) {
                $remainingRefund = self::remainingSessionRefund($tr, $member, $invite);

                if ($remainingRefund > 0) {
                    $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first() ?? $walletMember;
                    $freshWallet->credit = round($freshWallet->credit + $remainingRefund, 2);
                    $freshWallet->saveQuietly();

                    $transaction = Transaction::create([
                        'id' => 't_' . Str::random(8),
                        'member_id' => $freshWallet->id,
                        'type' => 'refund',
                        'amount' => $remainingRefund,
                        'description' => 'Refund — cancelled training session for ' . $member->name . ': ' . $tr->name,
                        'date' => now(),
                    ]);

                    try {
                        MailHelper::sendTransactionEmail($freshWallet, $transaction);
                    } catch (\Exception $e) {
                        logger()->error("Transaction refund email failed for member {$freshWallet->id}: " . $e->getMessage());
                    }
                }
            }

            // Remove this session's attendance record (not yet occurred / absent).
            TrainingDate::where('member_id', $member->id)
                ->where('training_id', $tr->id)
                ->where(function ($q) {
                    $q->where('date', '>', now()->toDateTimeString())
                        ->orWhere('attended', false);
                })
                ->delete();

            // Delete pending update requests for this session.
            TrainingUpdateRequest::where('member_id', $member->id)
                ->where('training_id', $tr->id)
                ->delete();

            // Remove this session's invitation for the member.
            TrainingInvitation::where('training_id', $tr->id)
                ->where('member_id', $member->id)
                ->delete();
        });
    }
}

