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
use App\Helpers\PermissionHelper;
use App\Helpers\FamilyScopeHelper;
use App\Helpers\FeeHelper;
use App\Helpers\SessionTimingHelper;
use App\Helpers\WalletHelper;
use App\Jobs\SendPlayScheduleReleaseNotifications;
use App\Services\BackgroundQueueService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PlayScheduleController extends Controller
{
    public static function isMemberEligibleForSchedule(Member $member, PlaySchedule $schedule): bool
    {
        if ($member->status !== 'active' || !(bool) $member->membership) {
            return false;
        }

        $groupIds = is_array($schedule->league_group_ids)
            ? $schedule->league_group_ids
            : (json_decode($schedule->league_group_ids ?? '[]', true) ?? []);
        $groupIds = array_values(array_filter((array)$groupIds));
        $hasSelectedGroups = !empty($groupIds);

        if ($hasSelectedGroups) {
            $inGroup = DB::table('league_group_member')
                ->whereIn('league_group_id', $groupIds)
                ->where('member_id', $member->id)
                ->exists();

            if (!$inGroup) {
                return false;
            }

            if ($member->member_type === 'adult') {
                return true;
            }

            if ($member->member_type === 'junior') {
                return (bool) $member->play_eligible;
            }

            return false;
        }

        if ($member->member_type === 'adult') {
            return true;
        }

        if ($member->member_type === 'junior') {
            return !(bool) $schedule->is_league_match && (bool) $member->play_eligible;
        }

        return false;
    }

    public function index(?Request $request = null)
    {
        self::processAutoPublishAndRotation();
        $user = $request ? $request->user() : auth()->user();

        if ($request && ($request->query('dashboard') || $request->query('scope') === 'dashboard' || $request->query('upcoming'))) {
            return $this->upcomingDashboardPlaySessions($request);
        }

        $isAdmin = $user && $user->role === 'admin';

        $schedules = PlaySchedule::orderBy('date', 'desc')->get();

        if ($isAdmin || !$user) {
            return response()->json($schedules->map(fn(PlaySchedule $s) => $this->formatSchedule($s)));
        }

        $familyMembers = Member::where('user_id', $user->id)
            ->where('status', 'active')
            ->get();
        $eligibleFamilyMembers = $familyMembers->where('membership', true);
        $eligibleMemberIds = $eligibleFamilyMembers->pluck('id')->all();

        $acceptedOrWaitingScheduleIds = PlayInvitation::whereIn('member_id', $eligibleMemberIds)
            ->whereIn('status', ['accepted', 'waiting'])
            ->pluck('schedule_id')
            ->all();

        $visibleSchedules = $schedules->filter(function (PlaySchedule $sch) use ($eligibleFamilyMembers, $acceptedOrWaitingScheduleIds) {
            $groupIds = is_array($sch->league_group_ids)
                ? $sch->league_group_ids
                : (json_decode($sch->league_group_ids ?? '[]', true) ?? []);
            $groupIds = array_values(array_filter((array)$groupIds));
            $hasSelectedGroups = !empty($groupIds);

            if ($hasSelectedGroups) {
                foreach ($eligibleFamilyMembers as $member) {
                    if (self::isMemberEligibleForSchedule($member, $sch)) {
                        return true;
                    }
                }
                return false;
            }

            if (in_array($sch->id, $acceptedOrWaitingScheduleIds, true)) {
                return true;
            }
            foreach ($eligibleFamilyMembers as $member) {
                if (self::isMemberEligibleForSchedule($member, $sch)) {
                    return true;
                }
            }
            return false;
        });

        return response()->json($visibleSchedules->map(fn(PlaySchedule $s) => $this->formatSchedule($s))->values());
    }

    public function upcomingDashboardPlaySessions(?Request $request = null)
    {
        self::processAutoPublishAndRotation();
        $user = $request ? $request->user() : auth()->user();
        if (!$user) {
            return response()->json([]);
        }

        $now = SessionTimingHelper::now();

        // Admin & Volunteer: See all future upcoming schedules that are not open/closed/cancelled
        if ($user->role === 'admin' || $user->role === 'volunteer') {
            $schedules = PlaySchedule::whereNotIn('status', ['open', 'closed', 'cancelled'])
                ->orderBy('date', 'asc')
                ->get()
                ->filter(function (PlaySchedule $sch) use ($now) {
                    $start = SessionTimingHelper::parseDateTime($sch->date);
                    return $start->gt($now) && SessionTimingHelper::playSessionPhase($sch, $now) === SessionTimingHelper::PHASE_UPCOMING;
                });

            return response()->json($schedules->map(fn(PlaySchedule $s) => $this->formatSchedule($s))->values());
        }

        // Member: use the logged-in member's actual family relationships
        $familyMembers = Member::where('user_id', $user->id)
            ->where('status', 'active')
            ->get();
        $familyMemberIds = $familyMembers->pluck('id')->all();

        if (empty($familyMemberIds)) {
            return response()->json([]);
        }

        // Include a schedule if at least one family member has an Accepted or Waiting List invitation for it.
        // Prevent duplicate schedule cards when multiple family members qualify for the same schedule (unique schedule_id).
        $qualifyingScheduleIds = PlayInvitation::whereIn('member_id', $familyMemberIds)
            ->whereIn('status', ['accepted', 'waiting'])
            ->pluck('schedule_id')
            ->unique()
            ->values()
            ->all();

        if (empty($qualifyingScheduleIds)) {
            return response()->json([]);
        }

        // Show only future, upcoming Play Schedules.
        // Exclude Cancelled, Closed, Finished, and past schedules (and unreleased 'open' status).
        $schedules = PlaySchedule::whereIn('id', $qualifyingScheduleIds)
            ->whereNotIn('status', ['open', 'closed', 'cancelled'])
            ->orderBy('date', 'asc')
            ->get();

        $visibleSchedules = $schedules->filter(function (PlaySchedule $sch) use ($now, $familyMembers) {
            $groupIds = is_array($sch->league_group_ids)
                ? $sch->league_group_ids
                : (json_decode($sch->league_group_ids ?? '[]', true) ?? []);
            $groupIds = array_values(array_filter((array)$groupIds));
            if (!empty($groupIds)) {
                $isEligible = false;
                foreach ($familyMembers as $member) {
                    if (self::isMemberEligibleForSchedule($member, $sch)) {
                        $isEligible = true;
                        break;
                    }
                }
                if (!$isEligible) {
                    return false;
                }
            }

            $start = SessionTimingHelper::parseDateTime($sch->date);
            if ($start->lte($now)) {
                return false;
            }
            return SessionTimingHelper::playSessionPhase($sch, $now) === SessionTimingHelper::PHASE_UPCOMING;
        });

        // Format schedules and attach family member statuses without exposing unrelated members' private invitations
        $result = $visibleSchedules->map(function (PlaySchedule $s) use ($familyMembers) {
            $formatted = $this->formatSchedule($s);
            $invitations = PlayInvitation::where('schedule_id', $s->id)
                ->whereIn('member_id', $familyMembers->pluck('id')->all())
                ->get()
                ->keyBy('member_id');

            $familyStatuses = [];
            foreach ($familyMembers as $m) {
                $inv = $invitations->get($m->id);
                $status = $inv ? $inv->status : null;
                // If no invite record yet, check if eligible for this schedule
                if ($status === null && (bool) $m->membership && self::isMemberEligibleForSchedule($m, $s)) {
                    $status = 'open';
                }
                if ($status !== null) {
                    $familyStatuses[] = [
                        'memberId' => $m->id,
                        'memberName' => trim($m->first_name . ' ' . $m->last_name),
                        'memberFirstName' => $m->first_name,
                        'memberType' => $m->member_type,
                        'status' => $status,
                    ];
                }
            }
            $formatted['familyStatuses'] = $familyStatuses;
            return $formatted;
        })->values();

        return response()->json($result);
    }

    public function show(Request $request, $id)
    {
        $sch = PlaySchedule::findOrFail($id);
        $user = $request->user();

        if (!$user || $user->role === 'admin') {
            return response()->json($this->formatSchedule($sch));
        }

        $userMembers = Member::where('user_id', $user->id)
            ->where('status', 'active')
            ->where('membership', true)
            ->get();

        $isEligible = false;
        foreach ($userMembers as $member) {
            if (self::isMemberEligibleForSchedule($member, $sch)) {
                $isEligible = true;
                break;
            }
        }

        if (!$isEligible) {
            return response()->json(['message' => 'You do not have permission to view this schedule.'], 403);
        }

        return response()->json($this->formatSchedule($sch));
    }

    public function showPlayers(Request $request, $id)
    {
        $sch = PlaySchedule::findOrFail($id);
        $user = $request->user();

        if ($user && $user->role !== 'admin') {
            $userMembers = Member::where('user_id', $user->id)
                ->where('status', 'active')
                ->where('membership', true)
                ->get();

            $isEligible = false;
            foreach ($userMembers as $member) {
                if (self::isMemberEligibleForSchedule($member, $sch)) {
                    $isEligible = true;
                    break;
                }
            }

            if (!$isEligible) {
                return response()->json(['message' => 'You do not have permission to view player details for this schedule.'], 403);
            }
        }

        $invites = PlayInvitation::where('schedule_id', $id)->get();
        return response()->json($invites->map(fn($i) => $this->formatInvitation($i)));
    }

    public function store(Request $request)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'schedules.create')) {
            return $response;
        }

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
        if ($response = PermissionHelper::requireAdminPermission($request, 'schedules.edit')) {
            return $response;
        }

        $sch = PlaySchedule::findOrFail($id);

        if (in_array($sch->status, ['rotated', 'published', 'closed', 'cancelled'], true)) {
            return response()->json([
                'message' => 'This schedule can no longer be edited.',
            ], 422);
        }

        // Lifecycle statuses are driven by dedicated endpoints (release/rotate/publish/close/cancel).
        if ($request->has('status') && in_array($request->input('status'), ['cancelled', 'closed', 'published', 'rotated'], true)) {
            return response()->json([
                'message' => 'Schedule status cannot be changed through update. Use the dedicated action instead.',
            ], 422);
        }

        // Never shrink capacity below the number of members already accepted.
        if ($request->has('players')) {
            $newCapacity = (int) $request->input('players');
            $acceptedUnique = $this->uniqueAcceptedCount($sch->id);
            if ($newCapacity < $acceptedUnique) {
                return response()->json([
                    'message' => "Cannot reduce players below the {$acceptedUnique} members already accepted.",
                ], 422);
            }
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

                // Block (before mutating anything) when a session to be removed still has
                // accepted/waiting/debited invitations; admin must cancel it so fees are refunded.
                for ($i = $keepUntilIndex; $i < $series->count(); $i++) {
                    $hasCommitted = PlayInvitation::where('schedule_id', $series[$i]->id)
                        ->where(function ($q) {
                            $q->whereIn('status', ['accepted', 'waiting'])->orWhere('debited', true);
                        })
                        ->exists();
                    if ($hasCommitted) {
                        return response()->json([
                            'message' => 'Cannot reduce repeat weeks: a session that would be removed already has accepted or paid players. Cancel that session first so fees are refunded.',
                        ], 422);
                    }
                }

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
        if ($response = PermissionHelper::requireAdminPermission(request(), 'schedules.edit')) {
            return $response;
        }

        return $this->releaseWithoutAuthCheck($id);
    }

    /**
     * Release logic shared by the admin endpoint and system callers (auto-release, console).
     * Callers MUST enforce authorization themselves; this method performs none.
     * Only schedules in 'open' status can be released.
     */
    private function releaseWithoutAuthCheck($id)
    {
        $sch = PlaySchedule::findOrFail($id);

        if ($sch->status !== 'open') {
            return response()->json([
                'message' => 'Only an open schedule can be released. This schedule is already ' . $sch->status . '.',
            ], 422);
        }

        // Get active adult league participants and eligible juniors (non-league)
        $groupIds = is_array($sch->league_group_ids)
            ? $sch->league_group_ids
            : (json_decode($sch->league_group_ids ?? '[]', true) ?? []);
        $groupIds = array_values(array_filter((array)$groupIds));
        $hasSelectedGroups = !empty($groupIds);

        if ($hasSelectedGroups) {
            $groupMemberIds = DB::table('league_group_member')
                ->whereIn('league_group_id', $groupIds)
                ->pluck('member_id')
                ->unique()
                ->values()
                ->toArray();

            $eligibleAdultsList = Member::eligibleForPlay()
                ->whereIn('id', $groupMemberIds)
                ->get();

            $eligibleJuniorsList = Member::eligibleForPlayAsJunior()
                ->whereIn('id', $groupMemberIds)
                ->get();

            $eligible = $eligibleAdultsList->concat($eligibleJuniorsList)->unique('id');
        } else {
            $eligibleAdults = Member::eligibleForPlay();
            $eligibleAdultsList = $eligibleAdults->get();

            $eligibleJuniorsList = collect();
            if (!$sch->is_league_match) {
                $eligibleJuniorsList = Member::eligibleForPlayAsJunior()->get();
            }

            $eligible = $eligibleAdultsList->concat($eligibleJuniorsList)->unique('id');
        }

        $isLeague = (bool) $sch->is_league_match || $hasSelectedGroups;
        $capacity = max((int) $sch->players, 1);
        $acceptedCount = 0;
        $releaseNotifications = [];
        $transactionNotifications = [];

        // Create new invitations (league matches auto-accept up to capacity)
        $invites = DB::transaction(function () use (&$sch, $id, $eligible, $isLeague, $capacity, &$acceptedCount, &$releaseNotifications, &$transactionNotifications) {
            // Lock the schedule and re-check status so two concurrent releases cannot both proceed.
            $lockedSch = PlaySchedule::where('id', $id)->lockForUpdate()->firstOrFail();
            if ($lockedSch->status !== 'open') {
                return response()->json([
                    'message' => 'Only an open schedule can be released. This schedule is already ' . $lockedSch->status . '.',
                ], 422);
            }
            $lockedSch->status = 'released';
            $lockedSch->save();
            $sch = $lockedSch;

            // Any stale invitations on an open schedule must be refunded before removal.
            $staleInvites = PlayInvitation::where('schedule_id', $id)->lockForUpdate()->get();
            foreach ($staleInvites as $stale) {
                if ($stale->debited) {
                    $this->refundPlayInvite($sch, $stale);
                }
            }
            PlayInvitation::where('schedule_id', $id)->delete();

            $invites = [];
            $processedMemberIds = [];

            foreach ($eligible as $member) {
                if (in_array($member->id, $processedMemberIds, true)) {
                    continue;
                }
                $processedMemberIds[] = $member->id;

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
                    $this->debitPlayInvite($sch, $inv, true, $transactionNotifications);
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

                $releaseNotifications[] = [
                    'member_id' => $member->id,
                    'status' => $inv->status,
                ];
            }

            return $invites;
        });

        if ($invites instanceof \Illuminate\Http\JsonResponse) {
            return $invites;
        }

        // Offload email notifications to background so HTTP response completes immediately
        if (!MailHelper::isTemplateEnabled('schedule')) {
            $releaseNotifications = [];
        }
        if (!MailHelper::isTemplateEnabled('transaction')) {
            $transactionNotifications = [];
        }

        if (count($releaseNotifications) > 0 || count($transactionNotifications) > 0) {
            SendPlayScheduleReleaseNotifications::dispatch(
                $sch->id,
                $releaseNotifications,
                $transactionNotifications
            );
            BackgroundQueueService::runBackgroundQueue();
        }

        return response()->json([
            'message' => $isLeague
                ? 'Group schedule released; invitations auto-accepted for ' . $acceptedCount . ' players.'
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

        if (SessionTimingHelper::now()->greaterThanOrEqualTo(SessionTimingHelper::parseDateTime($sch->date))) {
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

        $memberIds = array_values(array_unique($request->memberIds));
        $user = $request->user();
        $isAdmin = $user && $user->role === 'admin';

        // Admins may enroll any eligible member (needs schedules.edit); members are family-only.
        if ($isAdmin && ($response = PermissionHelper::denyAdminUnless($request, 'schedules.edit'))) {
            return $response;
        }
        $familyIds = $isAdmin ? null : FamilyScopeHelper::familyMemberIds($user);

        $adultQuery = Member::eligibleForPlay()->whereIn('id', $memberIds);
        if ($familyIds !== null) {
            $adultQuery->whereIn('id', $familyIds);
        }
        $allowedAdultIds = $adultQuery->pluck('id')->all();

        // Juniors: family head enrolls play-eligible children (same pattern as trainings).
        // League matches stay adult-only.
        $allowedJuniorIds = [];
        if (!(bool) $sch->is_league_match) {
            $juniorQuery = Member::eligibleForPlayAsJunior()->whereIn('id', $memberIds);
            if ($familyIds !== null) {
                $juniorQuery->whereIn('id', $familyIds);
            }
            $allowedJuniorIds = $juniorQuery->pluck('id')->all();
        }

        $allowedIds = array_values(array_unique(array_merge($allowedAdultIds, $allowedJuniorIds)));

        if (count($allowedIds) !== count($memberIds)) {
            return response()->json([
                'message' => $isAdmin
                    ? 'One or more selected members are not eligible for play (adults with club membership, or play-eligible juniors).'
                    : 'You can only enroll your own eligible family members (adults with club membership, or play-eligible juniors).',
            ], 422);
        }

        $groupIds = is_array($sch->league_group_ids)
            ? $sch->league_group_ids
            : (json_decode($sch->league_group_ids ?? '[]', true) ?? []);
        $groupIds = array_values(array_filter((array)$groupIds));
        if (!empty($groupIds)) {
            $groupMemberIds = DB::table('league_group_member')
                ->whereIn('league_group_id', $groupIds)
                ->pluck('member_id')
                ->all();
            $notInGroup = array_values(array_diff($memberIds, $groupMemberIds));
            if (count($notInGroup) > 0) {
                return response()->json([
                    'message' => 'One or more selected members are not in the groups for this session.',
                ], 422);
            }
        }

        $invitesResult = DB::transaction(function () use ($sch, $id, $memberIds, $autoAccept) {
            $alreadyInvited = PlayInvitation::where('schedule_id', $id)
                ->whereIn('member_id', $memberIds)
                ->lockForUpdate()
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
                $existing = PlayInvitation::where('schedule_id', $id)
                    ->where('member_id', $memberId)
                    ->lockForUpdate()
                    ->first();
                if ($existing) {
                    continue;
                }

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

            return $invites;
        });

        if ($invitesResult instanceof \Illuminate\Http\JsonResponse) {
            return $invitesResult;
        }

        return response()->json([
            'message' => $autoAccept
                ? 'Family members accepted for this play session.'
                : 'Members enrolled. Review and accept the invitations below.',
            'schedule' => $this->formatSchedule($sch),
            'invitations' => $invitesResult,
        ]);
    }

    /**
     * Accept a freshly enrolled open invite (capacity / waiting / debit).
     * @return string|null error message, or null on success
     */
    private function resolveWalletMember(Member $member): Member
    {
        return WalletHelper::resolveMember($member);
    }

    private function uniqueAcceptedCount(string $scheduleId): int
    {
        return PlayInvitation::where('schedule_id', $scheduleId)
            ->where('status', 'accepted')
            ->pluck('member_id')
            ->unique()
            ->count();
    }

    private function acceptNewlyEnrolledInvite(PlaySchedule $sch, PlayInvitation $invite, ?Member $member): ?string
    {
        $sessionPhase = SessionTimingHelper::playSessionPhase($sch);
        if ($message = SessionTimingHelper::acceptBlockedMessage($sessionPhase)) {
            return $message;
        }

        if (!$member || !self::isMemberEligibleForSchedule($member, $sch)) {
            return 'Member is not eligible for this play session.';
        }

        // Prevent duplicate acceptance: check if member already accepted
        $alreadyAccepted = PlayInvitation::where('schedule_id', $sch->id)
            ->where('member_id', $invite->member_id)
            ->where('id', '!=', $invite->id)
            ->where('status', 'accepted')
            ->exists();
        if ($alreadyAccepted) {
            return 'Member is already accepted in this schedule.';
        }

        $skipsLeagueFee = $member && $this->memberSkipsLeagueFee($sch, $member->id);
        if ($member && !$member->skip_credit_consumption && !$skipsLeagueFee && !(bool) $sch->is_league_match) {
            $walletMember = $this->resolveWalletMember($member);
            $estimatedFee = FeeHelper::playSessionFee((float) $sch->session_rate, 0, 1, $member);
            $currency = Setting::where('key', 'currency')->value('value') ?? '$';
            if ($walletMember->credit < $estimatedFee) {
                return "Insufficient credits. You need at least {$currency}{$estimatedFee} to accept this schedule.";
            }
        }

        // Count UNIQUE member IDs already accepted (excluding this member)
        $acceptedCount = PlayInvitation::where('schedule_id', $sch->id)
            ->where('status', 'accepted')
            ->where('member_id', '!=', $invite->member_id)
            ->lockForUpdate()
            ->distinct('member_id')
            ->count('member_id');
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

    public function promoteWaitingMembers(PlaySchedule $sch): array
    {
        $run = function () use ($sch) {
            // Lock parent schedule first so invitation-row lock order stays consistent.
            PlaySchedule::where('id', $sch->id)->lockForUpdate()->firstOrFail();

            $promoted = [];
            $capacity = max((int) $sch->players, 1);

            $acceptedMemberIds = PlayInvitation::where('schedule_id', $sch->id)
                ->where('status', 'accepted')
                ->pluck('member_id')
                ->unique()
                ->all();

            $availableSlots = $capacity - count($acceptedMemberIds);
            if ($availableSlots <= 0) {
                return $promoted;
            }

            $waitingInvites = PlayInvitation::where('schedule_id', $sch->id)
                ->where('status', 'waiting')
                ->lockForUpdate()
                ->orderBy('updated_at', 'asc')
                ->orderBy('id', 'asc')
                ->get();

            foreach ($waitingInvites as $next) {
                if ($availableSlots <= 0) {
                    break;
                }

                if (in_array($next->member_id, $acceptedMemberIds, true)) {
                    $next->delete();
                    continue;
                }

                $nextMember = Member::find($next->member_id);
                if (!$nextMember || !self::isMemberEligibleForSchedule($nextMember, $sch)) {
                    $next->delete();
                    continue;
                }
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
                        continue;
                    }
                }

                $next->status = 'accepted';
                $next->accepted_at = now();
                $next->save();
                $this->debitPlayInvite($sch, $next);

                if ($nextMember) {
                    try {
                        MailHelper::sendScheduleWaitingPromotionNotification($nextMember, $sch);
                    } catch (\Exception $e) {
                        logger()->error("Waiting list promotion email failed for member {$nextMember->id}: " . $e->getMessage());
                    }
                }

                $acceptedMemberIds[] = $next->member_id;
                $promoted[] = $next;
                $availableSlots--;
            }

            return $promoted;
        };

        // Already inside a caller transaction (e.g. respondInvitation): reuse it.
        if (DB::transactionLevel() > 0) {
            return $run();
        }

        return DB::transaction($run, 5);
    }

    public function replacePlayer(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'schedules.edit')) {
            return $response;
        }

        $user = $request->user();
        if (!$user || $user->role !== 'admin') {
            return response()->json(['message' => 'Only admins can replace players.'], 403);
        }

        $request->validate([
            'outgoingMemberId' => 'required|string',
            'replacementMemberId' => 'required|string',
        ]);

        $schedule = PlaySchedule::findOrFail($id);
        if (in_array($schedule->status, ['closed', 'cancelled'], true)) {
            return response()->json([
                'message' => 'Cannot replace player for a closed or cancelled schedule.',
            ], 422);
        }

        $outgoingMemberId = (string) $request->outgoingMemberId;
        $replacementMemberId = (string) $request->replacementMemberId;

        if ($outgoingMemberId === $replacementMemberId) {
            return response()->json([
                'message' => 'Cannot replace a member with themselves.',
            ], 422);
        }

        $isGuestOutgoing = $this->isGuestMemberId($outgoingMemberId);
        $outgoingMember = null;
        if (!$isGuestOutgoing) {
            $outgoingMember = Member::find($outgoingMemberId);
            if (!$outgoingMember) {
                return response()->json(['message' => 'Outgoing member not found.'], 404);
            }

            $outgoingInvite = PlayInvitation::where('schedule_id', $schedule->id)
                ->where('member_id', $outgoingMemberId)
                ->first();
            if (!$outgoingInvite || $outgoingInvite->status !== 'accepted') {
                return response()->json([
                    'message' => 'Outgoing member is not currently accepted in this schedule.',
                ], 422);
            }
        }

        if ($this->isGuestMemberId($replacementMemberId)) {
            return response()->json([
                'message' => 'Replacement player must be a registered member.',
            ], 422);
        }

        $replacementMember = Member::find($replacementMemberId);
        if (!$replacementMember) {
            return response()->json(['message' => 'Replacement member not found.'], 404);
        }

        if (!self::isMemberEligibleForSchedule($replacementMember, $schedule)) {
            return response()->json([
                'message' => 'Selected member is not eligible for this play session.',
            ], 422);
        }

        $alreadyAccepted = PlayInvitation::where('schedule_id', $schedule->id)
            ->where('member_id', $replacementMemberId)
            ->where('status', 'accepted')
            ->exists();
        if ($alreadyAccepted) {
            return response()->json([
                'message' => 'Selected replacement member is already accepted in this schedule.',
            ], 422);
        }

        $currency = Setting::where('key', 'currency')->value('value') ?? '$';

        try {
            $result = DB::transaction(function () use (
                $schedule,
                $outgoingMemberId,
                $replacementMemberId,
                $outgoingMember,
                $replacementMember,
                $isGuestOutgoing,
                $currency
            ) {
                // 1. Lock and verify outgoing member invitation
                $outgoingInvite = null;
                if (!$isGuestOutgoing) {
                    $outgoingInvite = PlayInvitation::where('schedule_id', $schedule->id)
                        ->where('member_id', $outgoingMemberId)
                        ->lockForUpdate()
                        ->first();

                    if (!$outgoingInvite || $outgoingInvite->status !== 'accepted') {
                        throw new \DomainException('Outgoing member is not currently accepted in this schedule.');
                    }
                }

                // 2. Lock and verify replacement member is not already accepted
                $replacementAlreadyAccepted = PlayInvitation::where('schedule_id', $schedule->id)
                    ->where('member_id', $replacementMemberId)
                    ->where('status', 'accepted')
                    ->lockForUpdate()
                    ->exists();
                if ($replacementAlreadyAccepted) {
                    throw new \DomainException('Selected replacement member is already accepted in this schedule.');
                }

                // 3. Process refund for outgoing member (actual amount previously debited, no duplicate refunds)
                if (!$isGuestOutgoing && $outgoingMember && $outgoingInvite && $outgoingInvite->debited) {
                    $outgoingWallet = $this->resolveWalletMember($outgoingMember);
                    if (!$outgoingWallet->skip_credit_consumption && !$this->memberSkipsLeagueFee($schedule, $outgoingMember->id)) {
                        $totalDebited = (float) Transaction::where('member_id', $outgoingWallet->id)
                            ->where('type', 'debit')
                            ->where(function ($q) use ($schedule, $outgoingMember) {
                                $q->where('description', 'Play session: ' . $schedule->name . ' - ' . $outgoingMember->name)
                                  ->orWhere('description', 'like', 'Play session: ' . $schedule->name . ' - ' . $outgoingMember->name . '%');
                            })
                            ->sum('amount');

                        $totalRefunded = (float) Transaction::where('member_id', $outgoingWallet->id)
                            ->where('type', 'refund')
                            ->where(function ($q) use ($schedule, $outgoingMember) {
                                $q->where('description', 'like', 'Refund%' . $schedule->name . '%' . $outgoingMember->name . '%')
                                  ->orWhere('description', 'Refund — cancelled play session: ' . $schedule->name . ' - ' . $outgoingMember->name)
                                  ->orWhere('description', 'Refund - cancelled play session: ' . $schedule->name . ' - ' . $outgoingMember->name);
                            })
                            ->sum('amount');

                        $actualPaid = max(0, round($totalDebited - $totalRefunded, 2));

                        if ($actualPaid == 0 && $totalDebited == 0) {
                            $actualPaid = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $outgoingMember);
                        }

                        if ($actualPaid > 0) {
                            $freshOutgoingWallet = Member::where('id', $outgoingWallet->id)->lockForUpdate()->first();
                            $freshOutgoingWallet->credit = round($freshOutgoingWallet->credit + $actualPaid, 2);
                            $freshOutgoingWallet->save();

                            $refundTxn = Transaction::create([
                                'id' => 't_' . Str::random(8),
                                'member_id' => $freshOutgoingWallet->id,
                                'type' => 'refund',
                                'amount' => $actualPaid,
                                'description' => 'Refund — cancelled play session: ' . $schedule->name . ' - ' . $outgoingMember->name,
                                'date' => now(),
                            ]);

                            try {
                                MailHelper::sendTransactionEmail($freshOutgoingWallet, $refundTxn);
                            } catch (\Exception $e) {
                                logger()->error("Transaction refund email failed for member {$freshOutgoingWallet->id}: " . $e->getMessage());
                            }
                        }
                    }

                    $outgoingInvite->debited = false;
                }

                // 4. Update outgoing member invitation -> open (Yet to Accept)
                if ($outgoingInvite) {
                    $outgoingInvite->status = 'open';
                    $outgoingInvite->accepted_at = null;
                    $outgoingInvite->debited = false;
                    $outgoingInvite->debited_amount = null;
                    $outgoingInvite->save();
                }

                // 5. Debit replacement member using applicable fee and shared wallet rules
                $replacementWallet = $this->resolveWalletMember($replacementMember);
                $replacementSkipsLeague = $this->memberSkipsLeagueFee($schedule, $replacementMember->id);
                $replacementFee = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $replacementMember);
                if ($replacementSkipsLeague) {
                    $replacementFee = 0.0;
                }

                $bypassesCredit = (bool) $replacementWallet->skip_credit_consumption || $replacementSkipsLeague;
                $isReplacementDebited = false;
                $replacementChargedAmount = 0.0;

                if (!$bypassesCredit && $replacementFee > 0) {
                    $freshReplacementWallet = Member::where('id', $replacementWallet->id)->lockForUpdate()->first();
                    if ($freshReplacementWallet->credit < $replacementFee) {
                        throw new \DomainException("Insufficient credits. {$replacementMember->name} needs at least {$currency}{$replacementFee} to accept this schedule.");
                    }

                    $freshReplacementWallet->credit = round($freshReplacementWallet->credit - $replacementFee, 2);
                    $freshReplacementWallet->save();

                    $debitTxn = Transaction::create([
                        'id' => 't_' . Str::random(8),
                        'member_id' => $freshReplacementWallet->id,
                        'type' => 'debit',
                        'amount' => $replacementFee,
                        'description' => 'Play session: ' . $schedule->name . ' - ' . $replacementMember->name,
                        'date' => now(),
                    ]);

                    try {
                        MailHelper::sendTransactionEmail($freshReplacementWallet, $debitTxn);
                    } catch (\Exception $e) {
                        logger()->error("Transaction debit email failed for member {$freshReplacementWallet->id}: " . $e->getMessage());
                    }

                    $isReplacementDebited = true;
                    $replacementChargedAmount = $replacementFee;
                } else {
                    $isReplacementDebited = true;
                }

                // 6. Update or create replacement member invitation -> accepted
                $replacementInvite = PlayInvitation::where('schedule_id', $schedule->id)
                    ->where('member_id', $replacementMember->id)
                    ->lockForUpdate()
                    ->first();

                if ($replacementInvite) {
                    $replacementInvite->status = 'accepted';
                    $replacementInvite->accepted_at = now();
                    $replacementInvite->debited = $isReplacementDebited;
                    $replacementInvite->debited_amount = $replacementChargedAmount;
                    $replacementInvite->save();
                } else {
                    $replacementInvite = PlayInvitation::create([
                        'id' => 'pi_' . Str::random(8),
                        'schedule_id' => $schedule->id,
                        'member_id' => $replacementMember->id,
                        'status' => 'accepted',
                        'accepted_at' => now(),
                        'debited' => $isReplacementDebited,
                        'debited_amount' => $replacementChargedAmount,
                    ]);
                }

                // 7. Update rotation if it exists
                $rotation = Rotation::where('schedule_id', $schedule->id)->lockForUpdate()->first();
                if ($rotation && !empty($rotation->rounds)) {
                    $rounds = $rotation->rounds;
                    $updatedRounds = [];

                    foreach ($rounds as $roundData) {
                        $courts = [];
                        foreach ($roundData['courts'] ?? [] as $court) {
                            $players = [];
                            foreach ($court['players'] ?? [] as $playerId) {
                                if ((string)$playerId === (string)$outgoingMemberId) {
                                    $players[] = $replacementMemberId;
                                } else {
                                    $players[] = $playerId;
                                }
                            }
                            $courtEntry = [
                                'courtNo' => (int) ($court['courtNo'] ?? 1),
                                'players' => $players,
                            ];
                            if (!empty($court['courtName'])) {
                                $courtEntry['courtName'] = (string) $court['courtName'];
                            }
                            $courts[] = $courtEntry;
                        }

                        $resting = [];
                        foreach ($roundData['resting'] ?? [] as $playerId) {
                            if ((string)$playerId === (string)$outgoingMemberId) {
                                $resting[] = $replacementMemberId;
                            } else {
                                $resting[] = $playerId;
                            }
                        }

                        $updatedRounds[] = [
                            'round' => (int) ($roundData['round'] ?? 1),
                            'courts' => $courts,
                            'resting' => $resting,
                        ];
                    }

                    $rotation->rounds = $updatedRounds;
                    $rotation->save();
                }

                return [
                    'rotation' => $rotation,
                    'outgoingName' => $outgoingMember ? $outgoingMember->name : "Guest",
                ];
            });

            $outgoingName = $result['outgoingName'];
            $rotation = $result['rotation'];

            return response()->json([
                'message' => "Successfully replaced {$outgoingName} with {$replacementMember->name}.",
                'schedule' => $this->formatSchedule($schedule->fresh()),
                'rotation' => $rotation ? $this->formatRotation($rotation->fresh()) : null,
                'invitations' => PlayInvitation::where('schedule_id', $schedule->id)->get()->map(fn($i) => $this->formatInvitation($i)),
            ]);
        } catch (\DomainException $e) {
            return response()->json([
                'message' => $e->getMessage(),
            ], 422);
        } catch (\Throwable $e) {
            logger()->error("Replace player failed for schedule {$schedule->id}: " . $e->getMessage());
            return response()->json([
                'message' => 'Failed to replace player: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function close($id)
    {
        if ($response = PermissionHelper::requireAdminPermission(request(), 'schedules.edit')) {
            return $response;
        }

        $sch = PlaySchedule::findOrFail($id);
        if ($sch->status === 'cancelled') {
            return response()->json([
                'message' => 'A cancelled schedule cannot be closed.',
            ], 422);
        }

        $sch->status = 'closed';
        $sch->save();

        return response()->json([
            'message' => 'Schedule closed successfully.',
            'schedule' => $this->formatSchedule($sch),
        ]);
    }

    public function cancel(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'schedules.edit')) {
            return $response;
        }

        $request->validate([
            'reason' => 'required|string|max:1000',
        ]);

        PlaySchedule::findOrFail($id);

        $alreadyCancelled = false;
        $sch = null;
        DB::transaction(function () use ($id, $request, &$sch, &$alreadyCancelled) {
            // Lock the schedule first so concurrent cancel/accept/rotate calls serialize.
            $sch = PlaySchedule::where('id', $id)->lockForUpdate()->firstOrFail();
            if ($sch->status === 'cancelled') {
                $alreadyCancelled = true;
                return;
            }

            $sch->status = 'cancelled';
            $sch->cancel_reason = trim($request->reason);
            $sch->save();

            // Process refunds for members who have paid for this session.
            // refundPlayInvite locks each invite and refunds only if still debited.
            $invitations = PlayInvitation::where('schedule_id', $sch->id)->get();
            foreach ($invitations as $invite) {
                if ($invite->debited && $invite->member_id && !str_starts_with($invite->member_id, 'guest_')) {
                    $this->refundPlayInvite($sch, $invite);
                } else {
                    $invite->debited = false;
                    $invite->debited_amount = null;
                    $invite->save();
                }
            }
        });

        if ($alreadyCancelled) {
            return response()->json([
                'message' => 'Schedule is already cancelled.',
                'schedule' => $this->formatSchedule($sch),
            ]);
        }

        return response()->json([
            'message' => 'Session cancelled successfully and eligible fees refunded.',
            'schedule' => $this->formatSchedule($sch),
        ]);
    }

    public function publish($id)
    {
        if ($response = PermissionHelper::requireAdminPermission(request(), 'schedules.edit')) {
            return $response;
        }

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
        if ($response = PermissionHelper::requireAdminPermission($request, 'schedules.edit')) {
            return $response;
        }

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

    public function performRotate(PlaySchedule $schedule): ?Rotation
    {
        return DB::transaction(function () use ($schedule) {
        // Lock the schedule row first so concurrent rotate / accept / cancel calls serialize.
        PlaySchedule::where('id', $schedule->id)->lockForUpdate()->firstOrFail();
        $schedule->refresh();
        if (in_array($schedule->status, ['closed', 'cancelled'], true)) {
            return null;
        }

        $invites = PlayInvitation::where('schedule_id', $schedule->id)->where('status', 'accepted')->get()->unique('member_id');
        $playerIds = $invites->pluck('member_id')->values()->all();

        $rotationPlayers = array_merge($playerIds, $this->guestIdsForAccepted($schedule, count($playerIds)));
        $rounds = $this->buildRotationRounds($schedule, $rotationPlayers);

        $showGrades = Setting::where('key', 'show_grade_in_court_rotation')->value('value') === 'true';

        Rotation::where('schedule_id', $schedule->id)->delete();
        $rotation = Rotation::create([
            'id' => 'r_' . Str::random(8),
            'schedule_id' => $schedule->id,
            'rounds' => $rounds,
            'show_member_grades' => $showGrades,
        ]);

        foreach ($playerIds as $memberId) {
            if ($this->isGuestMemberId($memberId)) {
                continue;
            }

            $invite = PlayInvitation::where('schedule_id', $schedule->id)->where('member_id', $memberId)->first();
            if ($invite) {
                $this->debitPlayInvite($schedule, $invite);
            }
        }

        $schedule->status = 'rotated';
        $schedule->save();

        return $rotation;
        });
    }

    /**
     * Play schedule status is closed only via admin POST /schedules/{id}/close — no automatic closure.
     */
    public static function processOverdueClosure(?Carbon $now = null): void
    {
    }

    public static function processAutoPublishAndRotation(): void
    {
        $autoPublishSetting = Setting::where('key', 'auto_publish_rotation')->value('value');
        if ($autoPublishSetting === 'false') {
            return;
        }

        $lockHoursSetting = Setting::where('key', 'cancellation_lock_hours')->first();
        $lockHours = $lockHoursSetting ? (int) $lockHoursSetting->value : 24;
        if ($lockHours < 0) {
            $lockHours = 0;
        }

        SessionTimingHelper::applyClubTimezone();
        $now = SessionTimingHelper::now();
        // Only released/rotated: create + release stay manual. Lock window generates + publishes.
        $schedules = PlaySchedule::whereIn('status', ['released', 'rotated'])->get();
        $controller = new self();

        foreach ($schedules as $schedule) {
            if (!$schedule->date) {
                continue;
            }

            try {
                $matchStart = SessionTimingHelper::parseDateTime($schedule->date);

                $lockDeadline = $matchStart->copy()->subHours($lockHours);

                if ($lockHours === 0) {
                    // Lock window of 0h: rotate/publish at or after the match start.
                    if ($now->lt($lockDeadline)) {
                        continue;
                    }
                } else {
                    // Once the match has started (and a lock window exists) leave it alone.
                    if ($now->greaterThanOrEqualTo($matchStart)) {
                        continue;
                    }

                    if ($now->lt($lockDeadline)) {
                        continue;
                    }
                }

                $acceptedCount = PlayInvitation::where('schedule_id', $schedule->id)
                    ->where('status', 'accepted')
                    ->distinct('member_id')
                    ->count('member_id');

                if ($schedule->status === 'released') {
                    $controller->promoteWaitingMembers($schedule);
                    $schedule->refresh();
                    $acceptedCount = PlayInvitation::where('schedule_id', $schedule->id)
                        ->where('status', 'accepted')
                        ->distinct('member_id')
                        ->count('member_id');

                    if ($acceptedCount < 1) {
                        continue;
                    }
                    $controller->performRotate($schedule);
                    $schedule->refresh();
                }

                if ($schedule->status === 'rotated') {
                    $rotation = Rotation::where('schedule_id', $schedule->id)->first();
                    if (!$rotation) {
                        if ($acceptedCount < 1) {
                            continue;
                        }
                        $controller->performRotate($schedule);
                        $schedule->refresh();
                    }
                    $schedule->status = 'published';
                    $schedule->save();
                }

                self::ensureNextPlaySessionGenerated($schedule, $controller);
            } catch (\Throwable $e) {
                logger()->error('Auto publish/rotation failed for schedule '.$schedule->id.': '.$e->getMessage());
            }
        }
    }

    private static function ensureNextPlaySessionGenerated(PlaySchedule $schedule, PlayScheduleController $controller): void
    {
        if (!$schedule->date) {
            return;
        }

        $currentDate = SessionTimingHelper::parseDateTime($schedule->date);
        $nextDate = $currentDate->copy()->addWeeks(1);

        while ($nextDate->lt(SessionTimingHelper::now())) {
            $nextDate->addWeeks(1);
        }

        $parentId = $schedule->parent_id ?: $schedule->id;

        if (empty($schedule->parent_id)) {
            $schedule->parent_id = $schedule->id;
            $schedule->save();
        }

        $existingNext = PlaySchedule::where(function ($q) use ($parentId) {
            $q->where('parent_id', $parentId)->orWhere('id', $parentId);
        })->whereDate('date', $nextDate->toDateString())->first();

        if (!$existingNext) {
            $existingNext = PlaySchedule::where('location', $schedule->location)
                ->where('date', $nextDate->toDateTimeString())
                ->first();
        }

        if ($existingNext) {
            if ($existingNext->status === 'open') {
                $controller->releaseWithoutAuthCheck($existingNext->id);
            }
            return;
        }

        $rawName = $controller->scheduleNameFromDate($nextDate);
        $name = $controller->uniqueScheduleName($rawName);
        $nextSchId = 's_' . Str::random(8);

        $seriesCount = PlaySchedule::where('parent_id', $parentId)->orWhere('id', $parentId)->count();
        $newRepeatWeeks = max((int) $schedule->repeat_weeks, $seriesCount + 1);

        $nextSchedule = PlaySchedule::create([
            'id' => $nextSchId,
            'parent_id' => $parentId,
            'repeat_weeks' => $newRepeatWeeks,
            'name' => $name,
            'date' => $nextDate,
            'courts' => $schedule->courts,
            'players' => $schedule->players,
            'slot_hours' => $schedule->slot_hours,
            'slot_duration' => $schedule->slot_duration,
            'session_rate' => $schedule->session_rate,
            'hall_rate' => $schedule->hall_rate,
            'location' => $schedule->location,
            'status' => 'open',
            'is_league_match' => (bool) $schedule->is_league_match,
            'league_group_ids' => $schedule->league_group_ids,
        ]);

        PlaySchedule::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->update(['repeat_weeks' => $newRepeatWeeks]);

        $controller->releaseWithoutAuthCheck($nextSchedule->id);
    }

    public function rotate($id)
    {
        if ($response = PermissionHelper::requireAdminPermission(request(), 'schedules.edit')) {
            return $response;
        }

        $schedule = PlaySchedule::findOrFail($id);
        if (in_array($schedule->status, ['closed', 'cancelled'], true)) {
            return response()->json(['message' => 'Cannot generate rotation for a closed or cancelled schedule.'], 422);
        }
        $matchStart = SessionTimingHelper::parseDateTime($schedule->date);
        if (SessionTimingHelper::now()->greaterThanOrEqualTo($matchStart)) {
            return response()->json(['message' => 'Cannot generate rotation for a past session.'], 422);
        }

        $invites = PlayInvitation::where('schedule_id', $id)->where('status', 'accepted')->get()->unique('member_id');
        $playerIds = $invites->pluck('member_id')->values()->all();

        if (empty($playerIds)) {
            return response()->json(['message' => 'No players accepted the invitation yet.'], 400);
        }

        $rotation = $this->performRotate($schedule);
        if (!$rotation) {
            return response()->json(['message' => 'Cannot generate rotation for a closed or cancelled schedule.'], 422);
        }

        return response()->json([
            'message' => 'Rotation generated successfully.',
            'rotation' => $this->formatRotation($rotation),
            'schedule' => $this->formatSchedule($schedule->fresh()),
        ]);
    }

    public function updateRotation(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'schedules.edit')) {
            return $response;
        }

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
            'rounds.*.courts.*.courtName' => 'nullable|string|max:120',
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
                $courtEntry = [
                    'courtNo' => (int) $court['courtNo'],
                    'players' => $players,
                ];
                $courtName = isset($court['courtName']) ? trim((string) $court['courtName']) : '';
                if ($courtName !== '') {
                    $courtEntry['courtName'] = $courtName;
                }
                $courts[] = $courtEntry;
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
        if ($response = PermissionHelper::requireAdminPermission($request, 'schedules.edit')) {
            return $response;
        }

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

        $leagueGroupRaw = $schedule->league_group_ids;
        $leagueGroupIds = is_array($leagueGroupRaw)
            ? $leagueGroupRaw
            : (is_string($leagueGroupRaw) ? (json_decode($leagueGroupRaw, true) ?? []) : []);

        if (!empty($leagueGroupIds)) {
            return $this->buildLeagueGroupRotationRounds(
                $schedule,
                $rotationPlayers,
                $leagueGroupIds,
                $courtsCount,
                $roundsCount,
                $playersPerCourt,
                $slots
            );
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

    private function buildLeagueGroupRotationRounds(
        PlaySchedule $schedule,
        array $rotationPlayers,
        array $leagueGroupIds,
        int $courtsCount,
        int $roundsCount,
        int $playersPerCourt,
        int $slots
    ): array {
        $groupMembers = DB::table('league_group_member')
            ->whereIn('league_group_id', $leagueGroupIds)
            ->get(['league_group_id', 'member_id', 'position', 'id']);

        $memberGroupMap = [];
        foreach ($groupMembers as $gm) {
            if (!isset($memberGroupMap[$gm->member_id])) {
                $memberGroupMap[$gm->member_id] = $gm->league_group_id;
            }
        }

        $playCount = [];
        foreach ($rotationPlayers as $p) {
            $playCount[$p] = 0;
        }

        $totalPlayers = count($rotationPlayers);
        $rounds = [];

        for ($r = 1; $r <= $roundsCount; $r++) {
            if ($totalPlayers <= $slots) {
                $playing = $rotationPlayers;
                $resting = [];
            } else {
                $sorted = $rotationPlayers;
                usort($sorted, function ($a, $b) use ($playCount, $rotationPlayers, $r, $totalPlayers, $slots) {
                    $diff = $playCount[$a] - $playCount[$b];
                    if ($diff !== 0) {
                        return $diff;
                    }
                    $idxA = array_search($a, $rotationPlayers, true);
                    $idxB = array_search($b, $rotationPlayers, true);
                    $offsetA = ($idxA + ($r - 1) * ($totalPlayers - $slots)) % $totalPlayers;
                    $offsetB = ($idxB + ($r - 1) * ($totalPlayers - $slots)) % $totalPlayers;
                    return $offsetA - $offsetB;
                });

                $playing = array_slice($sorted, 0, $slots);
                $resting = array_slice($sorted, $slots);
            }

            $playingGroups = [];
            foreach ($playing as $p) {
                $gid = $memberGroupMap[$p] ?? ($this->isGuestMemberId($p) ? 'guest' : 'other');
                $playingGroups[$gid][] = $p;
            }

            $interleaved = [];
            $maxGroupSize = 0;
            foreach ($playingGroups as $gList) {
                $maxGroupSize = max($maxGroupSize, count($gList));
            }
            for ($i = 0; $i < $maxGroupSize; $i++) {
                foreach ($playingGroups as $gList) {
                    if (isset($gList[$i])) {
                        $interleaved[] = $gList[$i];
                    }
                }
            }

            $courtsArr = [];
            for ($c = 0; $c < $courtsCount; $c++) {
                $shiftedCourtIdx = ($c + ($r - 1)) % $courtsCount;
                $slice = array_slice($interleaved, $shiftedCourtIdx * $playersPerCourt, $playersPerCourt);

                if (count($slice) < $playersPerCourt) {
                    $needed = $playersPerCourt - count($slice);
                    $available = array_diff($interleaved, $slice);
                    $slice = array_merge($slice, array_slice(array_values($available), 0, $needed));
                }

                $permuted = $this->permuteCourtSlots($slice, $r);

                $courtsArr[] = [
                    'courtNo' => $c + 1,
                    'players' => $permuted,
                ];

                foreach ($permuted as $p) {
                    $playCount[$p] += 1;
                }
            }

            $rounds[] = [
                'round' => $r,
                'courts' => $courtsArr,
                'resting' => array_values($resting),
            ];
        }

        return $rounds;
    }

    private function permuteCourtSlots(array $courtPlayers, int $round): array
    {
        $n = count($courtPlayers);
        if ($n < 4) {
            return $courtPlayers;
        }

        $perms = [
            1 => [0, 1, 2, 3],
            2 => [0, 2, 1, 3],
            3 => [0, 3, 1, 2],
            4 => [1, 3, 0, 2],
            5 => [2, 3, 0, 1],
        ];

        $pIdx = $perms[$round] ?? [($round - 1) % $n, ($round) % $n, ($round + 1) % $n, ($round + 2) % $n];

        $result = [];
        foreach ($pIdx as $idx) {
            $result[] = $courtPlayers[$idx % $n];
        }
        return $result;
    }

    public function listInvitations(?Request $request = null)
    {
        self::processAutoPublishAndRotation();

        $user = $request ? $request->user() : auth()->user();
        $isAdmin = $user && $user->role === 'admin';
        $familyMemberIds = $isAdmin ? [] : FamilyScopeHelper::familyMemberIds($user);
        $userMembers = !empty($familyMemberIds) ? Member::whereIn('id', $familyMemberIds)->get() : collect();
        $eligibleUserMemberIds = $userMembers->where('status', 'active')->where('membership', true)->pluck('id')->all();

        $releasedSchedules = PlaySchedule::where('status', 'released')->get();
        foreach ($releasedSchedules as $relSch) {
            $this->promoteWaitingMembers($relSch);
        }

        $openScheduleIds = PlaySchedule::where('status', 'open')->pluck('id')->all();
        $invites = PlayInvitation::whereNotIn('schedule_id', $openScheduleIds)->orderBy('updated_at')->get();
        $uniqueInvites = $invites->unique(fn($i) => $i->schedule_id . '_' . $i->member_id);
        
        $groupedInvites = $uniqueInvites->groupBy('schedule_id');
        $filteredInvites = collect();
        $schedules = PlaySchedule::all()->keyBy('id');

        foreach ($groupedInvites as $scheduleId => $scheduleInvites) {
            if ($isAdmin) {
                $filteredInvites = $filteredInvites->merge($scheduleInvites);
                continue;
            }

            $schedule = $schedules->get($scheduleId);
            if (!$schedule) {
                continue;
            }

            $groupIds = is_array($schedule->league_group_ids)
                ? $schedule->league_group_ids
                : (json_decode($schedule->league_group_ids ?? '[]', true) ?? []);
            $groupIds = array_values(array_filter((array)$groupIds));
            $hasSelectedGroups = !empty($groupIds);

            if ($hasSelectedGroups) {
                $isGroupEligible = false;
                foreach ($userMembers as $uMember) {
                    if (self::isMemberEligibleForSchedule($uMember, $schedule)) {
                        $isGroupEligible = true;
                        break;
                    }
                }
                if (!$isGroupEligible) {
                    continue;
                }

                // Never expose other members' invitations: only the caller's eligible family members.
                $ownInvites = $scheduleInvites->filter(
                    fn($inv) => in_array($inv->member_id, $eligibleUserMemberIds, true)
                );
                $filteredInvites = $filteredInvites->merge($ownInvites);
                continue;
            }

            $hasActiveAcceptedOrWaiting = false;
            foreach ($scheduleInvites as $inv) {
                if (in_array($inv->member_id, $eligibleUserMemberIds, true) && in_array($inv->status, ['accepted', 'waiting'], true)) {
                    $hasActiveAcceptedOrWaiting = true;
                    break;
                }
            }

            $hasEligibleFamilyMember = false;
            foreach ($userMembers as $uMember) {
                if (self::isMemberEligibleForSchedule($uMember, $schedule)) {
                    $hasEligibleFamilyMember = true;
                    break;
                }
            }

            if (!$hasEligibleFamilyMember && !$hasActiveAcceptedOrWaiting) {
                continue;
            }

            // Never expose other members' invitations: only the caller's eligible family members.
            $ownInvites = $scheduleInvites->filter(
                fn($inv) => in_array($inv->member_id, $eligibleUserMemberIds, true)
            );
            $filteredInvites = $filteredInvites->merge($ownInvites);
        }

        $payload = $filteredInvites->map(fn(PlayInvitation $i) => $this->formatInvitation($i))->values()->all();

        // Guests appear in Accepted only after rotation has been generated.
        $acceptedBySchedule = $uniqueInvites
            ->where('status', 'accepted')
            ->groupBy('schedule_id')
            ->map(fn($rows) => $rows->pluck('member_id')->unique()->count());

        foreach ($schedules as $scheduleId => $schedule) {
            if (!in_array($schedule->status, ['published', 'closed'], true)) {
                continue;
            }

            if (!$isAdmin) {
                $groupIds = is_array($schedule->league_group_ids)
                    ? $schedule->league_group_ids
                    : (json_decode($schedule->league_group_ids ?? '[]', true) ?? []);
                $groupIds = array_values(array_filter((array)$groupIds));
                if (!empty($groupIds)) {
                    $isGroupEligible = false;
                    foreach ($userMembers as $uMember) {
                        if (self::isMemberEligibleForSchedule($uMember, $schedule)) {
                            $isGroupEligible = true;
                            break;
                        }
                    }
                    if (!$isGroupEligible) {
                        continue;
                    }
                }

                $hasActiveAcceptedOrWaiting = false;
                $schInvites = $groupedInvites->get($scheduleId, collect());
                foreach ($schInvites as $inv) {
                    if (in_array($inv->member_id, $eligibleUserMemberIds, true) && in_array($inv->status, ['accepted', 'waiting'], true)) {
                        $hasActiveAcceptedOrWaiting = true;
                        break;
                    }
                }
                if (!$hasActiveAcceptedOrWaiting) {
                    continue;
                }
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

        // IDOR guard: non-admins may only respond to invitations for their own family members.
        $invite = PlayInvitation::findOrFail($id);
        if ($response = FamilyScopeHelper::assertOwnsMemberOrAdmin($request->user(), (string) $invite->member_id)) {
            return $response;
        }

        self::processAutoPublishAndRotation();
        $invite = PlayInvitation::findOrFail($id);
        $sch = PlaySchedule::findOrFail($invite->schedule_id);
        $desired = $request->status;
        $promoted = null;

        // Once rotation is generated (or published/closed/cancelled), members cannot change RSVP
        if (in_array($sch->status, ['rotated', 'published', 'closed', 'cancelled'], true)) {
            return response()->json([
                'message' => $sch->status === 'cancelled'
                    ? 'This session has been cancelled. Accept and decline are no longer available.'
                    : ($sch->status === 'closed'
                        ? 'This session is closed. Accept and decline are no longer available.'
                        : 'Court rotation is locked. Accept and decline are no longer available.'),
            ], 422);
        }

        $matchStart = SessionTimingHelper::parseDateTime($sch->date);
        if ($sch->status === 'released' && SessionTimingHelper::now()->greaterThanOrEqualTo($matchStart)) {
            return response()->json([
                'message' => 'This session has started. Accept and decline are no longer available.',
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

        // Retry on MySQL deadlock (1213). Lock the schedule row first so concurrent
        // accepts/declines for the same session take locks in a consistent order.
        $response = DB::transaction(function () use ($id, $desired, $sessionPhase, &$promoted, &$invite, &$sch) {
            $sch = PlaySchedule::where('id', $sch->id)->lockForUpdate()->firstOrFail();
            $invite = PlayInvitation::where('id', $id)->lockForUpdate()->firstOrFail();

            if ($desired === 'accepted') {
                if ($message = SessionTimingHelper::acceptBlockedMessage($sessionPhase)) {
                    return response()->json(['message' => $message], 422);
                }

                $member = Member::find($invite->member_id);
                if (!$member || !self::isMemberEligibleForSchedule($member, $sch)) {
                    return response()->json([
                        'message' => 'Member is not eligible for this play session.',
                    ], 422);
                }

                if (!in_array($invite->status, ['open', 'declined'], true)) {
                    return response()->json([
                        'message' => 'This invitation is already accepted or on the waiting list.',
                    ], 422);
                }

                // Check if this member is already accepted in this schedule
                $alreadyAccepted = PlayInvitation::where('schedule_id', $sch->id)
                    ->where('member_id', $invite->member_id)
                    ->where('id', '!=', $invite->id)
                    ->where('status', 'accepted')
                    ->exists();
                if ($alreadyAccepted) {
                    return response()->json([
                        'message' => 'This member has already accepted this session.',
                    ], 422);
                }

                $member = Member::find($invite->member_id);
                $skipsLeagueFee = $member && $this->memberSkipsLeagueFee($sch, $member->id);
                // League matches: always allow accept (debit may go negative). Non-league: require credit.
                if ($member && !$member->skip_credit_consumption && !$skipsLeagueFee && !(bool) $sch->is_league_match) {
                    $walletMember = $this->resolveWalletMember($member);
                    $estimatedFee = FeeHelper::playSessionFee((float) $sch->session_rate, 0, 1, $member);
                    $currency = Setting::where('key', 'currency')->value('value') ?? '$';
                    if ($walletMember->credit < $estimatedFee) {
                        return response()->json([
                            'message' => "Insufficient credits. You need at least {$currency}{$estimatedFee} to accept this schedule."
                        ], 422);
                    }
                }

                // Count UNIQUE members accepted (excluding this member)
                $acceptedCount = PlayInvitation::where('schedule_id', $sch->id)
                    ->where('status', 'accepted')
                    ->where('member_id', '!=', $invite->member_id)
                    ->lockForUpdate()
                    ->distinct('member_id')
                    ->count('member_id');
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

                if ($sch->is_league_match || (!empty($sch->league_group_ids) && count((array)$sch->league_group_ids) > 0)) {
                    return response()->json([
                        'message' => 'League play session invitations cannot be declined.',
                    ], 422);
                }

                // Accepted players cannot cancel once the Cancellation Lock Window is reached
                if ($wasAccepted) {
                    $lockHours = (int) (Setting::where('key', 'cancellation_lock_hours')->value('value') ?? 24);
                    if ($lockHours < 0) {
                        $lockHours = 0;
                    }
                    $matchStart = SessionTimingHelper::parseDateTime($sch->date);
                    $cancelDeadline = $matchStart->copy()->subHours($lockHours);
                    if (SessionTimingHelper::now()->greaterThanOrEqualTo($cancelDeadline)) {
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
                $invite->debited_amount = null;
                $invite->save();

                // Free seat in Accepted → promote earliest waiting member (first come) to end of Accepted
                if ($wasAccepted) {
                    $promotedList = $this->promoteWaitingMembers($sch);
                    if (!empty($promotedList)) {
                        $promoted = $this->formatInvitation($promotedList[0]->fresh());
                    }
                }
            }

            return null;
        }, 5);

        if ($response instanceof \Illuminate\Http\JsonResponse) {
            return $response;
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
    public function debitPlayInvite(PlaySchedule $schedule, PlayInvitation $invite, bool $deferEmail = false, ?array &$deferredEmails = null): void
    {
        DB::transaction(function () use ($schedule, $invite, $deferEmail, &$deferredEmails) {
            // Lock the invite row so concurrent accept / rotate / cron paths cannot double-debit.
            $locked = PlayInvitation::where('id', $invite->id)->lockForUpdate()->first();
            if (!$locked) {
                return;
            }
            $invite->setRawAttributes($locked->getAttributes(), true);

            if ($invite->debited || $invite->status !== 'accepted') {
                return;
            }
            if ($this->isGuestMemberId($invite->member_id)) {
                $invite->debited = true;
                $invite->debited_amount = 0;
                $invite->save();
                return;
            }

            $member = Member::find($invite->member_id);
            if (!$member) {
                return;
            }

            if ($this->memberSkipsLeagueFee($schedule, $member->id)) {
                $invite->debited = true;
                $invite->debited_amount = 0;
                $invite->save();
                return;
            }

            // Juniors always debit from the parent adult's wallet.
            $walletMember = $this->resolveWalletMember($member);
            $memberFee = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);
            $isLeague = (bool) $schedule->is_league_match;
            $chargedAmount = 0.0;

            if (!$walletMember->skip_credit_consumption && $memberFee > 0) {
                $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                // Re-check credit under the wallet lock (non-league only; league may go negative).
                if (!$isLeague && $freshWallet->credit < $memberFee) {
                    return;
                }
                $freshWallet->credit = round($freshWallet->credit - $memberFee, 2);
                $freshWallet->save();
                $chargedAmount = $memberFee;

                $transaction = Transaction::create([
                    'id' => 't_' . Str::random(8),
                    'member_id' => $freshWallet->id,
                    'type' => 'debit',
                    'amount' => $memberFee,
                    'description' => 'Play session: ' . $schedule->name . ' - ' . $member->name,
                    'date' => now(),
                ]);

                if ($deferEmail && $deferredEmails !== null) {
                    $deferredEmails[] = [
                        'wallet_member_id' => $freshWallet->id,
                        'transaction_id' => $transaction->id,
                    ];
                } else {
                    try {
                        MailHelper::sendTransactionEmail($freshWallet, $transaction);
                    } catch (\Exception $e) {
                        logger()->error("Transaction debit email failed for member {$freshWallet->id}: " . $e->getMessage());
                    }
                }
            }

            $invite->debited = true;
            $invite->debited_amount = $chargedAmount;
            $invite->save();
        });
    }

    /**
     * Refund play session fee (accept-cancel, session cancel, re-release, etc.).
     * Locks the invite and refunds only if it is still debited under the lock.
     * Refunds the stored debited_amount snapshot when present, otherwise falls back to FeeHelper.
     */
    private function refundPlayInvite(PlaySchedule $schedule, PlayInvitation $invite): void
    {
        DB::transaction(function () use ($schedule, $invite) {
            $locked = PlayInvitation::where('id', $invite->id)->lockForUpdate()->first();
            if (!$locked) {
                return;
            }
            $invite->setRawAttributes($locked->getAttributes(), true);

            if (!$invite->debited || $this->isGuestMemberId($invite->member_id)) {
                return;
            }

            $member = Member::find($invite->member_id);
            if (!$member) {
                $invite->debited = false;
                $invite->debited_amount = null;
                $invite->save();
                return;
            }

            $snapshot = $invite->debited_amount;
            // Juniors always refund to the parent adult's wallet.
            $walletMember = $this->resolveWalletMember($member);

            if ($snapshot !== null) {
                $refundAmount = round((float) $snapshot, 2);
            } else {
                if (
                    $this->memberSkipsLeagueFee($schedule, $member->id)
                    || $walletMember->skip_credit_consumption
                ) {
                    $invite->debited = false;
                    $invite->debited_amount = null;
                    $invite->save();
                    return;
                }
                $refundAmount = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);
            }

            if ($refundAmount > 0) {
                $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                $freshWallet->credit = round($freshWallet->credit + $refundAmount, 2);
                $freshWallet->save();

                $transaction = Transaction::create([
                    'id' => 't_' . Str::random(8),
                    'member_id' => $freshWallet->id,
                    'type' => 'refund',
                    'amount' => $refundAmount,
                    'description' => 'Refund — cancelled play session: ' . $schedule->name . ' - ' . $member->name,
                    'date' => now(),
                ]);

                try {
                    MailHelper::sendTransactionEmail($freshWallet, $transaction);
                } catch (\Exception $e) {
                    logger()->error("Transaction refund email failed for member {$freshWallet->id}: " . $e->getMessage());
                }
            }

            $invite->debited = false;
            $invite->debited_amount = null;
            $invite->save();
        });
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
        self::processAutoPublishAndRotation();
        $user = $request->user();
        $isAdmin = $user && $user->role === 'admin';
        $userMembers = $user ? Member::where('user_id', $user->id)
            ->where('status', 'active')
            ->where('membership', true)
            ->get() : collect();
        $eligibleMemberIds = $userMembers->pluck('id')->all();

        $rotations = Rotation::all();
        return response()->json($rotations->map(function ($r) use ($isAdmin, $eligibleMemberIds, $user, $userMembers) {
            $schedule = PlaySchedule::find($r->schedule_id);
            // Members only see rotations after publish; admins see drafts too.
            if (!$isAdmin && (!$schedule || !in_array($schedule->status, ['published', 'closed'], true))) {
                return null;
            }
            if (!$isAdmin) {
                $groupIds = is_array($schedule->league_group_ids)
                    ? $schedule->league_group_ids
                    : (json_decode($schedule->league_group_ids ?? '[]', true) ?? []);
                $groupIds = array_values(array_filter((array)$groupIds));
                if (!empty($groupIds)) {
                    $isGroupEligible = false;
                    foreach ($userMembers as $uMember) {
                        if (self::isMemberEligibleForSchedule($uMember, $schedule)) {
                            $isGroupEligible = true;
                            break;
                        }
                    }
                    if (!$isGroupEligible) {
                        return null;
                    }
                }

                $hasAccepted = PlayInvitation::where('schedule_id', $r->schedule_id)
                    ->whereIn('member_id', $eligibleMemberIds)
                    ->where('status', 'accepted')
                    ->exists();
                if (!$hasAccepted) {
                    return null;
                }
            }
            return $this->formatRotation($r);
        })->filter()->values());
    }

    public function destroy($id)
    {
        if ($response = PermissionHelper::requireAdminPermission(request(), 'schedules.delete')) {
            return $response;
        }

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
