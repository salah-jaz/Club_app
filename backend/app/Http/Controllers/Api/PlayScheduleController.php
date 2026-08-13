<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\Member;
use App\Models\Grade;
use App\Models\PlayerPosition;
use App\Models\Rotation;
use App\Models\Transaction;
use App\Models\Setting;
use App\Models\Holiday;
use App\Helpers\MailHelper;
use App\Helpers\FeeHelper;
use App\Helpers\SessionTimingHelper;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PlayScheduleController extends Controller
{
    public function index()
    {
        $schedules = PlaySchedule::orderBy('date', 'desc')->get();
        return response()->json($schedules->map(fn(PlaySchedule $s) => $this->formatSchedule($s)));
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'date' => 'required|date',
            'courts' => 'required|integer|min:1',
            'players' => 'required|integer|min:1',
            'slotHours' => 'required|numeric',
            'slotDuration' => 'required|string',
            'sessionRate' => 'required|numeric',
            'hallRate' => 'required|numeric',
            'location' => 'required|string',
            'isLeagueMatch' => 'sometimes|boolean',
            'leagueGroupIds' => 'sometimes|array',
            'leagueGroupIds.*' => 'string',
            'repeatWeeks' => 'sometimes|integer|min:1|max:52',
        ]);

        if ($message = SessionTimingHelper::assertScheduleNotInPast($request->date)) {
            return response()->json(['message' => $message], 422);
        }

        $weeks = max(1, min(52, (int) $request->input('repeatWeeks', 1)));
        $baseDate = \Carbon\Carbon::parse($request->date);
        $created = [];
        $parentId = 's_' . Str::random(8);

        for ($i = 0; $i < $weeks; $i++) {
            $date = $baseDate->copy()->addWeeks($i);
            $rawName = $i === 0 ? $request->name : $this->scheduleNameFromDate($date);
            $name = $this->uniqueScheduleName($rawName);
            $schId = $i === 0 ? $parentId : ('s_' . Str::random(8));

            $sch = PlaySchedule::create([
                'id' => $schId,
                'parent_id' => $parentId,
                'repeat_weeks' => $weeks,
                'name' => $name,
                'date' => $date,
                'courts' => $request->courts,
                'players' => $request->players,
                'slot_hours' => $request->slotHours,
                'slot_duration' => $request->slotDuration,
                'session_rate' => $request->sessionRate,
                'hall_rate' => $request->hallRate,
                'location' => $request->location,
                'status' => 'open',
                'is_league_match' => $request->boolean('isLeagueMatch'),
                'league_group_ids' => $request->leagueGroupIds,
            ]);

            $created[] = $this->formatSchedule($sch);
        }

        return response()->json([
            'schedules' => $created,
            'count' => count($created),
            // Keep first schedule for older clients
            ...$created[0],
        ], 201);
    }

    private function scheduleNameFromDate(\Carbon\Carbon $date): string
    {
        return $date->format('l') . ' · ' . $date->format('j M Y') . ' · ' . $date->format('g:i A');
    }

    /**
     * Keep names unique by appending (2), (3), … when the base name is already used.
     */
    private function uniqueScheduleName(string $desired, ?string $excludeId = null): string
    {
        $base = preg_replace('/ \(\d+\)$/', '', $desired) ?: $desired;

        if (!$this->scheduleNameExists($base, $excludeId)) {
            return $base;
        }

        $n = 2;
        while ($this->scheduleNameExists("{$base} ({$n})", $excludeId)) {
            $n++;
        }

        return "{$base} ({$n})";
    }

    private function scheduleNameExists(string $name, ?string $excludeId = null): bool
    {
        $query = PlaySchedule::query()->where('name', $name);
        if ($excludeId) {
            $query->where('id', '!=', $excludeId);
        }
        return $query->exists();
    }

    public function update(Request $request, $id)
    {
        $sch = PlaySchedule::findOrFail($id);

        if (in_array($sch->status, ['rotated', 'published', 'closed', 'cancelled'], true)) {
            return response()->json([
                'message' => 'This schedule can no longer be edited.',
            ], 422);
        }

        if (empty($sch->parent_id)) {
            $sch->parent_id = $sch->id;
            $sch->save();
        }

        $parentId = $sch->parent_id;

        // Fetch existing series ordered by date
        $series = PlaySchedule::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('date', 'asc')
            ->get();

        // Ensure all in series have parent_id set
        foreach ($series as $sItem) {
            if ($sItem->parent_id !== $parentId) {
                $sItem->parent_id = $parentId;
                $sItem->save();
            }
        }

        $schIndex = $series->search(fn($item) => $item->id === $sch->id);
        if ($schIndex === false) {
            $schIndex = 0;
        }

        $currentRemaining = max(1, $series->count() - $schIndex);

        if ($request->has('repeatWeeks')) {
            $newRemaining = max(1, min(52, (int) $request->input('repeatWeeks')));

            if ($newRemaining < $currentRemaining) {
                // Delete excess future sessions from the tail of the series
                $keepUntilIndex = $schIndex + $newRemaining;
                for ($i = $keepUntilIndex; $i < $series->count(); $i++) {
                    $sToDelete = $series[$i];
                    PlayInvitation::where('schedule_id', $sToDelete->id)->delete();
                    Rotation::where('schedule_id', $sToDelete->id)->delete();
                    $sToDelete->delete();
                }
            } else if ($newRemaining > $currentRemaining) {
                // Create missing future sessions after the last session in the series
                $toAddCount = $newRemaining - $currentRemaining;
                $lastSession = $series->last();
                $baseDate = \Carbon\Carbon::parse($lastSession->date);

                for ($i = 1; $i <= $toAddCount; $i++) {
                    $nextDate = $baseDate->copy()->addWeeks($i);
                    $exists = PlaySchedule::where('parent_id', $parentId)
                        ->whereDate('date', $nextDate->toDateString())
                        ->exists();

                    if (!$exists) {
                        $rawName = $this->scheduleNameFromDate($nextDate);
                        $name = $this->uniqueScheduleName($rawName);
                        PlaySchedule::create([
                            'id' => 's_' . Str::random(8),
                            'parent_id' => $parentId,
                            'repeat_weeks' => $series->count() + $toAddCount,
                            'name' => $name,
                            'date' => $nextDate,
                            'courts' => $request->input('courts', $sch->courts),
                            'players' => $request->input('players', $sch->players),
                            'slot_hours' => $request->input('slotHours', $sch->slot_hours),
                            'slot_duration' => $request->input('slotDuration', $sch->slot_duration),
                            'session_rate' => $request->input('sessionRate', $sch->session_rate),
                            'hall_rate' => $request->input('hallRate', $sch->hall_rate),
                            'location' => $request->input('location', $sch->location),
                            'status' => 'open',
                            'is_league_match' => $request->has('isLeagueMatch') ? $request->boolean('isLeagueMatch') : $sch->is_league_match,
                            'league_group_ids' => $request->input('leagueGroupIds', $sch->league_group_ids),
                        ]);
                    }
                }
            }
        }

        $data = [];
        if ($request->has('name')) $data['name'] = $this->uniqueScheduleName($request->name, $sch->id);
        if ($request->has('date')) {
            if ($message = SessionTimingHelper::assertScheduleNotInPast($request->date)) {
                return response()->json(['message' => $message], 422);
            }
            $data['date'] = $request->date;
        }
        if ($request->has('courts')) $data['courts'] = $request->courts;
        if ($request->has('players')) $data['players'] = $request->players;
        if ($request->has('slotHours')) $data['slot_hours'] = $request->slotHours;
        if ($request->has('slotDuration')) $data['slot_duration'] = $request->slotDuration;
        if ($request->has('sessionRate')) $data['session_rate'] = $request->sessionRate;
        if ($request->has('hallRate')) $data['hall_rate'] = $request->hallRate;
        if ($request->has('location')) $data['location'] = $request->location;
        if ($request->has('status')) $data['status'] = $request->status;
        if ($request->has('isLeagueMatch')) $data['is_league_match'] = $request->boolean('isLeagueMatch');
        if ($request->has('leagueGroupIds')) $data['league_group_ids'] = $request->leagueGroupIds;

        $sch->update($data);

        // Synchronize repeat_weeks on remaining series items
        $updatedSeries = PlaySchedule::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('date', 'asc')
            ->get();
        $totalCount = $updatedSeries->count();
        foreach ($updatedSeries as $sItem) {
            $sItem->update(['repeat_weeks' => $totalCount]);
        }

        try {
            $invitations = PlayInvitation::where('schedule_id', $sch->id)->get();
            foreach ($invitations as $inv) {
                $member = Member::find($inv->member_id);
                if ($member) {
                    MailHelper::sendScheduleNotification($member, $sch, $inv->status, 'update');
                }
            }
        } catch (\Exception $e) {
            logger()->error("Schedule update email notification failed: " . $e->getMessage());
        }

        return response()->json($this->formatSchedule($sch->fresh()));
    }

    public function release($id)
    {
        $sch = PlaySchedule::findOrFail($id);
        $sch->status = 'released';
        $sch->save();

        // Get active adult league participants and eligible juniors (non-league)
        $eligibleAdults = Member::eligibleForPlay();
        if ($sch->is_league_match && !empty($sch->league_group_ids)) {
            $memberIds = DB::table('league_group_member')
                ->whereIn('league_group_id', $sch->league_group_ids)
                ->pluck('member_id')
                ->toArray();
            $eligibleAdults = $eligibleAdults->whereIn('id', $memberIds);
        }
        $eligibleAdultsList = $eligibleAdults->get();

        $eligibleJuniorsList = collect();
        if (!$sch->is_league_match) {
            $eligibleJuniorsList = Member::eligibleForPlayAsJunior()->get();
        }

        $eligible = $eligibleAdultsList->concat($eligibleJuniorsList);

        // Delete old invitations for this schedule (if any)
        PlayInvitation::where('schedule_id', $id)->delete();

        $isLeague = (bool) $sch->is_league_match;
        $capacity = max((int) $sch->players, 1);
        $acceptedCount = 0;

        // Create new invitations (league matches auto-accept up to capacity)
        $invites = [];
        foreach ($eligible as $member) {
            $status = 'open';
            $acceptedAt = null;
            if ($isLeague) {
                if ($acceptedCount < $capacity) {
                    $status = 'accepted';
                    $acceptedAt = now();
                    $acceptedCount++;
                } else {
                    $status = 'waiting';
                }
            }

            $inv = PlayInvitation::create([
                'id' => 'pi_' . Str::random(8),
                'schedule_id' => $id,
                'member_id' => $member->id,
                'status' => $status,
                'accepted_at' => $acceptedAt,
            ]);

            if ($status === 'accepted') {
                $this->debitPlayInvite($sch, $inv);
                $inv->refresh();
            }

            $invites[] = [
                'id' => $inv->id,
                'scheduleId' => $inv->schedule_id,
                'memberId' => $inv->member_id,
                'status' => $inv->status,
                'debited' => (bool) $inv->debited,
                'acceptedAt' => optional($inv->accepted_at)?->toISOString(),
            ];

            try {
                MailHelper::sendScheduleNotification($member, $sch, $inv->status, 'release');
            } catch (\Exception $e) {
                logger()->error("Schedule release email failed for member {$member->id}: " . $e->getMessage());
            }
        }

        return response()->json([
            'message' => $isLeague
                ? 'League schedule released; invitations auto-accepted for ' . $acceptedCount . ' players.'
                : 'Schedule released and invitations sent to ' . count($invites) . ' participants.',
            'inviteCount' => count($invites),
            'schedule' => $this->formatSchedule($sch),
            'invitations' => $invites,
        ]);
    }

    public function enroll(Request $request, $id)
    {
        $request->validate([
            'memberIds' => 'required|array|min:1',
            'memberIds.*' => 'required|string',
            'autoAccept' => 'sometimes|boolean',
        ]);

        $sch = PlaySchedule::findOrFail($id);
        $autoAccept = $request->boolean('autoAccept');

        if ($sch->status !== 'released') {
            return response()->json([
                'message' => 'This play session is not open for enrollment.',
            ], 422);
        }

        $scheduleDate = \Carbon\Carbon::parse($sch->date)->toDateString();
        if (Holiday::where('date', $scheduleDate)->exists()) {
            return response()->json([
                'message' => 'This session falls on a club holiday. Accept and decline are not available.',
            ], 422);
        }

        $memberIds = $request->memberIds;
        $userId = $request->user()->id;

        $allowedAdultIds = Member::eligibleForPlay()
            ->where('user_id', $userId)
            ->whereIn('id', $memberIds)
            ->pluck('id')
            ->all();

        // Juniors: family head enrolls play-eligible children (same pattern as trainings).
        // League matches stay adult-only.
        $allowedJuniorIds = [];
        if (!(bool) $sch->is_league_match) {
            $allowedJuniorIds = Member::eligibleForPlayAsJunior()
                ->where('user_id', $userId)
                ->whereIn('id', $memberIds)
                ->pluck('id')
                ->all();
        }

        $allowedIds = array_values(array_unique(array_merge($allowedAdultIds, $allowedJuniorIds)));

        if (count($allowedIds) !== count(array_unique($memberIds))) {
            return response()->json([
                'message' => 'You can only enroll your own eligible family members (adults with club membership, or play-eligible juniors).',
            ], 422);
        }

        if ($sch->is_league_match && !empty($sch->league_group_ids)) {
            $groupMemberIds = DB::table('league_group_member')
                ->whereIn('league_group_id', $sch->league_group_ids)
                ->pluck('member_id')
                ->all();
            $notInGroup = array_values(array_diff($memberIds, $groupMemberIds));
            if (count($notInGroup) > 0) {
                return response()->json([
                    'message' => 'One or more selected members are not in the league groups for this session.',
                ], 422);
            }
        }

        $alreadyInvited = PlayInvitation::where('schedule_id', $id)
            ->whereIn('member_id', $memberIds)
            ->pluck('member_id')
            ->all();

        $newMemberIds = array_values(array_diff($memberIds, $alreadyInvited));

        if (count($newMemberIds) === 0) {
            return response()->json([
                'message' => 'Selected members are already invited to this session.',
            ], 422);
        }

        $invites = [];
        foreach ($newMemberIds as $memberId) {
            $member = Member::find($memberId);
            $inv = PlayInvitation::create([
                'id' => 'pi_' . Str::random(8),
                'schedule_id' => $id,
                'member_id' => $memberId,
                'status' => 'open',
            ]);

            if ($autoAccept) {
                $acceptError = $this->acceptNewlyEnrolledInvite($sch, $inv, $member);
                if ($acceptError !== null) {
                    $inv->delete();
                    return response()->json(['message' => $acceptError], 422);
                }
                $inv = $inv->fresh();
            }

            $invites[] = $this->formatInvitation($inv);

            if ($member) {
                try {
                    $mailStatus = $autoAccept
                        ? ($inv->status === 'waiting' ? 'waiting' : 'accepted')
                        : 'open';
                    MailHelper::sendScheduleNotification($member, $sch, $mailStatus, 'release');
                } catch (\Exception $e) {
                    logger()->error("Schedule enroll email failed for member {$memberId}: " . $e->getMessage());
                }
            }
        }

        return response()->json([
            'message' => $autoAccept
                ? 'Family members accepted for this play session.'
                : 'Members enrolled. Review and accept the invitations below.',
            'schedule' => $this->formatSchedule($sch),
            'invitations' => $invites,
        ]);
    }

    /**
     * Accept a freshly enrolled open invite (capacity / waiting / debit).
     * @return string|null error message, or null on success
     */
    private function resolveWalletMember(Member $member): Member
    {
        return \App\Helpers\WalletHelper::resolveMember($member);
    }

    private function acceptNewlyEnrolledInvite(PlaySchedule $sch, PlayInvitation $invite, ?Member $member): ?string
    {
        $sessionPhase = SessionTimingHelper::playSessionPhase($sch);
        if ($message = SessionTimingHelper::acceptBlockedMessage($sessionPhase)) {
            return $message;
        }

        $skipsLeagueFee = $member && $this->memberSkipsLeagueFee($sch, $member->id);
        if ($member && !$member->skip_credit_consumption && !$skipsLeagueFee && !(bool) $sch->is_league_match) {
            $walletMember = $this->resolveWalletMember($member);
            $estimatedFee = FeeHelper::playSessionFee((float) $sch->session_rate, 0, 1, $member);
            if ($walletMember->credit < $estimatedFee) {
                return "Insufficient credits. You need at least \${$estimatedFee} to accept this schedule.";
            }
        }

        $acceptedCount = PlayInvitation::where('schedule_id', $sch->id)
            ->where('status', 'accepted')
            ->count();
        $capacity = max((int) $sch->players, 1);

        $invite->status = $acceptedCount < $capacity ? 'accepted' : 'waiting';
        if ($invite->status === 'accepted') {
            $invite->accepted_at = now();
            $invite->save();
            $this->debitPlayInvite($sch, $invite);
        } else {
            $invite->accepted_at = null;
            $invite->save();
        }

        return null;
    }

    public function close($id)
    {
        $sch = PlaySchedule::findOrFail($id);
        $sch->status = 'closed';
        $sch->save();

        return response()->json([
            'message' => 'Schedule closed successfully.',
            'schedule' => $this->formatSchedule($sch),
        ]);
    }

    public function cancel(Request $request, $id)
    {
        $request->validate([
            'reason' => 'required|string|max:1000',
        ]);

        $sch = PlaySchedule::findOrFail($id);
        if ($sch->status === 'cancelled') {
            return response()->json([
                'message' => 'Schedule is already cancelled.',
                'schedule' => $this->formatSchedule($sch),
            ]);
        }

        $sch->status = 'cancelled';
        $sch->cancel_reason = trim($request->reason);
        $sch->save();

        // Process refunds for members who have paid for this session
        $invitations = PlayInvitation::where('schedule_id', $sch->id)->get();
        foreach ($invitations as $invite) {
            if ($invite->debited && $invite->member_id && !str_starts_with($invite->member_id, 'guest_')) {
                $this->refundPlayInvite($sch, $invite);
            } else {
                $invite->debited = false;
                $invite->save();
            }
        }

        return response()->json([
            'message' => 'Session cancelled successfully and eligible fees refunded.',
            'schedule' => $this->formatSchedule($sch),
        ]);
    }

    public function publish($id)
    {
        $schedule = PlaySchedule::findOrFail($id);

        if ($schedule->status !== 'rotated') {
            return response()->json([
                'message' => 'Generate a court rotation before publishing to members.',
            ], 422);
        }

        $rotation = Rotation::where('schedule_id', $id)->first();
        if (!$rotation || empty($rotation->rounds)) {
            return response()->json([
                'message' => 'No rotation found to publish.',
            ], 422);
        }

        $schedule->status = 'published';
        $schedule->save();

        return response()->json([
            'message' => 'Court rotation published to members.',
            'schedule' => $this->formatSchedule($schedule),
            'rotation' => [
                'scheduleId' => $id,
                'rounds' => $rotation->rounds,
            ],
        ]);
    }

    /**
     * Clear court rotation and return schedule to released so it can be regenerated.
     * Does not refund session fees (accept/decline rules still apply).
     */
    public function revertRotation(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'admin') {
            return response()->json(['message' => 'Only admins can revert court rotations.'], 403);
        }

        $schedule = PlaySchedule::findOrFail($id);

        if (!in_array($schedule->status, ['rotated', 'published'], true)) {
            return response()->json([
                'message' => 'Only a generated or published rotation can be reverted.',
            ], 422);
        }

        Rotation::where('schedule_id', $id)->delete();
        $schedule->status = 'released';
        $schedule->save();

        return response()->json([
            'message' => 'Court rotation reverted. You can generate a new rotation.',
            'schedule' => $this->formatSchedule($schedule),
        ]);
    }

    public function rotate($id)
    {
        $schedule = PlaySchedule::findOrFail($id);
        $invites = PlayInvitation::where('schedule_id', $id)->where('status', 'accepted')->get();
        $playerIds = $invites->pluck('member_id')->values()->all();

        if (empty($playerIds)) {
            return response()->json(['message' => 'No players accepted the invitation yet.'], 400);
        }

        // Guests already belong in Accepted (capacity fillers) — do not invent extras here.
        $rotationPlayers = array_merge($playerIds, $this->guestIdsForAccepted($schedule, count($playerIds)));
        $rounds = $this->buildRotationRounds($schedule, $rotationPlayers);

        // Seed grade visibility from club default; admin can change until publish.
        $showGrades = Setting::where('key', 'show_grade_in_court_rotation')->value('value') === 'true';

        // Save or update rotation in DB
        Rotation::where('schedule_id', $id)->delete();
        $rotation = Rotation::create([
            'id' => 'r_' . Str::random(8),
            'schedule_id' => $id,
            'rounds' => $rounds,
            'show_member_grades' => $showGrades,
        ]);

        foreach ($playerIds as $memberId) {
            if ($this->isGuestMemberId($memberId)) {
                continue;
            }

            $invite = PlayInvitation::where('schedule_id', $id)->where('member_id', $memberId)->first();
            // Prefer debit-on-accept; only charge leftovers that somehow were not debited
            if ($invite) {
                $this->debitPlayInvite($schedule, $invite);
            }
        }

        $schedule->status = 'rotated';
        $schedule->save();

        return response()->json([
            'message' => 'Rotation generated successfully.',
            'rotation' => $this->formatRotation($rotation),
            'schedule' => $this->formatSchedule($schedule)
        ]);
    }

    public function updateRotation(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'admin') {
            return response()->json(['message' => 'Only admins can edit court rotations.'], 403);
        }

        $schedule = PlaySchedule::findOrFail($id);
        if (!in_array($schedule->status, ['rotated', 'published'], true)) {
            return response()->json([
                'message' => 'Court rotation can only be edited after it is generated (and before the session is closed).',
            ], 422);
        }

        $request->validate([
            'rounds' => 'required|array|min:1',
            'rounds.*.round' => 'required|integer|min:1',
            'rounds.*.courts' => 'required|array',
            'rounds.*.courts.*.courtNo' => 'required|integer|min:1',
            'rounds.*.courts.*.players' => 'present|array',
            'rounds.*.courts.*.players.*' => 'nullable|string',
            'rounds.*.resting' => 'present|array',
            'rounds.*.resting.*' => 'nullable|string',
        ]);

        $rounds = [];
        foreach ($request->rounds as $round) {
            $courts = [];
            foreach ($round['courts'] as $court) {
                $players = array_values(array_filter(
                    $court['players'] ?? [],
                    fn($p) => is_string($p) && $p !== ''
                ));
                if (count($players) > 4) {
                    return response()->json([
                        'message' => 'Each court can have at most 4 players.',
                    ], 422);
                }
                $courts[] = [
                    'courtNo' => (int) $court['courtNo'],
                    'players' => $players,
                ];
            }
            $resting = array_values(array_filter(
                $round['resting'] ?? [],
                fn($p) => is_string($p) && $p !== ''
            ));

            // No duplicate players within a round
            $all = [];
            foreach ($courts as $c) {
                foreach ($c['players'] as $p) {
                    $all[] = $p;
                }
            }
            foreach ($resting as $p) {
                $all[] = $p;
            }
            if (count($all) !== count(array_unique($all))) {
                return response()->json([
                    'message' => 'Each player can appear only once per round.',
                ], 422);
            }

            $rounds[] = [
                'round' => (int) $round['round'],
                'courts' => $courts,
                'resting' => $resting,
            ];
        }

        $rotation = Rotation::where('schedule_id', $id)->first();
        if (!$rotation) {
            return response()->json(['message' => 'No rotation found for this schedule.'], 404);
        }

        $rotation->rounds = $rounds;
        $rotation->save();

        return response()->json([
            'message' => 'Court rotation updated.',
            'rotation' => $this->formatRotation($rotation),
            'schedule' => $this->formatSchedule($schedule),
        ]);
    }

    public function updateRotationShowGrades(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'admin') {
            return response()->json(['message' => 'Only admins can change grade visibility.'], 403);
        }

        $schedule = PlaySchedule::findOrFail($id);
        if ($schedule->status !== 'rotated') {
            return response()->json([
                'message' => 'Show member grades can only be changed before the rotation is published.',
            ], 422);
        }

        $data = $request->validate([
            'showMemberGrades' => 'required|boolean',
        ]);

        $rotation = Rotation::where('schedule_id', $id)->first();
        if (!$rotation) {
            return response()->json(['message' => 'No rotation found for this schedule.'], 404);
        }

        $rotation->show_member_grades = (bool) $data['showMemberGrades'];
        $rotation->save();

        return response()->json([
            'message' => 'Grade visibility updated.',
            'rotation' => $this->formatRotation($rotation),
            'schedule' => $this->formatSchedule($schedule),
        ]);
    }

    /**
     * Build round/court assignments from the given accepted pool only
     * (real members + any guest fillers already included). No extra guests.
     */
    private function buildRotationRounds(PlaySchedule $schedule, array $playerIds): array
    {
        $courtsCount = max((int) $schedule->courts, 1);
        $roundsCount = 5;
        $playersPerCourt = 4;
        $slots = $courtsCount * $playersPerCourt;
        $rotationPlayers = array_values($playerIds);

        if (empty($rotationPlayers)) {
            return [];
        }

        // Adult grade ranks: lower number = stronger. Guests / unknown = weakest.
        $gradeRanks = Grade::where('type', 'adult')->pluck('rank', 'name')->all();
        $maxRank = empty($gradeRanks) ? 0 : (int) max($gradeRanks);
        $guestRank = $maxRank + 1;

        $realIds = array_values(array_filter(
            $rotationPlayers,
            fn($id) => !$this->isGuestMemberId($id)
        ));
        $membersById = Member::whereIn('id', $realIds)->get(['id', 'grade'])->keyBy('id');

        $playerRank = [];
        foreach ($rotationPlayers as $p) {
            if ($this->isGuestMemberId($p)) {
                $playerRank[$p] = $guestRank;
                continue;
            }
            $gradeName = $membersById->get($p)?->grade;
            $playerRank[$p] = isset($gradeRanks[$gradeName])
                ? (int) $gradeRanks[$gradeName]
                : $guestRank;
        }

        $playCount = [];
        foreach ($rotationPlayers as $p) {
            $playCount[$p] = 0;
        }

        $rounds = [];
        for ($r = 1; $r <= $roundsCount; $r++) {
            // Fairness first: who has played fewer rounds gets court slots.
            $sorted = $rotationPlayers;
            usort($sorted, function ($a, $b) use ($playCount, $playerRank, $guestRank) {
                $diff = $playCount[$a] - $playCount[$b];
                if ($diff !== 0) {
                    return $diff;
                }
                $rankDiff = ($playerRank[$a] ?? $guestRank) - ($playerRank[$b] ?? $guestRank);
                if ($rankDiff !== 0) {
                    return $rankDiff;
                }
                return strcmp((string) $a, (string) $b);
            });

            $playing = array_slice($sorted, 0, $slots);
            $resting = array_slice($sorted, $slots);

            // Group similar ranks on the same court (no shuffle).
            usort($playing, function ($a, $b) use ($playerRank, $playCount, $guestRank) {
                $rankDiff = ($playerRank[$a] ?? $guestRank) - ($playerRank[$b] ?? $guestRank);
                if ($rankDiff !== 0) {
                    return $rankDiff;
                }
                $diff = $playCount[$a] - $playCount[$b];
                if ($diff !== 0) {
                    return $diff;
                }
                return strcmp((string) $a, (string) $b);
            });

            $courtsArr = [];
            for ($c = 0; $c < $courtsCount; $c++) {
                $slice = array_slice($playing, $c * $playersPerCourt, $playersPerCourt);
                $courtsArr[] = [
                    'courtNo' => $c + 1,
                    'players' => $slice,
                ];
                foreach ($slice as $p) {
                    $playCount[$p] += 1;
                }
            }

            $rounds[] = [
                'round' => $r,
                'courts' => $courtsArr,
                'resting' => $resting,
            ];
        }

        return $rounds;
    }

    public function listInvitations()
    {
        $invites = PlayInvitation::orderBy('updated_at')->get();
        $payload = $invites->map(fn(PlayInvitation $i) => $this->formatInvitation($i))->values()->all();

        // Guests appear in Accepted only after rotation has been generated.
        $schedules = PlaySchedule::all()->keyBy('id');
        $acceptedBySchedule = $invites
            ->where('status', 'accepted')
            ->groupBy('schedule_id')
            ->map(fn($rows) => $rows->count());

        foreach ($schedules as $scheduleId => $schedule) {
            if (!in_array($schedule->status, ['published', 'closed'], true)) {
                continue;
            }
            $realAccepted = (int) ($acceptedBySchedule[$scheduleId] ?? 0);
            foreach ($this->guestIdsForAccepted($schedule, $realAccepted) as $guestId) {
                $n = (int) explode('_', $guestId)[1];
                $payload[] = [
                    'id' => 'pi_guest_' . $scheduleId . '_' . $n,
                    'scheduleId' => $scheduleId,
                    'memberId' => $guestId,
                    'status' => 'accepted',
                    'debited' => true,
                    'acceptedAt' => null,
                    'updatedAt' => optional($schedule->updated_at)?->toISOString(),
                    'createdAt' => optional($schedule->created_at)?->toISOString(),
                    'isGuest' => true,
                ];
            }
        }

        return response()->json($payload);
    }

    public function respondInvitation(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:accepted,declined',
        ]);

        $invite = PlayInvitation::findOrFail($id);
        $sch = PlaySchedule::findOrFail($invite->schedule_id);
        $desired = $request->status;
        $promoted = null;

        // Once rotation is generated (or published/closed/cancelled), members cannot change RSVP
        if (in_array($sch->status, ['rotated', 'published', 'closed', 'cancelled'], true)) {
            return response()->json([
                'message' => $sch->status === 'cancelled'
                    ? 'This session has been cancelled. Accept and decline are no longer available.'
                    : 'Court rotation is locked. Accept and decline are no longer available.',
            ], 422);
        }

        $scheduleDate = \Carbon\Carbon::parse($sch->date)->toDateString();
        if (Holiday::where('date', $scheduleDate)->exists()) {
            return response()->json([
                'message' => 'This session falls on a club holiday. Accept and decline are not available.',
            ], 422);
        }

        $sessionPhase = SessionTimingHelper::playSessionPhase($sch);
        if ($message = SessionTimingHelper::actionsBlockedMessage($sessionPhase)) {
            return response()->json(['message' => $message], 422);
        }

        if ($desired === 'accepted') {
            if ($message = SessionTimingHelper::acceptBlockedMessage($sessionPhase)) {
                return response()->json(['message' => $message], 422);
            }
            if (!in_array($invite->status, ['open', 'declined'], true)) {
                return response()->json([
                    'message' => 'This invitation is already accepted or on the waiting list.',
                ], 422);
            }

            $member = Member::find($invite->member_id);
            $skipsLeagueFee = $member && $this->memberSkipsLeagueFee($sch, $member->id);
            // League matches: always allow accept (debit may go negative). Non-league: require credit.
            if ($member && !$member->skip_credit_consumption && !$skipsLeagueFee && !(bool) $sch->is_league_match) {
                $walletMember = $this->resolveWalletMember($member);
                $estimatedFee = FeeHelper::playSessionFee((float) $sch->session_rate, 0, 1, $member);
                if ($walletMember->credit < $estimatedFee) {
                    return response()->json([
                        'message' => "Insufficient credits. You need at least \${$estimatedFee} to accept this schedule."
                    ], 422);
                }
            }

            $acceptedCount = PlayInvitation::where('schedule_id', $sch->id)
                ->where('status', 'accepted')
                ->count();
            $capacity = max((int) $sch->players, 1);

            $invite->status = $acceptedCount < $capacity ? 'accepted' : 'waiting';
            if ($invite->status === 'accepted') {
                $invite->accepted_at = now();
                $invite->save();
                // Charge session fee immediately on accept
                $this->debitPlayInvite($sch, $invite);
            } else {
                $invite->accepted_at = null;
                $invite->save();
            }
        } else {
            // Decline / cancel → return to Yet to Accept (open)
            $previous = $invite->status;
            $wasAccepted = $previous === 'accepted';

            if (!in_array($previous, ['accepted', 'waiting'], true)) {
                return response()->json([
                    'message' => 'This invitation cannot be declined in its current state.',
                ], 422);
            }

            // Accepted players cannot cancel within the lock window before match start
            if ($wasAccepted) {
                $lockHours = (int) (Setting::where('key', 'cancellation_lock_hours')->value('value') ?? 24);
                if ($lockHours < 0) {
                    $lockHours = 0;
                }
                $matchStart = \Carbon\Carbon::parse($sch->date);
                $cancelDeadline = $matchStart->copy()->subHours($lockHours);
                if (now()->greaterThanOrEqualTo($cancelDeadline)) {
                    $hoursLabel = $lockHours === 1 ? '1 hour' : "{$lockHours} hours";
                    return response()->json([
                        'message' => "Decline is no longer available. Cancellations close {$hoursLabel} before the match starts.",
                    ], 422);
                }
            }

            // Refund if they were charged on accept
            if ($wasAccepted) {
                $this->refundPlayInvite($sch, $invite);
            }

            $invite->status = 'open';
            $invite->accepted_at = null;
            $invite->debited = false;
            $invite->save();

            // Free seat in Accepted → promote earliest waiting member (first come) to end of Accepted
            if ($wasAccepted) {
                $next = PlayInvitation::where('schedule_id', $sch->id)
                    ->where('status', 'waiting')
                    ->orderBy('updated_at', 'asc')
                    ->orderBy('id', 'asc')
                    ->first();

                if ($next) {
                    $nextMember = Member::find($next->member_id);
                    // Non-league: require enough credit to promote. League: always promote (may go negative).
                    if (
                        $nextMember
                        && !$nextMember->skip_credit_consumption
                        && !$this->memberSkipsLeagueFee($sch, $nextMember->id)
                        && !(bool) $sch->is_league_match
                    ) {
                        $estimatedFee = FeeHelper::playSessionFee(
                            (float) $sch->session_rate,
                            0,
                            1,
                            $nextMember
                        );
                        $walletMember = $this->resolveWalletMember($nextMember);
                        if ($walletMember->credit < $estimatedFee) {
                            // Keep them waiting; do not promote without credits
                            $next = null;
                        }
                    }

                    if ($next) {
                        $next->status = 'accepted';
                        $next->accepted_at = now();
                        $next->save();
                        $this->debitPlayInvite($sch, $next);
                        $promoted = $this->formatInvitation($next->fresh());
                    }
                }
            }
        }

        $payload = $this->formatInvitation($invite->fresh());
        if ($promoted) {
            $payload['promoted'] = $promoted;
        }

        return response()->json($payload);
    }

    /**
     * Debit play session fee when a member accepts (idempotent via invite.debited).
     * League matches: always debit (allow negative credit) unless position skips league fee.
     * Non-league: skip debit when insufficient credit (rotate/cron safety).
     */
    private function debitPlayInvite(PlaySchedule $schedule, PlayInvitation $invite): void
    {
        $invite->refresh();
        if ($invite->debited || $invite->status !== 'accepted') {
            return;
        }
        if ($this->isGuestMemberId($invite->member_id)) {
            $invite->debited = true;
            $invite->save();
            return;
        }

        $member = Member::find($invite->member_id);
        if (!$member) {
            return;
        }

        if ($this->memberSkipsLeagueFee($schedule, $member->id)) {
            $invite->debited = true;
            $invite->save();
            return;
        }

        // Juniors always debit from the parent adult's wallet.
        $walletMember = $this->resolveWalletMember($member);
        $memberFee = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);
        $isLeague = (bool) $schedule->is_league_match;

        if (!$walletMember->skip_credit_consumption && $memberFee > 0) {
            if (!$isLeague && $walletMember->credit < $memberFee) {
                return;
            }
            $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first();
            $freshWallet->credit = round($freshWallet->credit - $memberFee, 2);
            $freshWallet->save();

            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $freshWallet->id,
                'type' => 'debit',
                'amount' => $memberFee,
                'description' => 'Play session: ' . $schedule->name,
                'date' => now(),
            ]);

            try {
                MailHelper::sendTransactionEmail($freshWallet, $transaction);
            } catch (\Exception $e) {
                logger()->error("Transaction debit email failed for member {$freshWallet->id}: " . $e->getMessage());
            }
        }

        $invite->debited = true;
        $invite->save();
    }

    /**
     * Refund play session fee when a member cancels within the allowed window.
     */
    private function refundPlayInvite(PlaySchedule $schedule, PlayInvitation $invite): void
    {
        $invite->refresh();
        if (!$invite->debited || $this->isGuestMemberId($invite->member_id)) {
            return;
        }

        $member = Member::find($invite->member_id);
        if (!$member || $this->memberSkipsLeagueFee($schedule, $member->id)) {
            $invite->debited = false;
            $invite->save();
            return;
        }

        // Juniors always refund to the parent adult's wallet.
        $walletMember = $this->resolveWalletMember($member);

        if ($walletMember->skip_credit_consumption) {
            $invite->debited = false;
            $invite->save();
            return;
        }

        $memberFee = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);
        if ($memberFee > 0) {
            $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first();
            $freshWallet->credit = round($freshWallet->credit + $memberFee, 2);
            $freshWallet->save();

            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $freshWallet->id,
                'type' => 'refund',
                'amount' => $memberFee,
                'description' => 'Refund — cancelled play session: ' . $schedule->name,
                'date' => now(),
            ]);

            try {
                MailHelper::sendTransactionEmail($freshWallet, $transaction);
            } catch (\Exception $e) {
                logger()->error("Transaction refund email failed for member {$freshWallet->id}: " . $e->getMessage());
            }
        }

        $invite->debited = false;
        $invite->save();
    }

    /**
     * True when this is a league match and the member's position in a linked
     * league group has skip_league_fee enabled.
     */
    private function memberSkipsLeagueFee(PlaySchedule $schedule, string $memberId): bool
    {
        if (!$schedule->is_league_match || empty($schedule->league_group_ids)) {
            return false;
        }

        $positions = DB::table('league_group_member')
            ->whereIn('league_group_id', $schedule->league_group_ids)
            ->where('member_id', $memberId)
            ->whereNotNull('position')
            ->pluck('position')
            ->unique()
            ->filter()
            ->values()
            ->all();

        if (empty($positions)) {
            return false;
        }

        return PlayerPosition::whereIn('name', $positions)
            ->where('skip_league_fee', true)
            ->exists();
    }

    public function listRotations(Request $request)
    {
        $user = $request->user();
        $isAdmin = $user && $user->role === 'admin';

        $rotations = Rotation::all();
        return response()->json($rotations->map(function ($r) use ($isAdmin) {
            $schedule = PlaySchedule::find($r->schedule_id);
            // Members only see rotations after publish; admins see drafts too.
            if (!$isAdmin && (!$schedule || !in_array($schedule->status, ['published', 'closed'], true))) {
                return null;
            }
            return $this->formatRotation($r);
        })->filter()->values());
    }

    public function destroy($id)
    {
        $sch = PlaySchedule::findOrFail($id);

        if ($sch->status !== 'cancelled') {
            $hasAccepted = PlayInvitation::where('schedule_id', $id)
                ->where('status', 'accepted')
                ->exists();

            if ($hasAccepted) {
                return response()->json([
                    'message' => 'Cannot delete a play schedule with accepted invitations unless it is cancelled.'
                ], 422);
            }
        }

        $sch->delete();

        return response()->json(['message' => 'Play schedule deleted successfully.']);
    }

    /**
     * Guest fillers for seats still open under Max Players.
     * Only missing accepted seats — never courts×4 padding.
     */
    private function guestIdsForAccepted(PlaySchedule $schedule, int $realAcceptedCount): array
    {
        $capacity = max((int) $schedule->players, 1);
        $guestNeeded = max(0, $capacity - $realAcceptedCount);
        $guests = [];
        for ($i = 1; $i <= $guestNeeded; $i++) {
            $guests[] = 'guest_' . $i;
        }
        return $guests;
    }

    private function isGuestMemberId($memberId): bool
    {
        return is_string($memberId) && str_starts_with($memberId, 'guest_');
    }

    private function formatInvitation(PlayInvitation $i): array
    {
        return [
            'id' => $i->id,
            'scheduleId' => $i->schedule_id,
            'memberId' => $i->member_id,
            'status' => $i->status,
            'debited' => (bool) $i->debited,
            'acceptedAt' => optional($i->accepted_at)?->toISOString(),
            'updatedAt' => optional($i->updated_at)?->toISOString(),
            'createdAt' => optional($i->created_at)?->toISOString(),
            'isGuest' => $this->isGuestMemberId($i->member_id),
        ];
    }

    private function formatRotation(Rotation $r): array
    {
        return [
            'scheduleId' => $r->schedule_id,
            'rounds' => $r->rounds ?? [],
            'showMemberGrades' => (bool) $r->show_member_grades,
        ];
    }

    private function formatSchedule(PlaySchedule $s)
    {
        $parentId = $s->parent_id ?: $s->id;
        $series = PlaySchedule::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('date', 'asc')
            ->get();
        $idx = $series->search(fn($item) => $item->id === $s->id);
        $remainingWeeks = ($idx !== false) ? max(1, $series->count() - $idx) : 1;

        return [
            'id' => $s->id,
            'parentId' => $s->parent_id,
            'name' => $s->name,
            'date' => $s->date,
            'courts' => (int)$s->courts,
            'players' => (int)$s->players,
            'slotHours' => (float)$s->slot_hours,
            'slotDuration' => $s->slot_duration,
            'sessionRate' => (float)$s->session_rate,
            'hallRate' => (float)$s->hall_rate,
            'location' => $s->location,
            'status' => $s->status,
            'cancelReason' => $s->cancel_reason,
            'isLeagueMatch' => (bool)$s->is_league_match,
            'leagueGroupIds' => $s->league_group_ids ?? [],
            'repeatWeeks' => $remainingWeeks,
        ];
    }
}
