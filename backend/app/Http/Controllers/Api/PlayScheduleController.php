<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\Member;
use App\Models\Rotation;
use App\Models\Transaction;
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
        ]);

        return response()->json($this->formatSchedule($sch), 201);
    }

    public function update(Request $request, $id)
    {
        $sch = PlaySchedule::findOrFail($id);

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'date' => 'sometimes|required|date',
            'courts' => 'sometimes|required|integer|min:1',
            'players' => 'sometimes|required|integer|min:1',
            'slotHours' => 'sometimes|required|numeric',
            'slotDuration' => 'sometimes|required|string',
            'sessionRate' => 'sometimes|required|numeric',
            'hallRate' => 'sometimes|required|numeric',
            'location' => 'sometimes|required|string',
            'status' => 'sometimes|required|string|in:open,released,rotated,closed',
        ]);

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

        $sch->update($data);

        return response()->json($this->formatSchedule($sch));
    }

    public function release($id)
    {
        $sch = PlaySchedule::findOrFail($id);
        $sch->status = 'released';
        $sch->save();

        // Calculate the minimum session fee a player would pay if the session is full
        $minFee = $sch->session_rate + ($sch->hall_rate / max($sch->players, 1));

        // Get active adult members who have enough credits
        $adults = Member::where('member_type', 'adult')
            ->where('status', 'active')
            ->where('credit', '>=', $minFee)
            ->get();

        // Delete old invitations for this schedule (if any)
        PlayInvitation::where('schedule_id', $id)->delete();

        // Create new invitations
        $invites = [];
        foreach ($adults as $member) {
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
            ];
        }

        return response()->json([
            'message' => 'Schedule released and invitations sent.',
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

        $courtsCount = $schedule->courts;
        $roundsCount = 5;
        $playersPerCourt = 4;
        $slots = $courtsCount * $playersPerCourt;

        // Total capacity target is defined by the schedule master target players count
        $targetCount = $schedule->players;
        $totalNeeded = max($targetCount, $slots);

        $guests = [];
        $activeCount = count($playerIds);
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
                return strcmp($a, $b);
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

        // Save or update rotation in DB
        Rotation::where('schedule_id', $id)->delete();
        $rotation = Rotation::create([
            'id' => 'r_' . Str::random(8),
            'schedule_id' => $id,
            'rounds' => $rounds,
        ]);

        $fee = $schedule->session_rate + ($schedule->hall_rate / max(count($playerIds), 1));
        $feeRounded = round($fee, 2);

        foreach ($playerIds as $memberId) {
            $member = Member::find($memberId);
            if ($member) {
                $member->credit -= $feeRounded;
                $member->save();

                Transaction::create([
                    'id' => 't_' . Str::random(8),
                    'member_id' => $memberId,
                    'type' => 'debit',
                    'amount' => $feeRounded,
                    'description' => "Play session: " . $schedule->name,
                    'date' => now(),
                ]);
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

    public function listInvitations()
    {
        $invites = PlayInvitation::all();
        return response()->json($invites->map(fn($i) => [
            'id' => $i->id,
            'scheduleId' => $i->schedule_id,
            'memberId' => $i->member_id,
            'status' => $i->status,
        ]));
    }

    public function respondInvitation(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:accepted,declined,waiting,open',
        ]);

        $invite = PlayInvitation::findOrFail($id);
        $invite->status = $request->status;
        $invite->save();

        return response()->json([
            'id' => $invite->id,
            'scheduleId' => $invite->schedule_id,
            'memberId' => $invite->member_id,
            'status' => $invite->status,
        ]);
    }

    public function listRotations()
    {
        $rotations = Rotation::all();
        return response()->json($rotations->map(fn($r) => [
            'scheduleId' => $r->schedule_id,
            'rounds' => $r->rounds,
        ]));
    }

    public function destroy($id)
    {
        $sch = PlaySchedule::findOrFail($id);
        $sch->delete();

        return response()->json(['message' => 'Play schedule deleted successfully.']);
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
        ];
    }
}
