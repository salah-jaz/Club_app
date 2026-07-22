<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\TrainingDate;
use App\Models\Holiday;
use App\Models\Member;
use App\Helpers\MailHelper;
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

        try {
            $invitations = TrainingInvitation::where('training_id', $tr->id)->get();
            foreach ($invitations as $inv) {
                $member = Member::find($inv->member_id);
                if ($member) {
                    MailHelper::sendTrainingNotification($member, $tr, $inv->status, 'update');
                }
            }
        } catch (\Exception $e) {
            logger()->error("Training update email notification failed: " . $e->getMessage());
        }

        return response()->json($this->formatTraining($tr));
    }

    public function release(Request $request, $id)
    {
        $request->validate([
            'memberIds' => 'sometimes|array',
            'memberIds.*' => 'required|string',
        ]);

        $tr = Training::findOrFail($id);
        $tr->status = 'released';
        $tr->save();

        $memberIds = $request->input('memberIds', []);

        if (count($memberIds) === 0) {
            return response()->json([
                'message' => 'Training program opened. Family heads can now enroll their children.',
                'training' => $this->formatTraining($tr),
                'invitations' => [],
                'dates' => [],
            ]);
        }

        $eligibleIds = Member::eligibleForTraining()
            ->whereIn('id', $memberIds)
            ->pluck('id')
            ->all();

        if (count($eligibleIds) !== count($memberIds)) {
            return response()->json([
                'message' => 'One or more selected members are not eligible for training invitations.',
            ], 422);
        }

        TrainingInvitation::where('training_id', $id)->delete();
        TrainingDate::where('training_id', $id)->delete();

        [$invites, $trainingDates] = $this->createInvitationsForMembers($tr, $memberIds);

        return response()->json([
            'message' => 'Training released and invitations sent.',
            'training' => $this->formatTraining($tr),
            'invitations' => $invites,
            'dates' => $trainingDates,
        ]);
    }

    public function enroll(Request $request, $id)
    {
        $request->validate([
            'memberIds' => 'required|array|min:1',
            'memberIds.*' => 'required|string',
        ]);

        $tr = Training::findOrFail($id);

        if (!in_array($tr->status, ['open', 'released'], true)) {
            return response()->json([
                'message' => 'This training program is not open for enrollment.',
            ], 422);
        }

        if ($tr->status === 'open') {
            $tr->status = 'released';
            $tr->save();
        }

        $memberIds = $request->memberIds;
        $userId = $request->user()->id;

        $familyJuniorIds = Member::query()
            ->where('user_id', $userId)
            ->where('member_type', 'junior')
            ->where('status', 'active')
            ->whereIn('id', $memberIds)
            ->pluck('id')
            ->all();

        if (count($familyJuniorIds) !== count($memberIds)) {
            return response()->json([
                'message' => 'You can only enroll your own active junior family members.',
            ], 422);
        }

        $alreadyInvited = TrainingInvitation::where('training_id', $id)
            ->whereIn('member_id', $memberIds)
            ->pluck('member_id')
            ->all();

        $newMemberIds = array_values(array_diff($memberIds, $alreadyInvited));

        if (count($newMemberIds) === 0) {
            return response()->json([
                'message' => 'Selected family members are already enrolled in this program.',
            ], 422);
        }

        [$invites, $trainingDates] = $this->createInvitationsForMembers($tr, $newMemberIds, false, 'accepted');

        return response()->json([
            'message' => 'Family members accepted into this training program.',
            'training' => $this->formatTraining($tr),
            'invitations' => $invites,
            'dates' => $trainingDates,
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
        $invite->status = $request->status;
        $invite->save();

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

    private function createInvitationsForMembers(
        Training $tr,
        array $memberIds,
        bool $replaceDatesForMember = true,
        string $inviteStatus = 'open',
    ): array
    {
        $holidayDates = Holiday::pluck('date')->toArray();
        $dates = $this->generateWeeklyDates($tr->start_date, $tr->sessions, $holidayDates);

        $invites = [];
        foreach ($memberIds as $mid) {
            $inv = TrainingInvitation::create([
                'id' => 'ti_' . Str::random(8),
                'training_id' => $tr->id,
                'member_id' => $mid,
                'status' => $inviteStatus,
            ]);
            $invites[] = [
                'id' => $inv->id,
                'trainingId' => $inv->training_id,
                'memberId' => $inv->member_id,
                'status' => $inv->status,
            ];

            $member = Member::find($mid);
            if ($member) {
                try {
                    MailHelper::sendTrainingNotification($member, $tr, $inviteStatus, 'release');
                } catch (\Exception $e) {
                    logger()->error("Training release email failed for member {$mid}: " . $e->getMessage());
                }
            }
        }

        $trainingDates = [];
        foreach ($memberIds as $mid) {
            if ($replaceDatesForMember) {
                TrainingDate::where('training_id', $tr->id)->where('member_id', $mid)->delete();
            }
            foreach ($dates as $d) {
                $tDate = TrainingDate::create([
                    'id' => 'td_' . Str::random(8),
                    'training_id' => $tr->id,
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

        return [$invites, $trainingDates];
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

    public function destroy($id)
    {
        $t = Training::findOrFail($id);
        $t->delete();

        return response()->json(['message' => 'Training program deleted successfully.']);
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
