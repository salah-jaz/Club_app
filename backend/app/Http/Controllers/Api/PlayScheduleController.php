<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\Member;
use App\Models\Rotation;
use App\Models\Transaction;
use App\Helpers\MailHelper;
use App\Helpers\FeeHelper;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PlayScheduleController extends Controller
{
    public function index()
    {
        $schedules = PlaySchedule::orderBy('date', 'desc')->get();
        return response()->json($schedules->map(fn($s) => $this->formatSchedule($s)));
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

        $weeks = max(1, min(52, (int) $request->input('repeatWeeks', 1)));
        $baseDate = \Carbon\Carbon::parse($request->date);
        $created = [];

        for ($i = 0; $i < $weeks; $i++) {
            $date = $baseDate->copy()->addWeeks($i);
            $rawName = $i === 0 ? $request->name : $this->scheduleNameFromDate($date);
            $name = $this->uniqueScheduleName($rawName);

            $sch = PlaySchedule::create([
                'id' => 's_' . Str::random(8),
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

        if (in_array($sch->status, ['rotated', 'published', 'closed'], true)) {
            return response()->json([
                'message' => 'This schedule can no longer be edited after rotation has been generated.',
            ], 422);
        }

        $data = [];
        if ($request->has('name')) $data['name'] = $this->uniqueScheduleName($request->name, $sch->id);
        if ($request->has('date')) $data['date'] = $request->date;
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
 
        return response()->json($this->formatSchedule($sch));
    }

    public function release($id)
    {
        $sch = PlaySchedule::findOrFail($id);
        $sch->status = 'released';
        $sch->save();

        // Get active adult league participants
        $eligible = Member::eligibleForPlay();
        if ($sch->is_league_match && !empty($sch->league_group_ids)) {
            $memberIds = \DB::table('league_group_member')
                ->whereIn('league_group_id', $sch->league_group_ids)
                ->pluck('member_id')
                ->toArray();
            $eligible = $eligible->whereIn('id', $memberIds);
        }
        $eligible = $eligible->get();

        // Delete old invitations for this schedule (if any)
        PlayInvitation::where('schedule_id', $id)->delete();

        // Create new invitations
        $invites = [];
        foreach ($eligible as $member) {
            $inv = PlayInvitation::create([
                'id' => 'pi_' . Str::random(8),
                'schedule_id' => $id,
                'member_id' => $member->id,
                'status' => 'open',
            ]);
            $invites[] = [
                'id' => $inv->id,
                'scheduleId' => $inv->schedule_id,
                'memberId' => $inv->member_id,
                'status' => $inv->status,
                'debited' => (bool)$inv->debited,
            ];

            try {
                MailHelper::sendScheduleNotification($member, $sch, 'open', 'release');
            } catch (\Exception $e) {
                logger()->error("Schedule release email failed for member {$member->id}: " . $e->getMessage());
            }
        }

        return response()->json([
            'message' => 'Schedule released and invitations sent to ' . count($invites) . ' league participants.',
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
        ]);

        $sch = PlaySchedule::findOrFail($id);

        if ($sch->status !== 'released') {
            return response()->json([
                'message' => 'This play session is not open for enrollment.',
            ], 422);
        }

        $memberIds = $request->memberIds;
        $userId = $request->user()->id;

        $familyAdultIds = Member::eligibleForPlay()
            ->where('user_id', $userId)
            ->whereIn('id', $memberIds)
            ->pluck('id')
            ->all();

        if (count($familyAdultIds) !== count($memberIds)) {
            return response()->json([
                'message' => 'You can only enroll your own active adult members with club membership.',
            ], 422);
        }

        if ($sch->is_league_match && !empty($sch->league_group_ids)) {
            $groupMemberIds = \DB::table('league_group_member')
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
            $invites[] = $this->formatInvitation($inv);

            if ($member) {
                try {
                    MailHelper::sendScheduleNotification($member, $sch, 'open', 'release');
                } catch (\Exception $e) {
                    logger()->error("Schedule enroll email failed for member {$memberId}: " . $e->getMessage());
                }
            }
        }

        return response()->json([
            'message' => 'Members enrolled. Review and accept the invitations below.',
            'schedule' => $this->formatSchedule($sch),
            'invitations' => $invites,
        ]);
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

        // Save or update rotation in DB
        Rotation::where('schedule_id', $id)->delete();
        Rotation::create([
            'id' => 'r_' . Str::random(8),
            'schedule_id' => $id,
            'rounds' => $rounds,
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
            'rotation' => [
                'scheduleId' => $id,
                'rounds' => $rounds
            ],
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
            'rotation' => [
                'scheduleId' => $id,
                'rounds' => $rotation->rounds,
            ],
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

        $playCount = [];
        foreach ($rotationPlayers as $p) {
            $playCount[$p] = 0;
        }

        $rounds = [];
        for ($r = 1; $r <= $roundsCount; $r++) {
            $sorted = $rotationPlayers;
            usort($sorted, function ($a, $b) use ($playCount) {
                $diff = $playCount[$a] - $playCount[$b];
                if ($diff !== 0) {
                    return $diff;
                }
                return strcmp((string) $a, (string) $b);
            });

            $playing = array_slice($sorted, 0, $slots);
            $resting = array_slice($sorted, $slots);

            shuffle($playing);

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
        $payload = $invites->map(fn($i) => $this->formatInvitation($i))->values()->all();

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

        // Once rotation is generated (or published/closed), members cannot change RSVP
        if (in_array($sch->status, ['rotated', 'published', 'closed'], true)) {
            return response()->json([
                'message' => 'Court rotation is locked. Accept and decline are no longer available.',
            ], 422);
        }

        if ($desired === 'accepted') {
            if (!in_array($invite->status, ['open', 'declined'], true)) {
                return response()->json([
                    'message' => 'This invitation is already accepted or on the waiting list.',
                ], 422);
            }

            $member = Member::find($invite->member_id);
            if ($member && !$member->skip_credit_consumption) {
                $estimatedFee = FeeHelper::playSessionFee((float) $sch->session_rate, 0, 1, $member);
                if ($member->credit < $estimatedFee) {
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

            // Accepted players may cancel only within 24 hours of accepting
            if ($wasAccepted) {
                $acceptedAt = $invite->accepted_at ?? $invite->updated_at;
                if ($acceptedAt && $acceptedAt->lt(now()->subHours(24))) {
                    return response()->json([
                        'message' => 'Decline is no longer available. The 24-hour window after accepting has ended.',
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
                    if ($nextMember && !$nextMember->skip_credit_consumption) {
                        $estimatedFee = FeeHelper::playSessionFee(
                            (float) $sch->session_rate,
                            0,
                            1,
                            $nextMember
                        );
                        if ($nextMember->credit < $estimatedFee) {
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

        $memberFee = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);
        if (!$member->skip_credit_consumption && $memberFee > 0) {
            if ($member->credit < $memberFee) {
                return;
            }
            $member->credit -= $memberFee;
            $member->save();

            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $member->id,
                'type' => 'debit',
                'amount' => $memberFee,
                'description' => 'Play session: ' . $schedule->name,
                'date' => now(),
            ]);

            try {
                MailHelper::sendTransactionEmail($member, $transaction);
            } catch (\Exception $e) {
                logger()->error("Transaction debit email failed for member {$member->id}: " . $e->getMessage());
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
        if (!$member || $member->skip_credit_consumption) {
            $invite->debited = false;
            $invite->save();
            return;
        }

        $memberFee = FeeHelper::playSessionFee((float) $schedule->session_rate, 0, 1, $member);
        if ($memberFee > 0) {
            $member->credit += $memberFee;
            $member->save();

            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $member->id,
                'type' => 'credit',
                'amount' => $memberFee,
                'description' => 'Refund — cancelled play session: ' . $schedule->name,
                'date' => now(),
            ]);

            try {
                MailHelper::sendTransactionEmail($member, $transaction);
            } catch (\Exception $e) {
                logger()->error("Transaction refund email failed for member {$member->id}: " . $e->getMessage());
            }
        }

        $invite->debited = false;
        $invite->save();
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
            return [
                'scheduleId' => $r->schedule_id,
                'rounds' => $r->rounds ?? [],
            ];
        })->filter()->values());
    }

    public function destroy($id)
    {
        $sch = PlaySchedule::findOrFail($id);
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

    private function formatSchedule(PlaySchedule $s)
    {
        return [
            'id' => $s->id,
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
            'isLeagueMatch' => (bool)$s->is_league_match,
            'leagueGroupIds' => $s->league_group_ids ?? [],
        ];
    }
}
