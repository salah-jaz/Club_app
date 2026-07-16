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
        ]);

        $sch = PlaySchedule::create([
            'id' => 's_' . Str::random(8),
            'name' => $request->name,
            'date' => $request->date,
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

        return response()->json($this->formatSchedule($sch), 201);
    }

    public function update(Request $request, $id)
    {
        $sch = PlaySchedule::findOrFail($id);

        if (in_array($sch->status, ['rotated', 'closed'], true)) {
            return response()->json([
                'message' => 'This schedule can no longer be edited after rotation has been generated.',
            ], 422);
        }

        $data = [];
        if ($request->has('name')) $data['name'] = $request->name;
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

    public function rotate($id)
    {
        $schedule = PlaySchedule::findOrFail($id);
        $invites = PlayInvitation::where('schedule_id', $id)->where('status', 'accepted')->get();
        $playerIds = $invites->pluck('member_id')->toArray();

        if (empty($playerIds)) {
            return response()->json(['message' => 'No players accepted the invitation yet.'], 400);
        }

        $rounds = $this->buildRotationRounds($schedule, $playerIds);

        // Save or update rotation in DB
        Rotation::where('schedule_id', $id)->delete();
        Rotation::create([
            'id' => 'r_' . Str::random(8),
            'schedule_id' => $id,
            'rounds' => $rounds,
        ]);

        $fee = $schedule->session_rate;
        $feeRounded = round($fee, 2);

        foreach ($playerIds as $memberId) {
            $invite = PlayInvitation::where('schedule_id', $id)->where('member_id', $memberId)->first();
            if ($invite && $invite->debited) {
                continue;
            }

            $member = Member::find($memberId);
            if ($member) {
                $memberFee = FeeHelper::forMember($feeRounded, $member);
                if (!$member->skip_credit_consumption && $memberFee > 0) {
                    $member->credit -= $memberFee;
                    $member->save();
     
                    $transaction = Transaction::create([
                        'id' => 't_' . Str::random(8),
                        'member_id' => $memberId,
                        'type' => 'debit',
                        'amount' => $memberFee,
                        'description' => "Play session: " . $schedule->name,
                        'date' => now(),
                    ]);

                    try {
                        MailHelper::sendTransactionEmail($member, $transaction);
                    } catch (\Exception $e) {
                        logger()->error("Transaction debit email failed for member {$memberId}: " . $e->getMessage());
                    }
                }
            }

            if ($invite) {
                $invite->debited = true;
                $invite->save();
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

    /**
     * Build round/court assignments. Guests pad the pool up to
     * max(schedule capacity, courts × 4) so doubles courts stay full.
     */
    private function buildRotationRounds(PlaySchedule $schedule, array $playerIds): array
    {
        $courtsCount = max((int) $schedule->courts, 1);
        $roundsCount = 5;
        $playersPerCourt = 4;
        $slots = $courtsCount * $playersPerCourt;
        $capacity = max((int) $schedule->players, 1);
        $totalNeeded = max($capacity, $slots);
        $activeCount = count($playerIds);

        $guests = [];
        if ($activeCount < $totalNeeded) {
            $guestNeeded = $totalNeeded - $activeCount;
            for ($i = 1; $i <= $guestNeeded; $i++) {
                $guests[] = 'guest_' . $i;
            }
        }

        $rotationPlayers = array_merge($playerIds, $guests);

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
        return response()->json($invites->map(fn($i) => $this->formatInvitation($i)));
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
            $invite->save();
        } else {
            // Decline / cancel → return to Yet to Accept (open)
            $previous = $invite->status;
            $wasAccepted = $previous === 'accepted';

            $invite->status = 'open';
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
                        $next->save();
                        $promoted = $this->formatInvitation($next);
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

    public function listRotations()
    {
        $rotations = Rotation::all();
        return response()->json($rotations->map(function ($r) {
            $rounds = $this->ensureRotationGuests($r);
            return [
                'scheduleId' => $r->schedule_id,
                'rounds' => $rounds,
            ];
        }));
    }

    public function destroy($id)
    {
        $sch = PlaySchedule::findOrFail($id);
        $sch->delete();

        return response()->json(['message' => 'Play schedule deleted successfully.']);
    }

    /**
     * Rebuild rotation rounds when guest fillers were stripped and courts are short.
     * Guests pad up to max(capacity, courts × 4) so doubles courts stay complete.
     */
    private function ensureRotationGuests(Rotation $rotation): array
    {
        $rounds = $rotation->rounds ?? [];
        $schedule = PlaySchedule::find($rotation->schedule_id);
        if (!$schedule) {
            return $rounds;
        }

        $playerIds = PlayInvitation::where('schedule_id', $schedule->id)
            ->where('status', 'accepted')
            ->pluck('member_id')
            ->toArray();

        if (empty($playerIds)) {
            return $rounds;
        }

        $slots = max((int) $schedule->courts, 1) * 4;
        $capacity = max((int) $schedule->players, 1);
        $expectedGuests = max(0, max($capacity, $slots) - count($playerIds));

        $actualGuests = [];
        foreach ($rounds as $round) {
            foreach ($round['courts'] ?? [] as $court) {
                foreach ($court['players'] ?? [] as $p) {
                    if (is_string($p) && str_starts_with($p, 'guest_')) {
                        $actualGuests[$p] = true;
                    }
                }
            }
            foreach ($round['resting'] ?? [] as $p) {
                if (is_string($p) && str_starts_with($p, 'guest_')) {
                    $actualGuests[$p] = true;
                }
            }
        }

        if (count($actualGuests) >= $expectedGuests) {
            return $rounds;
        }

        $rounds = $this->buildRotationRounds($schedule, $playerIds);
        $rotation->rounds = $rounds;
        $rotation->save();

        return $rounds;
    }

    private function formatInvitation(PlayInvitation $i): array
    {
        return [
            'id' => $i->id,
            'scheduleId' => $i->schedule_id,
            'memberId' => $i->member_id,
            'status' => $i->status,
            'debited' => (bool) $i->debited,
            'updatedAt' => optional($i->updated_at)?->toISOString(),
            'createdAt' => optional($i->created_at)?->toISOString(),
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
