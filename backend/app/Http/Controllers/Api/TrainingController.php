<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\TrainingDate;
use App\Models\Holiday;
use App\Models\Member;
use App\Models\Transaction;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class TrainingController extends Controller
{
    public function index()
    {
        $trainings = Training::orderBy('start_date', 'desc')->get();
        return response()->json($trainings->map(fn($t) => $this->formatTraining($t)));
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'startDate' => 'required|date',
            'endDate' => 'required|date',
            'sessions' => 'required|integer|min:1',
            'slots' => 'required|integer|min:1',
            'duration' => 'required|string',
            'fees' => 'required|numeric',
            'coach' => 'required|string',
            'location' => 'required|string',
        ]);

        $tr = Training::create([
            'id' => 'tr_' . Str::random(8),
            'name' => $request->name,
            'start_date' => $request->startDate,
            'end_date' => $request->endDate,
            'sessions' => $request->sessions,
            'slots' => $request->slots,
            'duration' => $request->duration,
            'fees' => $request->fees,
            'coach' => $request->coach,
            'location' => $request->location,
            'status' => 'open',
        ]);

        return response()->json($this->formatTraining($tr), 201);
    }

    public function update(Request $request, $id)
    {
        $tr = Training::findOrFail($id);

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'startDate' => 'sometimes|required|date',
            'endDate' => 'sometimes|required|date',
            'sessions' => 'sometimes|required|integer|min:1',
            'slots' => 'sometimes|required|integer|min:1',
            'duration' => 'sometimes|required|string',
            'fees' => 'sometimes|required|numeric',
            'coach' => 'sometimes|required|string',
            'location' => 'sometimes|required|string',
            'status' => 'sometimes|required|string|in:open,released,closed',
        ]);

        $data = [];
        if ($request->has('name')) $data['name'] = $request->name;
        if ($request->has('startDate')) $data['start_date'] = $request->startDate;
        if ($request->has('endDate')) $data['end_date'] = $request->endDate;
        if ($request->has('sessions')) $data['sessions'] = $request->sessions;
        if ($request->has('slots')) $data['slots'] = $request->slots;
        if ($request->has('duration')) $data['duration'] = $request->duration;
        if ($request->has('fees')) $data['fees'] = $request->fees;
        if ($request->has('coach')) $data['coach'] = $request->coach;
        if ($request->has('location')) $data['location'] = $request->location;
        if ($request->has('status')) $data['status'] = $request->status;

        $tr->update($data);

        return response()->json($this->formatTraining($tr));
    }

    public function release(Request $request, $id)
    {
        $request->validate([
            'memberIds' => 'nullable|array',
            'memberIds.*' => 'required|string',
        ]);

        $tr = Training::findOrFail($id);
        $tr->status = 'released';
        $tr->save();

        $memberIds = $request->memberIds ?? [];
        $holidayDates = Holiday::pluck('date')->toArray();
        $dates = $this->generateWeeklyDates($tr->start_date, $tr->sessions, $holidayDates);

        $invites = [];
        $trainingDates = [];

        if (!empty($memberIds)) {
            // Delete old invitations and dates for this training for these members
            TrainingInvitation::where('training_id', $id)->whereIn('member_id', $memberIds)->delete();
            TrainingDate::where('training_id', $id)->whereIn('member_id', $memberIds)->delete();

            foreach ($memberIds as $mid) {
                $inv = TrainingInvitation::create([
                    'id' => 'ti_' . Str::random(8),
                    'training_id' => $id,
                    'member_id' => $mid,
                    'status' => 'open',
                ]);
                $invites[] = [
                    'id' => $inv->id,
                    'trainingId' => $inv->training_id,
                    'memberId' => $inv->member_id,
                    'status' => $inv->status,
                ];
            }

            foreach ($memberIds as $mid) {
                foreach ($dates as $d) {
                    $tDate = TrainingDate::create([
                        'id' => 'td_' . Str::random(8),
                        'training_id' => $id,
                        'member_id' => $mid,
                        'date' => $d,
                        'attended' => null,
                    ]);
                    $trainingDates[] = [
                        'id' => $tDate->id,
                        'trainingId' => $tDate->training_id,
                        'memberId' => $tDate->member_id,
                        'date' => $tDate->date,
                        'attended' => null,
                    ];
                }
            }
        }

        return response()->json([
            'message' => 'Training released.',
            'training' => $this->formatTraining($tr),
            'invitations' => $invites,
            'dates' => $trainingDates,
        ]);
    }

    public function registerJuniors(Request $request, $id)
    {
        $request->validate([
            'memberId' => 'required|string',
            'status' => 'required|in:accepted,declined',
        ]);

        $tr = Training::findOrFail($id);
        if ($tr->status !== 'released') {
            return response()->json(['message' => 'Training program is not released yet.'], 400);
        }

        $memberId = $request->memberId;
        $status = $request->status;

        $inv = TrainingInvitation::where('training_id', $id)->where('member_id', $memberId)->first();
        $isNewlyAccepted = false;

        if ($inv) {
            if ($inv->status !== 'accepted' && $status === 'accepted') {
                $isNewlyAccepted = true;
            }
            $inv->status = $status;
            $inv->save();
        } else {
            if ($status === 'accepted') {
                $isNewlyAccepted = true;
            }
            $inv = TrainingInvitation::create([
                'id' => 'ti_' . Str::random(8),
                'training_id' => $id,
                'member_id' => $memberId,
                'status' => $status,
            ]);
        }

        if ($status === 'accepted') {
            $existingDatesCount = TrainingDate::where('training_id', $id)->where('member_id', $memberId)->count();
            if ($existingDatesCount === 0) {
                $holidayDates = Holiday::pluck('date')->toArray();
                $dates = $this->generateWeeklyDates($tr->start_date, $tr->sessions, $holidayDates);

                foreach ($dates as $d) {
                    TrainingDate::create([
                        'id' => 'td_' . Str::random(8),
                        'training_id' => $id,
                        'member_id' => $memberId,
                        'date' => $d,
                        'attended' => null,
                    ]);
                }
            }

            if ($isNewlyAccepted) {
                $member = Member::find($memberId);
                if ($member) {
                    $member->credit -= $tr->fees;
                    $member->save();

                    Transaction::create([
                        'id' => 't_' . Str::random(8),
                        'member_id' => $memberId,
                        'type' => 'debit',
                        'amount' => $tr->fees,
                        'description' => "Training registration: " . $tr->name,
                        'date' => now(),
                    ]);
                }
            }
        } else {
            TrainingDate::where('training_id', $id)->where('member_id', $memberId)->delete();
        }

        return response()->json([
            'message' => 'Training invitation updated.',
            'invitation' => [
                'id' => $inv->id,
                'trainingId' => $inv->training_id,
                'memberId' => $inv->member_id,
                'status' => $inv->status,
            ]
        ]);
    }

    public function listInvitations()
    {
        $invites = TrainingInvitation::all();
        return response()->json($invites->map(fn($i) => [
            'id' => $i->id,
            'trainingId' => $i->training_id,
            'memberId' => $i->member_id,
            'status' => $i->status,
        ]));
    }

    public function respondInvitation(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:accepted,declined,waiting,open',
        ]);

        $invite = TrainingInvitation::findOrFail($id);
        $oldStatus = $invite->status;
        $invite->status = $request->status;
        $invite->save();

        // If transitioning to accepted, deduct fee and log transaction
        if ($invite->status === 'accepted' && $oldStatus !== 'accepted') {
            $tr = Training::find($invite->training_id);
            $member = Member::find($invite->member_id);
            if ($tr && $member) {
                $member->credit -= $tr->fees;
                $member->save();

                Transaction::create([
                    'id' => 't_' . Str::random(8),
                    'member_id' => $invite->member_id,
                    'type' => 'debit',
                    'amount' => $tr->fees,
                    'description' => "Training invitation accepted: " . $tr->name,
                    'date' => now(),
                ]);
            }
        }

        return response()->json([
            'id' => $invite->id,
            'trainingId' => $invite->training_id,
            'memberId' => $invite->member_id,
            'status' => $invite->status,
        ]);
    }

    public function listDates()
    {
        $dates = TrainingDate::all();
        return response()->json($dates->map(fn($d) => [
            'id' => $d->id,
            'trainingId' => $d->training_id,
            'memberId' => $d->member_id,
            'date' => $d->date,
            'attended' => $d->attended === null ? null : (bool)$d->attended,
        ]));
    }

    public function markAttendance(Request $request, $id)
    {
        $request->validate([
            'attended' => 'required|boolean',
        ]);

        $tDate = TrainingDate::findOrFail($id);
        $tDate->attended = $request->attended;
        $tDate->save();

        return response()->json([
            'id' => $tDate->id,
            'trainingId' => $tDate->training_id,
            'memberId' => $tDate->member_id,
            'date' => $tDate->date,
            'attended' => (bool)$tDate->attended,
        ]);
    }

    public function destroy($id)
    {
        $tr = Training::findOrFail($id);
        $tr->delete();

        return response()->json(['message' => 'Training program deleted successfully.']);
    }

    private function generateWeeklyDates($startDate, $sessions, $holidayDates = [])
    {
        $result = [];
        $current = new \DateTime($startDate);
        $safety = 0;
        while (count($result) < $sessions && $safety < 200) {
            $iso = $current->format('Y-m-d');
            if (!in_array($iso, $holidayDates)) {
                $result[] = $iso;
            }
            $current->modify('+7 days');
            $safety++;
        }
        return $result;
    }

    private function formatTraining(Training $t)
    {
        return [
            'id' => $t->id,
            'name' => $t->name,
            'startDate' => $t->start_date,
            'endDate' => $t->end_date,
            'sessions' => (int)$t->sessions,
            'slots' => (int)$t->slots,
            'duration' => $t->duration,
            'fees' => (float)$t->fees,
            'coach' => $t->coach,
            'location' => $t->location,
            'status' => $t->status,
        ];
    }
}
