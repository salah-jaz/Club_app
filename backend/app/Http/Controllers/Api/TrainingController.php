<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\TrainingDate;
use App\Models\TrainingUpdateRequest;
use App\Models\Holiday;
use App\Models\Member;
use App\Models\Setting;
use App\Models\Transaction;
use App\Helpers\MailHelper;
use App\Helpers\PermissionHelper;
use App\Helpers\FamilyScopeHelper;
use App\Helpers\FeeHelper;
use App\Helpers\SessionTimingHelper;
use App\Helpers\WalletHelper;
use App\Services\InvitationSyncService;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;

class TrainingController extends Controller
{
    /**
     * Get all active member IDs associated with the current user account (adult + juniors).
     */
    private function getFamilyMemberIdsForUser($user): array
    {
        if (!$user) {
            return [];
        }

        return FamilyScopeHelper::familyMemberIds($user);
    }

    public function index(?Request $request = null)
    {
        $request = $request ?? request();
        $user = $request ? $request->user() : null;

        if ($user && $user->role !== 'admin') {
            $myMemberIds = $this->getFamilyMemberIdsForUser($user);

            // Members ONLY see training programs they have been invited to (sent invitations: open, accepted, waiting, declined).
            // Creating a training must NOT make it visible to uninvited members.
            $invitedTrainingIds = TrainingInvitation::whereIn('member_id', $myMemberIds)
                ->whereIn('status', ['open', 'accepted', 'waiting', 'declined'])
                ->pluck('training_id')
                ->all();

            if (empty($invitedTrainingIds)) {
                return response()->json([]);
            }

            $seriesParentIds = Training::whereIn('id', $invitedTrainingIds)
                ->get()
                ->map(fn($t) => $t->parent_id ?: $t->id)
                ->filter()
                ->unique()
                ->values()
                ->all();

            $trainings = Training::where(function ($q) use ($invitedTrainingIds, $seriesParentIds) {
                $q->whereIn('id', $invitedTrainingIds);
                if (!empty($seriesParentIds)) {
                    $q->orWhereIn('parent_id', $seriesParentIds)
                      ->orWhereIn('id', $seriesParentIds);
                }
            })
            ->orderBy('start_date', 'desc')
            ->get();

            return response()->json($trainings->map(fn(Training $t) => $this->formatTraining($t)));
        }

        $trainings = Training::orderBy('start_date', 'desc')->get();
        return response()->json($trainings->map(fn(Training $t) => $this->formatTraining($t)));
    }

    public function store(Request $request)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'trainings.create')) {
            return $response;
        }

        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'startDate' => 'required|date',
            'endDate' => 'required|date',
            'repeatWeeks' => 'sometimes|integer|min:1|max:5',
            'repeatMonths' => 'sometimes|integer|min:1|max:24',
            'sessions' => 'sometimes|integer|min:1',
            'slots' => 'required|integer|min:1',
            'duration' => 'required|string',
            'fees' => 'required|numeric',
            'coach' => 'required|string',
            'location' => 'required|string',
            'targetType' => 'required|in:adult,junior,Adult,Junior',
            'isGroupTraining' => 'sometimes|boolean',
            'leagueGroupIds' => 'sometimes|array',
            'leagueGroupIds.*' => 'string',
        ], [
            'repeatWeeks.max' => 'Repeat for Weeks cannot be greater than 5. Please select a value between 1 and 5.',
            'repeatWeeks.min' => 'Repeat for Weeks cannot be greater than 5. Please select a value between 1 and 5.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'message' => $validator->errors()->first('repeatWeeks') ?: $validator->errors()->first()
            ], 422);
        }

        $repeatWeeks = (int) $request->input('repeatWeeks', 3);
        if ($repeatWeeks > 5 || $repeatWeeks < 1) {
            return response()->json([
                'message' => 'Repeat for Weeks cannot be greater than 5. Please select a value between 1 and 5.'
            ], 422);
        }
        $repeatMonths = max(1, min(24, (int) $request->input('repeatMonths', 1)));
        $targetType = strtolower($request->targetType) === 'adult' ? 'adult' : 'junior';

        $baseStart = \Carbon\Carbon::parse($request->startDate);
        $baseEnd = \Carbon\Carbon::parse($request->endDate);
        $durationMins = SessionTimingHelper::parseDurationMinutes($request->duration ?? '1 hour');
        if ($baseEnd->isSameDay($baseStart) && $baseEnd->gt($baseStart)) {
            $durationMins = max(15, $baseStart->diffInMinutes($baseEnd));
        }
        $dayOfWeek = $baseStart->dayOfWeek;

        $parentId = 'tr_' . Str::random(8);
        $sessionDates = [];

        for ($m = 0; $m < $repeatMonths; $m++) {
            $monthStart = $baseStart->copy()->startOfMonth()->addMonths($m)->setTime($baseStart->hour, $baseStart->minute, $baseStart->second);
            $rangeStart = ($m === 0) ? $baseStart->copy() : $monthStart->copy();
            $rangeEnd = $monthStart->copy()->endOfMonth();

            $countInMonth = 0;
            $curr = $rangeStart->copy();
            while ($curr->lte($rangeEnd)) {
                if ($curr->dayOfWeek === $dayOfWeek) {
                    $sessionDates[] = $curr->copy();
                    $countInMonth++;
                    if ($countInMonth >= $repeatWeeks) {
                        break;
                    }
                }
                $curr->addDay();
            }
        }

        $totalSessions = count($sessionDates);
        $created = [];

        foreach ($sessionDates as $index => $sStart) {
            $isParent = ($index === 0);
            $schId = $isParent ? $parentId : ('tr_' . Str::random(8));
            $sEnd = $sStart->copy()->addMinutes($durationMins);

            $rawName = $isParent ? $request->name : $this->trainingNameFromDate($sStart);
            $name = $this->uniqueTrainingName($rawName);

            $tr = Training::create([
                'id' => $schId,
                'parent_id' => $parentId,
                'name' => $name,
                'start_date' => $sStart->format('Y-m-d H:i:s'),
                'end_date' => $sEnd->format('Y-m-d H:i:s'),
                'repeat_weeks' => $repeatWeeks,
                'repeat_months' => $repeatMonths,
                'sessions' => $totalSessions,
                'slots' => $request->slots,
                'duration' => $request->duration,
                'fees' => $request->fees,
                'coach' => $request->coach,
                'location' => $request->location,
                'status' => 'created',
                'target_type' => $targetType,
                'is_group_training' => $request->boolean('isGroupTraining'),
                'league_group_ids' => $request->input('leagueGroupIds', []),
            ]);

            $created[] = $tr;
        }

        return response()->json($this->formatTraining($created[0]), 201);
    }

    private function trainingNameFromDate(\Carbon\Carbon $date): string
    {
        return $date->format('l') . ' · ' . $date->format('j M Y') . ' · ' . $date->format('g:i A');
    }

    private function uniqueTrainingName(string $desired, ?string $excludeId = null): string
    {
        $base = preg_replace('/ \(\d+\)$/', '', $desired) ?: $desired;

        if (!$this->trainingNameExists($base, $excludeId)) {
            return $base;
        }

        $n = 2;
        while ($this->trainingNameExists("{$base} ({$n})", $excludeId)) {
            $n++;
        }

        return "{$base} ({$n})";
    }

    private function trainingNameExists(string $name, ?string $excludeId = null): bool
    {
        $query = Training::query()->where('name', $name);
        if ($excludeId) {
            $query->where('id', '!=', $excludeId);
        }
        return $query->exists();
    }

    public function update(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'trainings.edit')) {
            return $response;
        }

        $tr = Training::findOrFail($id);

        if ($request->has('repeatWeeks')) {
            $reqWeeks = (int) $request->input('repeatWeeks');
            if ($reqWeeks > 5 || $reqWeeks < 1) {
                return response()->json([
                    'message' => 'Repeat for Weeks cannot be greater than 5. Please select a value between 1 and 5.'
                ], 422);
            }
        }

        if (empty($tr->parent_id)) {
            $tr->parent_id = $tr->id;
            $tr->save();
        }

        $parentId = $tr->parent_id;

        // Fetch existing series ordered by start_date
        $series = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();

        foreach ($series as $sItem) {
            if ($sItem->parent_id !== $parentId) {
                $sItem->parent_id = $parentId;
                $sItem->save();
            }
        }

        $firstSession = $series->first();
        $oldWeeks = (int)($tr->repeat_weeks ?? 3);
        $oldMonths = (int)($firstSession->repeat_months ?? $tr->repeat_months ?? 1);

        $coachVal = $request->input('coach') ?: ($tr->coach ?: ($firstSession->coach ?? 'Coach Lee'));
        $locationVal = $request->input('location') ?: ($tr->location ?: ($firstSession->location ?? 'Main Hall'));
        $slotsVal = $request->input('slots') !== null ? (int)$request->input('slots') : ($tr->slots ?? $firstSession->slots ?? 10);
        $durationVal = $request->input('duration') ?: ($tr->duration ?: ($firstSession->duration ?? '1 hour'));
        $feesVal = $request->input('fees') !== null ? (float)$request->input('fees') : ($tr->fees ?? $firstSession->fees ?? 0);
        $targetTypeVal = $request->input('targetType') ? (strtolower($request->input('targetType')) === 'adult' ? 'adult' : 'junior') : ($tr->target_type ?? $firstSession->target_type ?? 'junior');

        $parentStart = \Carbon\Carbon::parse($firstSession->start_date);
        $trStart = \Carbon\Carbon::parse($tr->start_date);
        $mIdx = ($trStart->year - $parentStart->year) * 12 + ($trStart->month - $parentStart->month);
        if ($mIdx < 0) {
            $mIdx = 0;
        }

        $newWeeks = $request->has('repeatWeeks') ? max(1, min(5, (int) $request->input('repeatWeeks'))) : $oldWeeks;

        if ($request->has('repeatMonths')) {
            $inputRFM = max(1, min(24, (int) $request->input('repeatMonths')));
            $newMonths = max(1, min(24, $inputRFM + $mIdx));
        } else {
            $newMonths = $oldMonths;
        }

        if ($tr->id === $firstSession->id) {
            $baseStart = $request->has('startDate') ? \Carbon\Carbon::parse($request->startDate) : $parentStart;
        } else {
            $baseStart = $parentStart;
        }
        $baseEnd = \Carbon\Carbon::parse($firstSession->end_date);
        $durationMins = SessionTimingHelper::parseDurationMinutes($durationVal ?? '1 hour');
        if ($baseEnd->isSameDay($baseStart) && $baseEnd->gt($baseStart)) {
            $durationMins = max(15, $baseStart->diffInMinutes($baseEnd));
        }
        $dayOfWeek = $baseStart->dayOfWeek;

        if ($request->has('repeatWeeks') || $request->has('repeatMonths') || $request->has('startDate')) {
            $targetDates = [];
            for ($m = 0; $m < $newMonths; $m++) {
                $monthStart = $baseStart->copy()->startOfMonth()->addMonths($m)->setTime($baseStart->hour, $baseStart->minute, $baseStart->second);
                $rangeStart = ($m === 0) ? $baseStart->copy() : $monthStart->copy();
                $rangeEnd = $monthStart->copy()->endOfMonth();

                $countInMonth = 0;
                $curr = $rangeStart->copy();
                while ($curr->lte($rangeEnd)) {
                    if ($curr->dayOfWeek === $dayOfWeek) {
                        $targetDates[] = $curr->format('Y-m-d');
                        $countInMonth++;
                        if ($countInMonth >= $newWeeks) {
                            break;
                        }
                    }
                    $curr->addDay();
                }
            }

            $targetDatesSet = array_flip($targetDates);

            foreach ($series as $sItem) {
                $sDateStr = \Carbon\Carbon::parse($sItem->start_date)->format('Y-m-d');
                if (!isset($targetDatesSet[$sDateStr])) {
                    $hasAccepted = TrainingInvitation::where('training_id', $sItem->id)
                        ->where('status', 'accepted')
                        ->exists();
                    if (!$hasAccepted) {
                        TrainingInvitation::where('training_id', $sItem->id)->delete();
                        TrainingDate::where('training_id', $sItem->id)->delete();
                        $sItem->delete();
                    }
                }
            }

            $existingSeries = Training::where('parent_id', $parentId)
                ->orWhere('id', $parentId)
                ->orderBy('start_date', 'asc')
                ->get();
            $existingDateStrings = $existingSeries->map(fn($item) => \Carbon\Carbon::parse($item->start_date)->format('Y-m-d'))->toArray();

            foreach ($targetDates as $tDateStr) {
                if (!in_array($tDateStr, $existingDateStrings)) {
                    $sStart = \Carbon\Carbon::parse($tDateStr . ' ' . $baseStart->format('H:i:s'));
                    $sEnd = $sStart->copy()->addMinutes($durationMins);
                    $rawName = $this->trainingNameFromDate($sStart);
                    $name = $this->uniqueTrainingName($rawName);

                    Training::create([
                        'id' => 'tr_' . Str::random(8),
                        'parent_id' => $parentId,
                        'name' => $name,
                        'start_date' => $sStart->format('Y-m-d H:i:s'),
                        'end_date' => $sEnd->format('Y-m-d H:i:s'),
                        'repeat_weeks' => $newWeeks,
                        'repeat_months' => $newMonths,
                        'sessions' => count($targetDates),
                        'slots' => $slotsVal,
                        'duration' => $durationVal,
                        'fees' => $feesVal,
                        'coach' => $coachVal,
                        'location' => $locationVal,
                        'status' => 'open',
                        'target_type' => $targetTypeVal,
                        'is_group_training' => $tr->is_group_training,
                        'league_group_ids' => $tr->league_group_ids,
                    ]);
                }
            }
        }

        $data = [];
        if ($request->has('name') && !empty($request->name)) $data['name'] = $this->uniqueTrainingName($request->name, $tr->id);
        if ($request->has('startDate') && !empty($request->startDate)) $data['start_date'] = \Carbon\Carbon::parse($request->startDate)->format('Y-m-d H:i:s');
        if ($request->has('endDate') && !empty($request->endDate)) $data['end_date'] = \Carbon\Carbon::parse($request->endDate)->format('Y-m-d H:i:s');
        if ($request->has('repeatWeeks')) $data['repeat_weeks'] = $newWeeks;
        if ($request->has('repeatMonths')) $data['repeat_months'] = $newMonths;
        if ($request->has('slots') && $request->slots !== null) $data['slots'] = $request->slots;
        if ($request->has('duration') && !empty($request->duration)) $data['duration'] = $request->duration;
        if ($request->has('fees') && $request->fees !== null) $data['fees'] = $request->fees;
        if ($request->has('coach') && !empty($request->coach)) {
            $data['coach'] = $request->coach;
        } elseif (empty($tr->coach)) {
            $data['coach'] = $coachVal;
        }
        if ($request->has('location') && !empty($request->location)) {
            $data['location'] = $request->location;
        } elseif (empty($tr->location)) {
            $data['location'] = $locationVal;
        }
        if ($request->has('status') && !empty($request->status)) {
            if ($request->status === 'closed') {
                return response()->json([
                    'message' => 'Use POST /trainings/{id}/close to close a training program.',
                ], 422);
            }
            if ($request->status === 'cancelled') {
                return response()->json([
                    'message' => 'Use POST /trainings/{id}/cancel to cancel a training program.',
                ], 422);
            }
            $data['status'] = $request->status;
        }
        if ($request->has('targetType')) {
            $data['target_type'] = $targetTypeVal;
        }
        if ($request->has('isGroupTraining')) {
            $data['is_group_training'] = $request->boolean('isGroupTraining');
        }
        if ($request->has('leagueGroupIds')) {
            $data['league_group_ids'] = $request->input('leagueGroupIds', []);
        }

        $tr->update($data);

        // Synchronize repeat_weeks, repeat_months, sessions, and fees on remaining series items
        $updatedSeries = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();
        $totalCount = $updatedSeries->count();
        $newFees = $request->has('fees') ? $request->fees : $tr->fees;
        $hasStartDateChange = $request->has('startDate') && !empty($request->startDate);
        $newTime = $baseStart->format('H:i:s');

        if ($hasStartDateChange) {
            TrainingDate::where('training_id', $tr->id)->update(['date' => $tr->start_date]);
        }

        foreach ($updatedSeries as $sItem) {
            $sItemData = [
                'repeat_weeks' => $newWeeks,
                'repeat_months' => $newMonths,
                'sessions' => $totalCount,
                'fees' => $newFees,
                'target_type' => $targetTypeVal,
            ];
            if ($hasStartDateChange && $sItem->id !== $tr->id) {
                $sItemDate = \Carbon\Carbon::parse($sItem->start_date)->format('Y-m-d');
                $sItemStart = \Carbon\Carbon::parse($sItemDate . ' ' . $newTime);
                $sItemEnd = $sItemStart->copy()->addMinutes($durationMins);
                $sItemData['start_date'] = $sItemStart->format('Y-m-d H:i:s');
                $sItemData['end_date'] = $sItemEnd->format('Y-m-d H:i:s');
                $sItemData['duration'] = $durationVal;
                $sItemData['name'] = $this->uniqueTrainingName($this->trainingNameFromDate($sItemStart), $sItem->id);

                TrainingDate::where('training_id', $sItem->id)->update(['date' => $sItemStart->format('Y-m-d H:i:s')]);
            }
            if ($request->has('isGroupTraining')) {
                $sItemData['is_group_training'] = $request->boolean('isGroupTraining');
            }
            if ($request->has('leagueGroupIds')) {
                $sItemData['league_group_ids'] = $request->input('leagueGroupIds', []);
            }
            if (empty($sItem->coach) && !empty($coachVal)) {
                $sItemData['coach'] = $coachVal;
            }
            // Always propagate an explicit location change across the series so every
            // month card keeps the same saved location after edit.
            if ($request->has('location') && !empty($request->location)) {
                $sItemData['location'] = $request->location;
            } elseif (empty($sItem->location) && !empty($locationVal)) {
                $sItemData['location'] = $locationVal;
            }
            $sItem->update($sItemData);
        }
        return response()->json($this->formatTraining($tr->fresh()));
    }

    public function release(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'trainings.edit')) {
            return $response;
        }

        $request->validate([
            'memberIds' => 'sometimes|array',
            'memberIds.*' => 'required|string',
        ]);

        $tr = Training::findOrFail($id);
        $tr->status = 'released';
        $tr->save();

        $memberIds = $request->input('memberIds', []);
        $targetType = $tr->target_type ?? 'junior';

        if ((bool) $tr->is_group_training && !empty($tr->league_group_ids)) {
            $memberIds = DB::table('league_group_member')
                ->whereIn('league_group_id', $tr->league_group_ids)
                ->pluck('member_id')
                ->unique()
                ->values()
                ->all();

            $memberIds = Member::where('member_type', $targetType)
                ->where('status', 'active')
                ->whereIn('id', $memberIds)
                ->pluck('id')
                ->all();
        } else {
            if (count($memberIds) === 0) {
                $memberIds = Member::eligibleForTraining($targetType)->pluck('id')->all();
            } else {
                $eligibleIds = Member::eligibleForTraining($targetType)
                    ->whereIn('id', $memberIds)
                    ->pluck('id')
                    ->all();

                if (count($eligibleIds) !== count($memberIds)) {
                    return response()->json([
                        'message' => 'One or more selected members are not eligible for training invitations.',
                    ], 422);
                }
            }
        }

        [$invites, $trainingDates] = $this->createInvitationsForMembers($tr, $memberIds);

        return response()->json([
            'message' => 'Training released and invitations sent.',
            'training' => $this->formatTraining($tr),
            'invitations' => $invites,
            'dates' => $trainingDates,
        ]);
    }

    public function updateMemberInvitation(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'trainings.edit')) {
            return $response;
        }

        $request->validate([
            'memberId' => 'required|string',
            'sessionIds' => 'present|array',
            'sessionIds.*' => 'string',
            'forceAccept' => 'sometimes|boolean',
        ]);

        $tr = Training::findOrFail($id);
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

        $memberId = $request->memberId;
        $selectedSids = array_values(array_intersect($request->input('sessionIds', []), $monthSessionIds));
        $forceAccept = (bool) $request->input('forceAccept', false);

        $member = Member::findOrFail($memberId);

        $existingInvs = TrainingInvitation::whereIn('training_id', $monthSessionIds)
            ->where('member_id', $memberId)
            ->get();

        $hadExistingSentInvs = $existingInvs->contains(fn($i) => $i->status !== 'pending');

        $hasAccepted = $existingInvs->contains(fn($i) => $i->status === 'accepted');

        if ($hasAccepted && !$forceAccept) {
            return response()->json([
                'message' => 'Invitation has already been accepted and cannot be modified.',
            ], 422);
        }

        if ($forceAccept) {
            if (count($selectedSids) === 0) {
                return response()->json([
                    'message' => 'Please select at least one session date to force accept.',
                ], 422);
            }

            $repeatWeeks = (int)($tr->repeat_weeks ?? 0);
            if ($repeatWeeks <= 0) {
                return response()->json([
                    'message' => 'Invalid or missing Repeat for Weeks configured for this training program.',
                ], 422);
            }
            if ($tr->fees === null || (float)$tr->fees < 0) {
                return response()->json([
                    'message' => 'Invalid monthly fee configured for this training program.',
                ], 422);
            }
            $appDisc = (bool)$member->apply_discount;
            $discountedMonthlyFee = FeeHelper::forMember((float)$tr->fees, $member, $appDisc);

            return DB::transaction(function () use ($tr, $selectedSids, $member, $discountedMonthlyFee, $repeatWeeks, $existingInvs) {
                Training::whereIn('id', $selectedSids)->lockForUpdate()->get();

                TrainingInvitation::whereIn('training_id', $selectedSids)
                    ->where('member_id', $member->id)
                    ->lockForUpdate()
                    ->get();

                $freshInvs = TrainingInvitation::whereIn('training_id', $selectedSids)
                    ->where('member_id', $member->id)
                    ->get();

                $sessionsNeedingAccept = [];
                foreach ($selectedSids as $sid) {
                    $inv = $freshInvs->firstWhere('training_id', $sid);
                    if (!$inv || $inv->status !== 'accepted') {
                        $sessionsNeedingAccept[] = $sid;
                    }
                }

                if (count($sessionsNeedingAccept) === 0) {
                    return response()->json([
                        'message' => 'Training invitation force accepted successfully.',
                    ]);
                }

                foreach ($sessionsNeedingAccept as $sid) {
                    $freshTr = Training::where('id', $sid)->first();
                    if (!$freshTr) {
                        continue;
                    }
                    $maxSlots = (int)($freshTr->slots ?? 0);
                    if ($maxSlots <= 0) {
                        continue;
                    }
                    $acceptedCount = TrainingInvitation::where('training_id', $freshTr->id)
                        ->where('status', 'accepted')
                        ->distinct('member_id')
                        ->count('member_id');

                    if ($acceptedCount >= $maxSlots) {
                        return response()->json(['message' => 'Maximum players already accepted for this training.'], 422);
                    }
                }

                $newCount = count($sessionsNeedingAccept);
                $selectedCount = count($selectedSids);
                if ($selectedCount === $repeatWeeks) {
                    $alreadyPaid = (float) $freshInvs->where('status', 'accepted')->sum('accepted_amount');
                    $totalFeeToDeduct = round(max(0, $discountedMonthlyFee - $alreadyPaid), 2);
                } else {
                    $totalFeeToDeduct = round(($discountedMonthlyFee / $repeatWeeks) * $newCount, 2);
                }

                // Force Accept is an admin override: always debit the fee even if the
                // wallet balance is insufficient (balance may go negative).
                if ($totalFeeToDeduct > 0) {
                    $walletMember = $this->getWalletMember($member, $totalFeeToDeduct);
                    if (!$walletMember->skip_credit_consumption) {
                        $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first();

                        $freshWallet->credit = round($freshWallet->credit - $totalFeeToDeduct, 2);
                        $freshWallet->save();

                        $transaction = Transaction::create([
                            'id' => 't_' . Str::random(8),
                            'member_id' => $freshWallet->id,
                            'type' => 'debit',
                            'amount' => $totalFeeToDeduct,
                            'description' => 'Training program invitation force accepted for ' . $member->name . ': ' . $tr->name,
                            'date' => now(),
                        ]);

                        try {
                            MailHelper::sendTransactionEmail($freshWallet, $transaction);
                        } catch (\Exception $e) {
                            logger()->error("Transaction email failed: " . $e->getMessage());
                        }
                    }
                }

                foreach ($existingInvs as $inv) {
                    if (!in_array($inv->training_id, $selectedSids, true) && $inv->status !== 'accepted') {
                        $inv->delete();
                    }
                }

                $countSids = count($sessionsNeedingAccept);
                $basePerSession = $countSids > 0 ? floor(($totalFeeToDeduct / $countSids) * 100) / 100 : 0;
                $remainderCents = $countSids > 0 ? (int) round(($totalFeeToDeduct - ($basePerSession * $countSids)) * 100) : 0;

                $holidayDates = Holiday::pluck('date')->toArray();
                foreach (array_values($sessionsNeedingAccept) as $index => $sid) {
                    $sessionObj = Training::find($sid);
                    if (!$sessionObj) {
                        continue;
                    }
                    $repW = max(1, (int)($sessionObj->repeat_weeks ?? $tr->repeat_weeks ?? 1));
                    $inv = TrainingInvitation::where('training_id', $sid)->where('member_id', $member->id)->first();
                    $perSessAmount = round($basePerSession + ($index < $remainderCents ? 0.01 : 0.0), 2);
                    if (!$inv) {
                        TrainingInvitation::create([
                            'id' => 'ti_' . Str::random(8),
                            'training_id' => $sid,
                            'member_id' => $member->id,
                            'status' => 'accepted',
                            'accepted_monthly_fee' => (float)($sessionObj->fees ?? $tr->fees ?? 0),
                            'accepted_repeat_weeks' => $repW,
                            'accepted_per_session_fee' => $perSessAmount,
                            'accepted_amount' => $perSessAmount,
                        ]);
                    } else {
                        $inv->status = 'accepted';
                        $inv->accepted_monthly_fee = (float)($sessionObj->fees ?? $tr->fees ?? 0);
                        $inv->accepted_repeat_weeks = $repW;
                        $inv->accepted_per_session_fee = $perSessAmount;
                        $inv->accepted_amount = $perSessAmount;
                        $inv->save();
                    }

                    $sIso = \Carbon\Carbon::parse($sessionObj->start_date)->toDateString();
                    if (!in_array($sIso, $holidayDates, true)) {
                        TrainingDate::firstOrCreate([
                            'training_id' => $sid,
                            'member_id' => $member->id,
                        ], [
                            'id' => 'td_' . Str::random(8),
                            'date' => $sessionObj->start_date,
                            'attended' => null,
                        ]);
                    }
                }

                return response()->json([
                    'message' => 'Training invitation force accepted successfully.',
                ]);
            });
        }

        foreach ($existingInvs as $inv) {
            if (!in_array($inv->training_id, $selectedSids) && $inv->status !== 'accepted') {
                $inv->delete();
            }
        }

        foreach ($selectedSids as $sid) {
            $inv = TrainingInvitation::where('training_id', $sid)->where('member_id', $member->id)->first();
            if (!$inv) {
                TrainingInvitation::create([
                    'id' => 'ti_' . Str::random(8),
                    'training_id' => $sid,
                    'member_id' => $member->id,
                    'status' => 'open',
                ]);
            } else {
                if ($inv->status !== 'accepted') {
                    $inv->status = 'open';
                    $inv->save();
                }
            }
        }

        if (count($selectedSids) > 0) {
            try {
                $selectedTrainings = Training::whereIn('id', $selectedSids)
                    ->orderBy('start_date', 'asc')
                    ->get();
                if ($selectedTrainings->count() > 0) {
                    $actionType = $hadExistingSentInvs ? 'update' : 'release';
                    MailHelper::sendTrainingNotification($member, $selectedTrainings, 'open', $actionType);
                }
            } catch (\Exception $e) {
                logger()->error("Training invite email error: " . $e->getMessage());
            }
        }

        return response()->json([
            'message' => 'Invitation updated successfully.',
        ]);
    }

    public function enroll(Request $request, $id)
    {
        $request->validate([
            'memberIds' => 'required|array|min:1',
            'memberIds.*' => 'required|string',
        ]);

        $user = $request->user();
        $isAdmin = $user && $user->role === 'admin';

        // Admins enrolling on behalf of members need the training edit permission.
        if ($isAdmin && ($response = PermissionHelper::requireAdminPermission($request, 'trainings.edit'))) {
            return $response;
        }

        $tr = Training::findOrFail($id);

        $sessionPhase = SessionTimingHelper::trainingSessionPhase($tr);
        if ($message = SessionTimingHelper::acceptBlockedMessage($sessionPhase)) {
            return response()->json(['message' => $message], 422);
        }

        if (!in_array($tr->status, ['open', 'released'], true)) {
            return response()->json([
                'message' => 'This training program is not open for enrollment.',
            ], 422);
        }

        if ($tr->status === 'open') {
            $tr->status = 'released';
            $tr->save();
        }

        $memberIds = array_values(array_unique($request->memberIds));
        $targetType = $tr->target_type ?? 'junior';

        if ($isAdmin) {
            // Admin enroll: any active, training-eligible member matching the program target type.
            $allowedMemberIds = Member::eligibleForTraining($targetType)
                ->whereIn('id', $memberIds)
                ->pluck('id')
                ->all();
            $notAllowedMessage = "One or more selected members are not active, eligible {$targetType} members.";
        } else {
            // Members: own family members only.
            $familyIds = FamilyScopeHelper::familyMemberIds($user);
            $allowedMemberIds = Member::query()
                ->whereIn('id', $familyIds)
                ->where('member_type', $targetType)
                ->where('status', 'active')
                ->whereIn('id', $memberIds)
                ->pluck('id')
                ->all();
            $notAllowedMessage = "You can only enroll your own active {$targetType} family members.";
        }

        if (count($allowedMemberIds) !== count($memberIds)) {
            return response()->json([
                'message' => $notAllowedMessage,
            ], 422);
        }

        $alreadyInvited = TrainingInvitation::where('training_id', $id)
            ->whereIn('member_id', $memberIds)
            ->pluck('member_id')
            ->all();

        $newMemberIds = array_values(array_diff($memberIds, $alreadyInvited));

        if (count($newMemberIds) === 0) {
            return response()->json([
                'message' => $isAdmin
                    ? 'Selected members are already enrolled in this program.'
                    : 'Selected family members are already enrolled in this program.',
            ], 422);
        }

        // Validate configuration and wallet balance for all new members (pre-check only - NO debit here).
        // The single debit happens in processTrainingAcceptance via createInvitationsForMembers().
        // FIN-06: same formula as processTrainingAcceptance (monthly fee discounted, divided by repeat weeks).
        foreach ($newMemberIds as $mid) {
            $member = Member::find($mid);
            if (!$member) {
                continue;
            }

            $computed = $this->computeAcceptanceFee($tr, $member, null);
            if (is_string($computed)) {
                return response()->json(['message' => $computed], 422);
            }
            $feeToDeduct = $computed['fee'];

            $walletMember = $this->getWalletMember($member, $feeToDeduct);
            if (!$walletMember->skip_credit_consumption && $feeToDeduct > 0) {
                if ($walletMember->credit < $feeToDeduct) {
                    return response()->json([
                        'message' => 'Insufficient wallet balance. Please add funds before accepting this training invitation.',
                    ], 422);
                }
            }
        }

        try {
            return DB::transaction(function () use ($tr, $newMemberIds) {
                $freshTr = Training::where('id', $tr->id)->lockForUpdate()->first();
                if ($freshTr) {
                    $maxSlots = (int)($freshTr->slots ?? 0);
                    if ($maxSlots > 0) {
                        $acceptedCount = TrainingInvitation::where('training_id', $freshTr->id)
                            ->where('status', 'accepted')
                            ->distinct('member_id')
                            ->count('member_id');

                        $newAcceptances = count(array_unique($newMemberIds));

                        if (($acceptedCount + $newAcceptances) > $maxSlots) {
                            return response()->json(['message' => 'Maximum players already accepted for this training.'], 422);
                        }
                    }
                }

                // FIN-03: no pre-debit here. createInvitationsForMembers(..., 'accepted') debits exactly once.
                $this->acceptanceErrors = [];
                [$invites, $trainingDates] = $this->createInvitationsForMembers($tr, $newMemberIds, false, 'accepted');

                if (!empty($this->acceptanceErrors)) {
                    // Roll back everything (invites created for members whose acceptance failed).
                    throw new \RuntimeException($this->acceptanceErrors[0]);
                }

                return response()->json([
                    'message' => 'Family members accepted into this training program.',
                    'training' => $this->formatTraining($tr),
                    'invitations' => $invites,
                    'dates' => $trainingDates,
                ]);
            });
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    private function formatInvitation(TrainingInvitation $inv): array
    {
        return [
            'id' => $inv->id,
            'trainingId' => $inv->training_id,
            'memberId' => $inv->member_id,
            'status' => $inv->status,
            'applyDiscount' => $inv->apply_discount !== null ? (bool)$inv->apply_discount : null,
            'calculatedMonthlyFee' => $inv->calculated_monthly_fee !== null ? (float)$inv->calculated_monthly_fee : null,
            'calculatedPerSessionFee' => $inv->calculated_per_session_fee !== null ? (float)$inv->calculated_per_session_fee : null,
            'acceptedMonthlyFee' => $inv->accepted_monthly_fee !== null ? (float)$inv->accepted_monthly_fee : null,
            'acceptedRepeatWeeks' => $inv->accepted_repeat_weeks !== null ? (int)$inv->accepted_repeat_weeks : null,
            'acceptedPerSessionFee' => $inv->accepted_per_session_fee !== null ? (float)$inv->accepted_per_session_fee : null,
            'acceptedAmount' => $inv->accepted_amount !== null ? (float)$inv->accepted_amount : null,
        ];
    }

    public function listInvitations(?Request $request = null)
    {
        $request = $request ?? request();
        $user = $request ? $request->user() : null;

        if ($user && $user->role !== 'admin') {
            $myMemberIds = $this->getFamilyMemberIdsForUser($user);

            $invites = TrainingInvitation::whereIn('member_id', $myMemberIds)
                ->whereIn('status', ['open', 'accepted', 'waiting', 'declined'])
                ->get();

            return response()->json($invites->map(fn($i) => $this->formatInvitation($i)));
        }

        // SYNC-01: GET must never mutate invitations or wallets (no automatic sync / refund here).
        $invites = TrainingInvitation::all();
        return response()->json($invites->map(fn($i) => $this->formatInvitation($i)));
    }

    public function respondInvitation(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:accepted,declined,waiting,open',
        ]);

        $invite = TrainingInvitation::findOrFail($id);
        $desired = $request->status;
        $user = $request->user();
        $isAdmin = $user && $user->role === 'admin';

        // SEC-04: members may only respond to invitations of their own family members.
        if ($response = FamilyScopeHelper::assertOwnsMemberOrAdmin($user, (string) $invite->member_id)) {
            return $response;
        }

        $tr = Training::find($invite->training_id);

        if ($desired === 'accepted') {
            if ($invite->status !== 'accepted') {
                if ($error = $this->acceptPreconditionError($invite, $tr, $isAdmin)) {
                    return response()->json(['message' => $error], 422);
                }
            }

            $error = $this->processTrainingAcceptance($invite, $isAdmin);
            if ($error !== null) {
                return response()->json([
                    'message' => $error,
                ], 422);
            }
        } else {
            if ($tr) {
                $sessionPhase = SessionTimingHelper::trainingSessionPhase($tr);
                if ($message = SessionTimingHelper::actionsBlockedMessage($sessionPhase)) {
                    return response()->json(['message' => $message], 422);
                }
            }

            $error = $this->changeInvitationStatus($invite, $desired);
            if ($error !== null) {
                return response()->json(['message' => $error], 422);
            }
        }

        return response()->json($this->formatInvitation($invite));
    }

    /**
     * TRN-04: validates that an invitation may be accepted right now (status, phase, pending).
     */
    private function acceptPreconditionError(TrainingInvitation $invite, ?Training $tr, bool $isAdmin, bool $bulkMonthAccept = false): ?string
    {
        if ($invite->status === 'pending' && !$isAdmin) {
            return 'This invitation has not been sent yet and cannot be accepted.';
        }

        if (!$tr) {
            return null;
        }

        // Bulk (whole-month) accept intentionally keeps allowing sessions that already started/finished and
        // not-yet-released siblings of the month; it only refuses cancelled/closed sessions.
        $blockedStatuses = $bulkMonthAccept ? ['cancelled', 'closed'] : ['cancelled', 'closed', 'created'];
        if (in_array($tr->status, $blockedStatuses, true)) {
            return 'This training program is not open for enrollment.';
        }

        if ($bulkMonthAccept) {
            return null;
        }

        $sessionPhase = SessionTimingHelper::trainingSessionPhase($tr);
        if ($message = SessionTimingHelper::acceptBlockedMessage($sessionPhase)) {
            return $message;
        }

        return null;
    }

    /**
     * Applies a non-accept status (declined/waiting/open) to an invitation.
     *
     * TRN-01: when an invitation that was accepted AND paid is declined, the accepted amount
     * (minus any attendance refund already issued for that session) is refunded once to the
     * wallet, the session attendance row is removed and accepted_amount is zeroed so that a
     * later cancel/refund can never refund the same session twice.
     *
     * Returns an error message or null on success. Updates $invite in place.
     */
    private function changeInvitationStatus(TrainingInvitation $invite, string $desired): ?string
    {
        return DB::transaction(function () use ($invite, $desired) {
            $fresh = TrainingInvitation::where('id', $invite->id)->lockForUpdate()->first();
            if (!$fresh) {
                return 'Invitation not found.';
            }

            if ($fresh->status === 'accepted' && $desired !== 'accepted') {
                $paid = (float) ($fresh->accepted_amount ?? 0);

                if ($paid > 0) {
                    if ($desired !== 'declined') {
                        return 'Contact admin to cancel after payment';
                    }

                    $member = Member::find($fresh->member_id);
                    $tr = Training::find($fresh->training_id);
                    $tDate = TrainingDate::where('training_id', $fresh->training_id)
                        ->where('member_id', $fresh->member_id)
                        ->lockForUpdate()
                        ->first();

                    $priorRefund = $tDate && $tDate->refund_amount !== null ? (float) $tDate->refund_amount : 0.0;
                    $refundAmount = round(max(0, $paid - $priorRefund), 2);

                    if ($member && $refundAmount > 0) {
                        $walletMember = WalletHelper::resolveMember($member);
                        if (!$walletMember->skip_credit_consumption) {
                            $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                            $freshWallet->credit = round($freshWallet->credit + $refundAmount, 2);
                            $freshWallet->save();

                            $transaction = Transaction::create([
                                'id' => 't_' . Str::random(8),
                                'member_id' => $freshWallet->id,
                                'type' => 'refund',
                                'amount' => $refundAmount,
                                'description' => 'Refund — declined training session for ' . $member->name . ': ' . ($tr ? $tr->name : ''),
                                'date' => now(),
                            ]);

                            try {
                                MailHelper::sendTransactionEmail($freshWallet, $transaction);
                            } catch (\Exception $e) {
                                logger()->error("Transaction refund email failed for member {$freshWallet->id}: " . $e->getMessage());
                            }
                        }
                    }

                    $fresh->accepted_amount = 0;
                    $fresh->accepted_per_session_fee = 0;
                }

                // Member is no longer attending this session.
                TrainingDate::where('training_id', $fresh->training_id)
                    ->where('member_id', $fresh->member_id)
                    ->delete();
            }

            $fresh->status = $desired;
            $fresh->save();

            $invite->setRawAttributes($fresh->getAttributes(), true);

            return null;
        });
    }

    private function getWalletMember(Member $member, float $feeToDeduct = 0): Member
    {
        return WalletHelper::resolveMember($member);
    }

    /**
     * Single source of truth for the per-session fee charged on acceptance
     * (FeeHelper::forMember on the MONTHLY fee, divided by repeat weeks; the last
     * session of a full month takes the remainder of the monthly fee).
     *
     * @return array{fee: float, discountedMonthlyFee: float, appDisc: bool}|string  error message on invalid config
     */
    private function computeAcceptanceFee(Training $tr, Member $member, ?TrainingInvitation $invite = null)
    {
        $repeatWeeks = (int)($tr->repeat_weeks ?? 0);
        if ($repeatWeeks <= 0) {
            return 'Invalid or missing Repeat for Weeks configured for this training program.';
        }
        if ($tr->fees === null || (float)$tr->fees < 0) {
            return 'Invalid monthly fee configured for this training program.';
        }

        $appDisc = $invite && $invite->apply_discount !== null ? (bool)$invite->apply_discount : (bool)$member->apply_discount;
        $discountedMonthlyFee = $invite && $invite->calculated_monthly_fee !== null
            ? (float)$invite->calculated_monthly_fee
            : FeeHelper::forMember((float) $tr->fees, $member, $appDisc);

        $parentId = $tr->parent_id ?: $tr->id;
        $seriesSessionIds = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->pluck('id')->all();
        $otherAcceptedQuery = TrainingInvitation::whereIn('training_id', $seriesSessionIds)
            ->where('member_id', $member->id)
            ->where('status', 'accepted');
        if ($invite) {
            $otherAcceptedQuery->where('id', '!=', $invite->id);
        }
        $otherAcceptedInvs = $otherAcceptedQuery->get();

        if ($otherAcceptedInvs->count() + 1 === $repeatWeeks) {
            $alreadyPaidSum = (float) $otherAcceptedInvs->sum('accepted_amount');
            $feeToDeduct = round(max(0, $discountedMonthlyFee - $alreadyPaidSum), 2);
        } else {
            $feeToDeduct = round($discountedMonthlyFee / $repeatWeeks, 2);
        }

        return [
            'fee' => $feeToDeduct,
            'discountedMonthlyFee' => $discountedMonthlyFee,
            'appDisc' => $appDisc,
        ];
    }

    /** Errors raised by processTrainingAcceptance while called from bulk helpers (enroll/release). */
    private array $acceptanceErrors = [];

    private function processTrainingAcceptance(TrainingInvitation $invite, bool $allowPending = false): ?string
    {
        if ($invite->status === 'accepted') {
            return null;
        }

        $tr = Training::find($invite->training_id);
        if (!$tr) {
            return null;
        }

        $member = Member::find($invite->member_id);
        if (!$member) {
            return null;
        }

        // TRN-04: status / phase / pending guards (centralised so every accept path is covered).
        if ($error = $this->acceptPreconditionError($invite, $tr, $allowPending)) {
            $this->acceptanceErrors[] = $error;
            return $error;
        }

        $repeatWeeks = (int)($tr->repeat_weeks ?? 0);
        $computed = $this->computeAcceptanceFee($tr, $member, $invite);
        if (is_string($computed)) {
            $this->acceptanceErrors[] = $computed;
            return $computed;
        }
        $feeToDeduct = $computed['fee'];
        $discountedMonthlyFee = $computed['discountedMonthlyFee'];
        $appDisc = $computed['appDisc'];

        $originalFee = round((float) $tr->fees / $repeatWeeks, 2);
        $discountApplied = round(max(0, $originalFee - $feeToDeduct), 2);

        $result = DB::transaction(function () use ($invite, $tr, $member, $feeToDeduct, $repeatWeeks, $originalFee, $discountApplied, $appDisc, $discountedMonthlyFee, $allowPending) {
            // Re-fetch invitation with lock to prevent concurrent acceptance
            $freshInvite = TrainingInvitation::where('id', $invite->id)->lockForUpdate()->first();
            if (!$freshInvite || $freshInvite->status === 'accepted') {
                return null;
            }

            $freshTr = Training::where('id', $tr->id)->lockForUpdate()->first();
            if ($freshTr) {
                if ($error = $this->acceptPreconditionError($freshInvite, $freshTr, $allowPending)) {
                    return $error;
                }

                $maxSlots = (int)($freshTr->slots ?? 0);
                if ($maxSlots > 0) {
                    $acceptedCount = TrainingInvitation::where('training_id', $freshTr->id)
                        ->where('status', 'accepted')
                        ->distinct('member_id')
                        ->count('member_id');

                    if ($acceptedCount >= $maxSlots) {
                        return 'Maximum players already accepted for this training.';
                    }
                }
            }

            $walletMember = $this->getWalletMember($member, $feeToDeduct);

            if (!$walletMember->skip_credit_consumption && $feeToDeduct > 0) {
                // Re-fetch wallet member with lock
                $freshWalletMember = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                if ($freshWalletMember->credit < $feeToDeduct) {
                    return 'Insufficient wallet balance. Please add funds before accepting this training invitation.';
                }

                $freshWalletMember->credit = round($freshWalletMember->credit - $feeToDeduct, 2);
                $freshWalletMember->save();

                $currency = Setting::where('key', 'currency')->value('value') ?? '$';
                $description = 'Training program invitation accepted for ' . $member->name . ': ' . $tr->name . ' (Training Fee: ' . $currency . number_format($originalFee, 2) . ', Discount: ' . $currency . number_format($discountApplied, 2) . ', Amount Debited: ' . $currency . number_format($feeToDeduct, 2) . ')';

                $transaction = Transaction::create([
                    'id' => 't_' . Str::random(8),
                    'member_id' => $freshWalletMember->id,
                    'type' => 'debit',
                    'amount' => $feeToDeduct,
                    'description' => $description,
                    'date' => now(),
                ]);

                try {
                    MailHelper::sendTransactionEmail($freshWalletMember, $transaction);
                } catch (\Exception $e) {
                    logger()->error("Transaction email failed for member {$freshWalletMember->id}: " . $e->getMessage());
                }
            }

            $freshInvite->status = 'accepted';
            $freshInvite->accepted_monthly_fee = (float) $tr->fees;
            $freshInvite->accepted_repeat_weeks = $repeatWeeks;
            $freshInvite->accepted_per_session_fee = $feeToDeduct;
            $freshInvite->accepted_amount = $feeToDeduct;
            if ($freshInvite->apply_discount === null) {
                $freshInvite->apply_discount = $appDisc;
                $freshInvite->calculated_monthly_fee = $discountedMonthlyFee;
                $freshInvite->calculated_per_session_fee = $feeToDeduct;
            }
            $freshInvite->save();

            $invite->status = 'accepted';
            $invite->accepted_monthly_fee = (float) $tr->fees;
            $invite->accepted_repeat_weeks = $repeatWeeks;
            $invite->accepted_per_session_fee = $feeToDeduct;
            $invite->accepted_amount = $feeToDeduct;
            if ($invite->apply_discount === null) {
                $invite->apply_discount = $appDisc;
                $invite->calculated_monthly_fee = $discountedMonthlyFee;
                $invite->calculated_per_session_fee = $feeToDeduct;
            }

            $holidayDates = Holiday::pluck('date')->toArray();
            $sIso = \Carbon\Carbon::parse($tr->start_date)->toDateString();
            if (!in_array($sIso, $holidayDates)) {
                TrainingDate::firstOrCreate([
                    'training_id' => $tr->id,
                    'member_id' => $member->id,
                ], [
                    'id' => 'td_' . Str::random(8),
                    'date' => \Carbon\Carbon::parse($tr->start_date)->format('Y-m-d H:i:s'),
                    'attended' => null,
                ]);
            }

            return null;
        });

        if (is_string($result)) {
            $this->acceptanceErrors[] = $result;
        }

        return $result;
    }

    public function respondBulk(Request $request)
    {
        $request->validate([
            'inviteIds' => 'required|array|min:1',
            'inviteIds.*' => 'required|string',
            'status' => 'required|in:accepted,declined',
        ]);

        $status = $request->status;
        $inviteIds = $request->inviteIds;
        $user = $request->user();
        $isAdmin = $user && $user->role === 'admin';

        // SEC-04: non-admins may only act on invitations that belong to their own family members.
        if (!$isAdmin) {
            $familyIds = FamilyScopeHelper::familyMemberIds($user);
            $foreign = TrainingInvitation::whereIn('id', $inviteIds)
                ->whereNotIn('member_id', $familyIds)
                ->exists();
            if ($foreign) {
                return response()->json(['message' => 'You do not have access to this member.'], 403);
            }
        }

        if ($status !== 'accepted') {
            $invites = TrainingInvitation::whereIn('id', $inviteIds)->get();
            foreach ($invites as $inv) {
                $tr = Training::find($inv->training_id);
                if (!$tr) {
                    continue;
                }
                $sessionPhase = SessionTimingHelper::trainingSessionPhase($tr);
                if ($message = SessionTimingHelper::actionsBlockedMessage($sessionPhase)) {
                    return response()->json(['message' => $message], 422);
                }
            }

            // TRN-01: declining an accepted + paid invitation refunds it once (all-or-nothing).
            try {
                DB::transaction(function () use ($invites) {
                    foreach ($invites as $inv) {
                        if ($error = $this->changeInvitationStatus($inv, 'declined')) {
                            throw new \RuntimeException($error);
                        }
                    }
                });
            } catch (\RuntimeException $e) {
                return response()->json(['message' => $e->getMessage()], 422);
            }

            return response()->json(['message' => 'Invitations declined.']);
        }

        try {
            return DB::transaction(function () use ($inviteIds, $isAdmin) {
                $invites = TrainingInvitation::whereIn('id', $inviteIds)
                    ->where('status', '!=', 'accepted')
                    ->lockForUpdate()
                    ->get();
                
                if ($invites->isEmpty()) {
                    return response()->json(['message' => 'No valid invitations to accept.'], 422);
                }

                // TRN-04: status / pending guards for every invitation being accepted.
                // Phase guard: a month accept that still contains upcoming sessions is allowed (earlier
                // sessions of the month may already have started); but if EVERY selected session has
                // already started/finished there is nothing left to accept.
                $phaseMessages = [];
                foreach ($invites as $inv) {
                    $tr = Training::find($inv->training_id);
                    if ($error = $this->acceptPreconditionError($inv, $tr, $isAdmin, true)) {
                        throw new \Exception($error);
                    }
                    if ($tr) {
                        $phaseMessages[] = SessionTimingHelper::acceptBlockedMessage(SessionTimingHelper::trainingSessionPhase($tr));
                    }
                }
                if (count($phaseMessages) > 0 && !in_array(null, $phaseMessages, true)) {
                    throw new \Exception($phaseMessages[0]);
                }

                $trainingIds = $invites->pluck('training_id')->unique()->all();
                $freshTrainings = Training::whereIn('id', $trainingIds)->lockForUpdate()->get();
                foreach ($freshTrainings as $freshTr) {
                    $maxSlots = (int)($freshTr->slots ?? 0);
                    if ($maxSlots > 0) {
                        $acceptedCount = TrainingInvitation::where('training_id', $freshTr->id)
                            ->where('status', 'accepted')
                            ->distinct('member_id')
                            ->count('member_id');
                        
                        $newAcceptances = $invites->where('training_id', $freshTr->id)->pluck('member_id')->unique()->count();
                        
                        if (($acceptedCount + $newAcceptances) > $maxSlots) {
                            throw new \Exception('Maximum players already accepted for this training.');
                        }
                    }
                }

                // Group by member_id to process fees per member
                $memberInvites = $invites->groupBy('member_id');
                
                foreach ($memberInvites as $memberId => $mInvites) {
                    $member = Member::find($memberId);
                    if (!$member) continue;

                    $firstInv = $mInvites->first();
                    $trFirst = Training::find($firstInv->training_id);
                    if (!$trFirst || (int)($trFirst->repeat_weeks ?? 0) <= 0) {
                        return response()->json([
                            'message' => 'Invalid or missing Repeat for Weeks configured for training program: ' . ($trFirst ? $trFirst->name : 'Unknown'),
                        ], 422);
                    }
                    $repeatWeeks = (int)$trFirst->repeat_weeks;
                    $appDisc = $firstInv->apply_discount !== null ? (bool)$firstInv->apply_discount : (bool)$member->apply_discount;
                    $discountedMonthlyFee = $firstInv->calculated_monthly_fee !== null ? (float)$firstInv->calculated_monthly_fee : FeeHelper::forMember((float) $trFirst->fees, $member, $appDisc);

                    $count = $mInvites->count();
                    if ($count === $repeatWeeks) {
                        $totalFeeToDeduct = $discountedMonthlyFee;
                        $totalOriginalFee = (float) $trFirst->fees;
                    } else {
                        $totalFeeToDeduct = round(($discountedMonthlyFee / $repeatWeeks) * $count, 2);
                        $totalOriginalFee = round(((float) $trFirst->fees / $repeatWeeks) * $count, 2);
                    }

                    $trainingNames = [];
                    foreach ($mInvites as $inv) {
                        $tr = Training::find($inv->training_id);
                        if ($tr && !in_array($tr->name, $trainingNames)) {
                            $trainingNames[] = $tr->name;
                        }
                    }

                    if ($totalFeeToDeduct > 0) {
                        $walletMember = $this->getWalletMember($member, $totalFeeToDeduct);
                        if (!$walletMember->skip_credit_consumption) {
                            $freshWalletMember = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                            if ($freshWalletMember->credit < $totalFeeToDeduct) {
                                throw new \Exception('Insufficient wallet balance. Please add funds before accepting this training invitation.');
                            }

                            $freshWalletMember->credit = round($freshWalletMember->credit - $totalFeeToDeduct, 2);
                            $freshWalletMember->save();

                            $currency = Setting::where('key', 'currency')->value('value') ?? '$';
                            $discountApplied = round(max(0, $totalOriginalFee - $totalFeeToDeduct), 2);
                            $description = 'Training program invitation accepted for ' . $member->name . ': ' . implode(', ', $trainingNames) . ' (Training Fee: ' . $currency . number_format($totalOriginalFee, 2) . ', Discount: ' . $currency . number_format($discountApplied, 2) . ', Amount Debited: ' . $currency . number_format($totalFeeToDeduct, 2) . ')';
                            if (strlen($description) > 255) {
                                $description = substr($description, 0, 252) . '...';
                            }

                            $transaction = Transaction::create([
                                'id' => 't_' . Str::random(8),
                                'member_id' => $freshWalletMember->id,
                                'type' => 'debit',
                                'amount' => $totalFeeToDeduct,
                                'description' => $description,
                                'date' => now(),
                            ]);

                            try {
                                MailHelper::sendTransactionEmail($freshWalletMember, $transaction);
                            } catch (\Exception $e) {
                                logger()->error("Transaction email failed for member {$freshWalletMember->id}: " . $e->getMessage());
                            }
                        }
                    }

                    $basePerSession = $count > 0 ? floor(($totalFeeToDeduct / $count) * 100) / 100 : 0;
                    $remainderCents = $count > 0 ? (int) round(($totalFeeToDeduct - ($basePerSession * $count)) * 100) : 0;

                    $holidayDates = Holiday::pluck('date')->toArray();
                    foreach ($mInvites->values() as $index => $inv) {
                        $trSession = Training::find($inv->training_id);
                        if ($trSession) {
                            $repW = max(1, (int)($trSession->repeat_weeks ?? 1));
                            $appDisc = $inv->apply_discount !== null ? (bool)$inv->apply_discount : (bool)$member->apply_discount;
                            $discountedMonthlyFee = $inv->calculated_monthly_fee !== null ? (float)$inv->calculated_monthly_fee : FeeHelper::forMember((float) $trSession->fees, $member, $appDisc);
                            $perSessAmount = round($basePerSession + ($index < $remainderCents ? 0.01 : 0.0), 2);

                            $inv->status = 'accepted';
                            $inv->accepted_monthly_fee = (float) $trSession->fees;
                            $inv->accepted_repeat_weeks = $repW;
                            $inv->accepted_per_session_fee = $perSessAmount;
                            $inv->accepted_amount = $perSessAmount;
                            if ($inv->apply_discount === null) {
                                $inv->apply_discount = $appDisc;
                                $inv->calculated_monthly_fee = $discountedMonthlyFee;
                                $inv->calculated_per_session_fee = $perSessAmount;
                            }
                            $inv->save();

                            $sIso = \Carbon\Carbon::parse($trSession->start_date)->toDateString();
                            if (!in_array($sIso, $holidayDates)) {
                                TrainingDate::firstOrCreate([
                                    'training_id' => $trSession->id,
                                    'member_id' => $memberId,
                                ], [
                                    'id' => 'td_' . Str::random(8),
                                    'date' => \Carbon\Carbon::parse($trSession->start_date)->format('Y-m-d H:i:s'),
                                    'attended' => null,
                                ]);
                            }
                        } else {
                            $inv->status = 'accepted';
                            $inv->save();
                        }
                    }

                    // For each accepted training program series/month, remove any remaining non-accepted invitations
                    // for this member. The member has accepted this month's enrollment with only the chosen sessions;
                    // any skipped/non-accepted sessions (e.g. past or unselected sessions like Oct 8) are Not Included
                    // and must not remain open or be re-offered automatically.
                    $trainingSeriesMonths = [];
                    foreach ($mInvites as $acceptedInv) {
                        $trObj = Training::find($acceptedInv->training_id);
                        if ($trObj) {
                            $pId = $trObj->parent_id ?: $trObj->id;
                            $ym = \Carbon\Carbon::parse($trObj->start_date)->format('Y-m');
                            $trainingSeriesMonths["{$pId}_{$ym}"] = ['parentId' => $pId, 'yearMonth' => $ym];
                        }
                    }

                    foreach ($trainingSeriesMonths as $item) {
                        $pId = $item['parentId'];
                        $ym = $item['yearMonth'];
                        $series = Training::where('parent_id', $pId)->orWhere('id', $pId)->get();
                        $monthSessionIds = $series->filter(function ($sItem) use ($ym) {
                            return \Carbon\Carbon::parse($sItem->start_date)->format('Y-m') === $ym;
                        })->pluck('id')->all();

                        TrainingInvitation::whereIn('training_id', $monthSessionIds)
                            ->where('member_id', $memberId)
                            ->where('status', '!=', 'accepted')
                            ->delete();
                    }
                }

                return response()->json(['message' => 'Invitations accepted successfully.']);
            });
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function listUpdateRequests(?Request $request = null)
    {
        $request = $request ?? request();
        $user = $request ? $request->user() : null;

        $query = TrainingUpdateRequest::orderBy('created_at', 'desc');
        if ($user && $user->role !== 'admin') {
            $myMemberIds = $this->getFamilyMemberIdsForUser($user);
            $query->whereIn('member_id', $myMemberIds);
        }

        $requests = $query->get();
        return response()->json($requests->map(fn(TrainingUpdateRequest $r) => $this->formatUpdateRequest($r)));
    }

    private function formatUpdateRequest(TrainingUpdateRequest $ur): array
    {
        return [
            'id' => $ur->id,
            'trainingId' => $ur->training_id,
            'memberId' => $ur->member_id,
            'existingSessionIds' => $ur->existing_session_ids ?? [],
            'newSessionIds' => $ur->new_session_ids ?? [],
            'previouslyPaidAmount' => (float)($ur->previously_paid_amount ?? 0),
            'updatedMonthlyFee' => (float)($ur->updated_monthly_fee ?? 0),
            'newPerSessionFee' => (float)($ur->new_per_session_fee ?? 0),
            'additionalAmount' => (float)$ur->additional_amount,
            'status' => $ur->status,
            'createdAt' => $ur->created_at ? $ur->created_at->toISOString() : null,
            'updatedAt' => $ur->updated_at ? $ur->updated_at->toISOString() : null,
        ];
    }

    public function sendUpdateRequest(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'trainings.edit')) {
            return $response;
        }

        $request->validate([
            'memberId' => 'required|string',
            'existingSessionIds' => 'present|array',
            'existingSessionIds.*' => 'string',
            'newSessionIds' => 'present|array',
            'newSessionIds.*' => 'string',
            'previouslyPaidAmount' => 'sometimes|numeric|min:0',
            'updatedMonthlyFee' => 'sometimes|numeric|min:0',
            'newPerSessionFee' => 'sometimes|numeric|min:0',
            'additionalAmount' => 'required|numeric',
        ]);

        $tr = Training::findOrFail($id);
        $member = Member::findOrFail($request->memberId);

        // Cancel any previous pending update requests for this member & training
        TrainingUpdateRequest::where('training_id', $tr->id)
            ->where('member_id', $member->id)
            ->where('status', 'pending')
            ->delete();

        $previouslyPaidAmount = $request->has('previouslyPaidAmount') ? (float)$request->previouslyPaidAmount : 0.0;
        $updatedMonthlyFee = $request->has('updatedMonthlyFee') ? (float)$request->updatedMonthlyFee : (float)($tr->fees ?? 0);
        $newPerSessionFee = $request->has('newPerSessionFee') ? (float)$request->newPerSessionFee : ($tr->repeat_weeks ? (float)($tr->fees / (int)$tr->repeat_weeks) : 0.0);
        $additionalAmount = (float)$request->additionalAmount;

        $updateReq = TrainingUpdateRequest::create([
            'id' => 'tur_' . Str::random(8),
            'training_id' => $tr->id,
            'member_id' => $member->id,
            'existing_session_ids' => array_values($request->existingSessionIds),
            'new_session_ids' => array_values($request->newSessionIds),
            'previously_paid_amount' => $previouslyPaidAmount,
            'updated_monthly_fee' => $updatedMonthlyFee,
            'new_per_session_fee' => $newPerSessionFee,
            'additional_amount' => $additionalAmount,
            'status' => 'pending',
        ]);

        try {
            MailHelper::sendTrainingNotification($member, $tr, 'pending', 'update_request');
        } catch (\Exception $e) {
            logger()->error("Training update request notification email failed: " . $e->getMessage());
        }

        return response()->json([
            'message' => 'Training update request sent to member.',
            'updateRequest' => $this->formatUpdateRequest($updateReq),
        ]);
    }

    public function respondUpdateRequest(Request $request, $id)
    {
        $request->validate([
            'status' => 'required|in:accepted,declined',
        ]);

        $updateReq = TrainingUpdateRequest::findOrFail($id);

        if ($response = FamilyScopeHelper::assertOwnsMemberOrAdmin($request->user(), (string) $updateReq->member_id)) {
            return $response;
        }

        if ($updateReq->status !== 'pending') {
            return response()->json([
                'message' => 'This training update request has already been responded to.',
            ], 422);
        }

        $desiredStatus = $request->status;

        $tr = Training::find($updateReq->training_id);
        if ($tr) {
            $sessionPhase = SessionTimingHelper::trainingSessionPhase($tr);
            if ($message = SessionTimingHelper::actionsBlockedMessage($sessionPhase)) {
                return response()->json(['message' => $message], 422);
            }
        }

        if ($desiredStatus === 'declined') {
            $updateReq->status = 'declined';
            $updateReq->save();

            return response()->json([
                'message' => 'Training update request declined.',
                'updateRequest' => $this->formatUpdateRequest($updateReq),
            ]);
        }

        // Process Acceptance
        $tr = Training::find($updateReq->training_id);
        if (!$tr) {
            return response()->json(['message' => 'Training program not found.'], 404);
        }

        if ($message = SessionTimingHelper::acceptBlockedMessage(SessionTimingHelper::trainingSessionPhase($tr))) {
            return response()->json(['message' => $message], 422);
        }

        $member = Member::find($updateReq->member_id);
        if (!$member) {
            return response()->json(['message' => 'Member not found.'], 404);
        }

        $additionalAmount = (float) $updateReq->additional_amount;

        return DB::transaction(function () use ($updateReq, $tr, $member, $additionalAmount) {
            // Re-fetch update request with lock
            $freshReq = TrainingUpdateRequest::where('id', $updateReq->id)->lockForUpdate()->first();
            if (!$freshReq || $freshReq->status !== 'pending') {
                return response()->json(['message' => 'This update request has already been processed.'], 422);
            }

            $newSessionIds = $freshReq->new_session_ids ?? [];
            if (!empty($newSessionIds)) {
                $freshTrainings = Training::whereIn('id', $newSessionIds)->lockForUpdate()->get();
                foreach ($freshTrainings as $freshTr) {
                    $maxSlots = (int)($freshTr->slots ?? 0);
                    if ($maxSlots > 0) {
                        $acceptedCount = TrainingInvitation::where('training_id', $freshTr->id)
                            ->where('status', 'accepted')
                            ->distinct('member_id')
                            ->count('member_id');
                            
                        if ($acceptedCount >= $maxSlots) {
                            return response()->json(['message' => 'Maximum players already accepted for this training.'], 422);
                        }
                    }
                }
            }

            // Deduct additional amount from wallet if > 0
            if ($additionalAmount > 0) {
                $walletMember = $this->getWalletMember($member, $additionalAmount);

                if (!$walletMember->skip_credit_consumption) {
                    $freshWalletMember = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                    if ($freshWalletMember->credit < $additionalAmount) {
                        return response()->json([
                            'message' => 'Insufficient wallet balance. Please add funds before accepting this training update request.',
                        ], 422);
                    }

                    $freshWalletMember->credit = round($freshWalletMember->credit - $additionalAmount, 2);
                    $freshWalletMember->save();

                    $transaction = Transaction::create([
                        'id' => 't_' . Str::random(8),
                        'member_id' => $freshWalletMember->id,
                        'type' => 'debit',
                        'amount' => $additionalAmount,
                        'description' => 'Training program update request accepted for ' . $member->name . ': ' . $tr->name,
                        'date' => now(),
                    ]);

                    try {
                        MailHelper::sendTransactionEmail($freshWalletMember, $transaction);
                    } catch (\Exception $e) {
                        logger()->error("Transaction email failed for member {$freshWalletMember->id}: " . $e->getMessage());
                    }
                }
            } elseif ($additionalAmount < 0) {
                // Refund amount if updated package is cheaper
                $refundAmount = round(abs($additionalAmount), 2);
                $walletMember = $this->getWalletMember($member, 0);

                if (!$walletMember->skip_credit_consumption && $refundAmount > 0) {
                    $freshWalletMember = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                    $freshWalletMember->credit = round($freshWalletMember->credit + $refundAmount, 2);
                    $freshWalletMember->save();

                    $transaction = Transaction::create([
                        'id' => 't_' . Str::random(8),
                        'member_id' => $freshWalletMember->id,
                        'type' => 'refund',
                        'amount' => $refundAmount,
                        'description' => 'Training program update refund for ' . $member->name . ': ' . $tr->name,
                        'date' => now(),
                    ]);

                    try {
                        MailHelper::sendTransactionEmail($freshWalletMember, $transaction);
                    } catch (\Exception $e) {
                        logger()->error("Transaction email failed for member {$freshWalletMember->id}: " . $e->getMessage());
                    }
                }
            }

            // Create invitations and attendance ONLY for newly added sessions
            $newSessionIds = $freshReq->new_session_ids ?? [];
            $holidayDates = Holiday::pluck('date')->toArray();

            foreach ($newSessionIds as $sid) {
                $sessionObj = Training::find($sid);
                if (!$sessionObj) continue;

                $repW = max(1, (int)($sessionObj->repeat_weeks ?? $tr->repeat_weeks ?? 1));
                $bPerW = (float)($sessionObj->fees ?? $tr->fees ?? 0) / $repW;
                $inv = TrainingInvitation::where('training_id', $sid)->where('member_id', $member->id)->first();
                $appDisc = $inv && $inv->apply_discount !== null ? (bool)$inv->apply_discount : (bool)$member->apply_discount;
                $perSessAmount = $inv && $inv->calculated_per_session_fee !== null ? (float)$inv->calculated_per_session_fee : FeeHelper::forMember($bPerW, $member, $appDisc);
                if (!$inv) {
                    TrainingInvitation::create([
                        'id' => 'ti_' . Str::random(8),
                        'training_id' => $sid,
                        'member_id' => $member->id,
                        'status' => 'accepted',
                        'accepted_monthly_fee' => (float)($sessionObj->fees ?? $tr->fees ?? 0),
                        'accepted_repeat_weeks' => $repW,
                        'accepted_per_session_fee' => $bPerW,
                        'accepted_amount' => $perSessAmount,
                    ]);
                } else {
                    $inv->status = 'accepted';
                    $inv->accepted_monthly_fee = (float)($sessionObj->fees ?? $tr->fees ?? 0);
                    $inv->accepted_repeat_weeks = $repW;
                    $inv->accepted_per_session_fee = $bPerW;
                    $inv->accepted_amount = $perSessAmount;
                    $inv->save();
                }

                $sIso = \Carbon\Carbon::parse($sessionObj->start_date)->toDateString();
                if (!in_array($sIso, $holidayDates)) {
                    TrainingDate::firstOrCreate([
                        'training_id' => $sid,
                        'member_id' => $member->id,
                    ], [
                        'id' => 'td_' . Str::random(8),
                        'date' => $sessionObj->start_date,
                        'attended' => null,
                    ]);
                }
            }

            $freshReq->status = 'accepted';
            $freshReq->save();

            return response()->json([
                'message' => 'Training update request accepted successfully.',
                'updateRequest' => $this->formatUpdateRequest($freshReq),
            ]);
        });
    }

    public function listDates(?Request $request = null)
    {
        $request = $request ?? request();
        $user = $request ? $request->user() : null;

        $query = TrainingDate::query();
        if ($user && $user->role !== 'admin') {
            $myMemberIds = $this->getFamilyMemberIdsForUser($user);
            $query->whereIn('member_id', $myMemberIds);
        }

        $dates = $query->get();
        return response()->json($dates->map(fn($d) => [
            'id' => $d->id,
            'trainingId' => $d->training_id,
            'memberId' => $d->member_id,
            'date' => $d->date ? \Carbon\Carbon::parse($d->date)->format('Y-m-d H:i:s') : null,
            'attended' => $d->attended === null ? null : (bool)$d->attended,
            'refundStatus' => $d->refund_status,
            'refundAmount' => $d->refund_amount !== null ? (float)$d->refund_amount : null,
        ]));
    }

    public function markAttendance(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'trainings.edit')) {
            return $response;
        }

        $request->validate([
            'attended' => 'required|boolean',
        ]);

        $tDate = TrainingDate::findOrFail($id);
        $attended = $request->boolean('attended');

        return DB::transaction(function () use ($tDate, $attended) {
            $tDate = TrainingDate::where('id', $tDate->id)->lockForUpdate()->firstOrFail();

            if ($attended === true) {
                $priorRefundStatus = $tDate->refund_status;
                $priorRefundAmount = $tDate->refund_amount !== null ? (float) $tDate->refund_amount : 0.0;

                // Marking Present after a paid refund: claw back the refunded credits.
                if (in_array($priorRefundStatus, ['half', 'full'], true) && $priorRefundAmount > 0) {
                    $member = Member::find($tDate->member_id);
                    $tr = Training::find($tDate->training_id);
                    // WAL-01: skip flag lives on the wallet owner (parent for juniors).
                    $walletMember = $member ? WalletHelper::resolveMember($member) : null;
                    if ($member && $tr && $walletMember && !$walletMember->skip_credit_consumption) {
                        $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                        if ($freshWallet) {
                            $freshWallet->credit = round($freshWallet->credit - $priorRefundAmount, 2);
                            $freshWallet->save();

                            $refundLabel = $priorRefundStatus === 'half' ? '50% Refund' : 'Full Refund';
                            $transaction = Transaction::create([
                                'id' => 't_' . Str::random(8),
                                'member_id' => $freshWallet->id,
                                'type' => 'debit',
                                'amount' => $priorRefundAmount,
                                'description' => "Reversed training absent {$refundLabel} (marked Present) for {$member->name}: {$tr->name}",
                                'date' => now(),
                            ]);

                            try {
                                MailHelper::sendTransactionEmail($freshWallet, $transaction);
                            } catch (\Exception $e) {
                                logger()->error("Transaction reverse-refund email error: " . $e->getMessage());
                            }
                        }
                    }
                }

                $tDate->attended = true;
                $tDate->refund_status = null;
                $tDate->refund_amount = null;
                $tDate->save();
            } else {
                $tDate->attended = false;
                // Keep existing refund lock if already processed; otherwise leave open for refund popup.
                $tDate->save();
            }

            return response()->json([
                'id' => $tDate->id,
                'trainingId' => $tDate->training_id,
                'memberId' => $tDate->member_id,
                'date' => $tDate->date,
                'attended' => $tDate->attended === null ? null : (bool) $tDate->attended,
                'refundStatus' => $tDate->refund_status,
                'refundAmount' => $tDate->refund_amount !== null ? (float) $tDate->refund_amount : null,
            ]);
        });
    }

    public function processRefund(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'trainings.edit')) {
            return $response;
        }

        $request->validate([
            'refundType' => 'required|in:none,half,full',
        ]);

        TrainingDate::findOrFail($id);
        $refundType = $request->refundType;

        return DB::transaction(function () use ($id, $refundType) {
            // FIN-08: lock the attendance row BEFORE reading refund_status so concurrent calls cannot double refund.
            $tDate = TrainingDate::where('id', $id)->lockForUpdate()->firstOrFail();

            if ($tDate->refund_status !== null) {
                return response()->json([
                    'message' => 'This attendance session has already been refunded or processed and cannot be changed.',
                ], 422);
            }

            if ($tDate->attended !== false) {
                return response()->json([
                    'message' => 'Refund can only be processed for absent attendance sessions.',
                ], 422);
            }

            $tr = Training::find($tDate->training_id);
            if (!$tr) {
                return response()->json(['message' => 'Training program session not found.'], 404);
            }

            $member = Member::find($tDate->member_id);
            if (!$member) {
                return response()->json(['message' => 'Member not found.'], 404);
            }

            $refundAmount = 0.0;
            $walletMember = WalletHelper::resolveMember($member);

            if ($refundType !== 'none') {
                // FIN-01: refunds are only possible against an accepted + paid invitation for this session.
                $inv = TrainingInvitation::where('training_id', $tr->id)
                    ->where('member_id', $member->id)
                    ->where('status', 'accepted')
                    ->lockForUpdate()
                    ->first();

                $paid = $inv ? (float) ($inv->accepted_amount ?? 0) : 0.0;
                if (!$inv || $paid <= 0) {
                    return response()->json([
                        'message' => 'No paid accepted enrollment found for this member and session; nothing to refund.',
                    ], 422);
                }

                // FIN-02: base the refund on the amount actually paid (invitation snapshot), never live fee settings.
                $priorRefunds = $tDate->refund_amount !== null ? (float) $tDate->refund_amount : 0.0;
                $refundable = round(max(0, $paid - $priorRefunds), 2);

                $refundAmount = $refundType === 'half'
                    ? round($paid * 0.5, 2)
                    : round($paid, 2);
                $refundAmount = round(min($refundAmount, $refundable), 2);

                // WAL-01: wallet owners that skip credit consumption were never debited -> nothing to credit back.
                if ($walletMember->skip_credit_consumption) {
                    $refundAmount = 0.0;
                }
            }

            $tDate->refund_status = $refundType;
            $tDate->refund_amount = $refundAmount;
            $tDate->save();

            if ($refundAmount > 0) {
                $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                $freshWallet->credit = round($freshWallet->credit + $refundAmount, 2);
                $freshWallet->save();

                $refundLabel = $refundType === 'half' ? '50% Refund' : 'Full Refund';
                $transaction = Transaction::create([
                    'id' => 't_' . Str::random(8),
                    'member_id' => $freshWallet->id,
                    'type' => 'refund',
                    'amount' => $refundAmount,
                    'description' => "Training session absent ({$refundLabel}) for {$member->name}: {$tr->name}",
                    'date' => now(),
                ]);

                try {
                    MailHelper::sendTransactionEmail($freshWallet, $transaction);
                } catch (\Exception $e) {
                    logger()->error("Transaction refund email error: " . $e->getMessage());
                }
            }

            return response()->json([
                'message' => 'Refund processed successfully.',
                'date' => [
                    'id' => $tDate->id,
                    'trainingId' => $tDate->training_id,
                    'memberId' => $tDate->member_id,
                    'date' => $tDate->date,
                    'attended' => (bool)$tDate->attended,
                    'refundStatus' => $tDate->refund_status,
                    'refundAmount' => (float)$tDate->refund_amount,
                ],
            ]);
        });
    }

    private function createInvitationsForMembers(
        Training $tr,
        array $memberIds,
        bool $replaceDatesForMember = true,
        string $inviteStatus = 'open',
    ): array
    {
        $holidayDates = Holiday::pluck('date')->toArray();
        $dates = [$tr->start_date];
        $trDateIso = \Carbon\Carbon::parse($tr->start_date)->toDateString();
        if (in_array($trDateIso, $holidayDates)) {
            $dates = [];
        }

        $parentId = $tr->parent_id ?: $tr->id;
        $seriesTrainings = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();
        if ($seriesTrainings->count() === 0) {
            $seriesTrainings = collect([$tr]);
        }

        $invites = [];
        foreach ($memberIds as $mid) {
            $existingInv = TrainingInvitation::where('training_id', $tr->id)
                ->where('member_id', $mid)
                ->first();

            if ($existingInv) {
                if ($inviteStatus === 'accepted' && $existingInv->status !== 'accepted') {
                    $this->processTrainingAcceptance($existingInv);
                    $existingInv->refresh();
                } elseif ($inviteStatus === 'open' && $existingInv->status === 'pending') {
                    $existingInv->status = 'open';
                    $existingInv->save();
                    $member = Member::find($mid);
                    if ($member) {
                        try {
                            MailHelper::sendTrainingNotification($member, $seriesTrainings, 'open', 'release');
                        } catch (\Exception $e) {
                            logger()->error("Training release email failed for member {$mid}: " . $e->getMessage());
                        }
                    }
                }
                $invites[] = $this->formatInvitation($existingInv);
            } else {
                $member = Member::find($mid);
                $snapshot = $member ? TrainingInvitation::getSnapshotData($tr, $member) : [];
                $inv = TrainingInvitation::create(array_merge([
                    'id' => 'ti_' . Str::random(8),
                    'training_id' => $tr->id,
                    'member_id' => $mid,
                    'status' => $inviteStatus === 'accepted' ? 'open' : $inviteStatus,
                ], $snapshot));

                if ($inviteStatus === 'accepted') {
                    $this->processTrainingAcceptance($inv);
                    $inv->refresh();
                }

                $invites[] = $this->formatInvitation($inv);

                $member = Member::find($mid);
                if ($member) {
                    try {
                        MailHelper::sendTrainingNotification($member, $seriesTrainings, $inviteStatus, 'release');
                    } catch (\Exception $e) {
                        logger()->error("Training release email failed for member {$mid}: " . $e->getMessage());
                    }
                }
            }
        }

        $trainingDates = [];
        foreach ($memberIds as $mid) {
            $invStatus = TrainingInvitation::where('training_id', $tr->id)->where('member_id', $mid)->value('status');
            if ($invStatus === 'accepted' || $invStatus === 'open') {
                foreach ($dates as $d) {
                    $existingDate = TrainingDate::where('training_id', $tr->id)
                        ->where('member_id', $mid)
                        ->first();

                    if (!$existingDate) {
                        $tDate = TrainingDate::create([
                            'id' => 'td_' . Str::random(8),
                            'training_id' => $tr->id,
                            'member_id' => $mid,
                            'date' => \Carbon\Carbon::parse($d)->format('Y-m-d H:i:s'),
                            'attended' => null,
                        ]);
                        $trainingDates[] = [
                            'id' => $tDate->id,
                            'trainingId' => $tDate->training_id,
                            'memberId' => $tDate->member_id,
                            'date' => $tDate->date ? \Carbon\Carbon::parse($tDate->date)->format('Y-m-d H:i:s') : null,
                            'attended' => null,
                            'refundStatus' => null,
                            'refundAmount' => null,
                        ];
                    } else {
                        $trainingDates[] = [
                            'id' => $existingDate->id,
                            'trainingId' => $existingDate->training_id,
                            'memberId' => $existingDate->member_id,
                            'date' => $existingDate->date ? \Carbon\Carbon::parse($existingDate->date)->format('Y-m-d H:i:s') : null,
                            'attended' => $existingDate->attended === null ? null : (bool)$existingDate->attended,
                            'refundStatus' => $existingDate->refund_status,
                            'refundAmount' => $existingDate->refund_amount !== null ? (float)$existingDate->refund_amount : null,
                        ];
                    }
                }
            }
        }

        return [$invites, $trainingDates];
    }

    public function processOverpaymentRefund(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'trainings.edit')) {
            return $response;
        }

        $request->validate([
            'memberId' => 'required|string',
            'amount' => 'required|numeric|min:0.01',
        ]);

        $tr = Training::findOrFail($id);
        $member = Member::findOrFail($request->memberId);
        $requestedAmount = round((float)$request->amount, 2);

        // WAL-01: skip flag lives on the wallet owner (parent for juniors).
        $walletOwner = WalletHelper::resolveMember($member);
        if ($walletOwner->skip_credit_consumption) {
            return response()->json([
                'message' => 'This member does not consume wallet credits; there is nothing to refund.',
            ], 422);
        }

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
        $monthSessionNames = $monthSessions->pluck('name')->filter()->unique()->values()->all();

        return DB::transaction(function () use ($tr, $member, $requestedAmount, $parentId, $monthSessionIds, $monthSessionNames, $walletOwner) {
            $invs = TrainingInvitation::whereIn('training_id', $monthSessionIds)
                ->where('member_id', $member->id)
                ->lockForUpdate()
                ->get();

            $acceptedInvs = $invs->where('status', 'accepted');
            if ($acceptedInvs->isEmpty()) {
                return response()->json([
                    'message' => 'No accepted invitation found for this member in this training month; nothing to refund.',
                ], 422);
            }

            // FIN-02: cap at what was actually paid for the month minus what was already refunded.
            // (Earlier overpayment refunds already reduced accepted_amount, so they are not subtracted twice.)
            $totalPaid = (float) $acceptedInvs->sum(fn ($i) => (float) ($i->accepted_amount ?? $i->accepted_per_session_fee ?? 0));

            $attendanceRefunded = (float) TrainingDate::whereIn('training_id', $monthSessionIds)
                ->where('member_id', $member->id)
                ->whereNotNull('refund_amount')
                ->sum('refund_amount');

            $updateRefunded = 0.0;
            if (!empty($monthSessionNames)) {
                $updateRefunded = (float) Transaction::where('member_id', $walletOwner->id)
                    ->whereIn('type', Transaction::inflowTypes())
                    ->where(function ($q) use ($member, $monthSessionNames) {
                        foreach ($monthSessionNames as $i => $name) {
                            $like = 'Training program update refund for ' . $member->name . ': ' . $name . '%';
                            if ($i === 0) {
                                $q->where('description', 'like', $like);
                            } else {
                                $q->orWhere('description', 'like', $like);
                            }
                        }
                    })
                    ->sum('amount');
            }

            $maxRefund = max(0, round($totalPaid - $attendanceRefunded - $updateRefunded, 2));
            $refundAmount = round(min($requestedAmount, $maxRefund), 2);
            if ($refundAmount <= 0) {
                return response()->json([
                    'message' => 'Nothing left to refund for this member in this training month.',
                ], 422);
            }

            $freshWallet = Member::where('id', $walletOwner->id)->lockForUpdate()->first();
            $freshWallet->credit = round($freshWallet->credit + $refundAmount, 2);
            $freshWallet->save();

            $transaction = Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $freshWallet->id,
                'type' => 'refund',
                'amount' => $refundAmount,
                'description' => "Training program overpayment refund for {$member->name}: {$tr->name}",
                'date' => now(),
            ]);

            try {
                MailHelper::sendTransactionEmail($freshWallet, $transaction);
            } catch (\Exception $e) {
                logger()->error("Transaction email failed: " . $e->getMessage());
            }

            $existingUpdateReq = TrainingUpdateRequest::where('member_id', $member->id)
                ->whereIn('training_id', array_merge([$tr->id, $parentId], $monthSessionIds))
                ->where('status', 'accepted')
                ->latest()
                ->first();

            $prevPaidSum = $existingUpdateReq
                ? (float)($existingUpdateReq->updated_monthly_fee ?? 0)
                : $invs->reduce(fn($sum, $i) => $sum + (float)($i->accepted_per_session_fee ?? $i->accepted_amount ?? 0), 0.0);

            $targetFee = max(0, round($prevPaidSum - $refundAmount, 2));

            if ($existingUpdateReq) {
                $existingUpdateReq->updated_monthly_fee = $targetFee;
                $existingUpdateReq->save();
            } else {
                TrainingUpdateRequest::create([
                    'id' => 'tur_' . Str::random(8),
                    'training_id' => $tr->id,
                    'member_id' => $member->id,
                    'existing_session_ids' => $invs->pluck('training_id')->all(),
                    'new_session_ids' => $invs->pluck('training_id')->all(),
                    'previously_paid_amount' => $prevPaidSum,
                    'updated_monthly_fee' => $targetFee,
                    'new_per_session_fee' => count($monthSessionIds) > 0 ? round($targetFee / count($monthSessionIds), 2) : 0,
                    'additional_amount' => -$refundAmount,
                    'status' => 'accepted',
                ]);
            }

            $acceptedCount = $acceptedInvs->count();
            $perSess = $acceptedCount > 0 ? round($targetFee / $acceptedCount, 2) : 0;
            foreach ($acceptedInvs as $inv) {
                $inv->accepted_per_session_fee = $perSess;
                $inv->accepted_amount = $perSess;
                $inv->save();
            }

            $currency = Setting::where('key', 'currency')->value('value') ?? '$';
            return response()->json([
                'message' => "Refund of {$currency}" . number_format($refundAmount, 2) . " processed successfully to {$member->name}'s wallet.",
                'refundedAmount' => $refundAmount,
            ]);
        });
    }

    public function destroy($id)
    {
        if ($response = PermissionHelper::requireAdminPermission(request(), 'trainings.delete')) {
            return $response;
        }

        $t = Training::findOrFail($id);
        $parentId = $t->parent_id ?: $t->id;

        $series = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();

        $tYearMonth = \Carbon\Carbon::parse($t->start_date)->format('Y-m');
        $monthSessions = $series->filter(function ($sItem) use ($tYearMonth) {
            return \Carbon\Carbon::parse($sItem->start_date)->format('Y-m') === $tYearMonth;
        });
        $sessionIds = $monthSessions->pluck('id')->all();

        if ($t->status !== 'cancelled') {
            $hasAccepted = TrainingInvitation::whereIn('training_id', $sessionIds)
                ->where('status', 'accepted')
                ->exists();

            if ($hasAccepted) {
                return response()->json([
                    'message' => 'Cannot delete a training program with accepted invitations unless it is cancelled.'
                ], 422);
            }
        }

        // The Delete operation must only remove the training program and its related records.
        // It must never execute refund logic.

        TrainingInvitation::whereIn('training_id', $sessionIds)->delete();
        TrainingDate::whereIn('training_id', $sessionIds)->delete();
        Training::whereIn('id', $sessionIds)->delete();

        $remainingSeries = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();

        if ($remainingSeries->count() > 0) {
            $newParentId = $remainingSeries->first()->id;
            $newTotalCount = $remainingSeries->count();
            $repeatWeeks = max(1, (int)($remainingSeries->first()->repeat_weeks ?? $t->repeat_weeks ?? 1));
            $newRepeatMonths = max(1, (int) ceil($newTotalCount / $repeatWeeks));

            foreach ($remainingSeries as $remItem) {
                $remItem->update([
                    'parent_id' => $newParentId,
                    'sessions' => $newTotalCount,
                    'repeat_months' => $newRepeatMonths,
                ]);
            }
        }

        return response()->json(['message' => 'Monthly training program deleted successfully.']);
    }

    public function cancel(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'trainings.edit')) {
            return $response;
        }

        $request->validate([
            'reason' => 'required|string|max:1000',
        ]);

        Training::findOrFail($id);
        $reason = trim($request->reason);

        return DB::transaction(function () use ($id, $reason) {
            // Lock the session so concurrent cancel calls cannot both refund.
            $tr = Training::where('id', $id)->lockForUpdate()->firstOrFail();
            if ($tr->status === 'cancelled') {
                return response()->json([
                    'message' => 'Training program is already cancelled.',
                    'training' => $this->formatTraining($tr),
                ]);
            }

            $tr->status = 'cancelled';
            $tr->cancel_reason = $reason;
            $tr->save();

            // Refund ONLY this cancelled session for members who paid for it (once, on cancellation).
            $this->refundTrainingSessions([$tr->id], false);

            return response()->json([
                'message' => 'Training program cancelled successfully and eligible fees refunded.',
                'training' => $this->formatTraining($tr),
            ]);
        });
    }

    /**
     * Training workflow status is closed only via admin POST /trainings/{id}/close — no automatic closure.
     */
    public function close($id)
    {
        if ($response = PermissionHelper::requireAdminPermission(request(), 'trainings.edit')) {
            return $response;
        }

        $t = Training::findOrFail($id);
        if ($t->status === 'cancelled') {
            return response()->json(['message' => 'Cannot close a cancelled training program.'], 422);
        }

        $parentId = $t->parent_id ?: $t->id;
        $series = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->get();

        $tYearMonth = \Carbon\Carbon::parse($t->start_date)->format('Y-m');
        $monthSessions = $series->filter(function ($sItem) use ($tYearMonth) {
            return \Carbon\Carbon::parse($sItem->start_date)->format('Y-m') === $tYearMonth;
        });

        $idsToClose = $monthSessions
            ->filter(fn ($s) => !in_array($s->status, ['closed', 'cancelled'], true))
            ->pluck('id')
            ->all();

        if (empty($idsToClose)) {
            return response()->json([
                'message' => 'Training program is already closed.',
                'training' => $this->formatTraining($t->fresh()),
            ]);
        }

        Training::whereIn('id', $idsToClose)->update(['status' => 'closed']);
        $t->refresh();

        return response()->json([
            'message' => 'Training program closed successfully.',
            'training' => $this->formatTraining($t),
        ]);
    }

    /**
     * FIN-04: refunds ONLY the cancelled session(s): for every accepted invitation on that session the
     * remaining refundable amount (session paid amount minus attendance refund for THAT session, capped by
     * what is still left of the series payment after attendance / cancel / overpayment / update refunds)
     * is credited back to the wallet owner.
     */
    private function refundTrainingSessions(array $sessionIds, bool $isDeletion = false): void
    {
        if ($isDeletion) {
            return;
        }

        $sessions = Training::whereIn('id', $sessionIds)->get();

        foreach ($sessions as $session) {
            $invitations = TrainingInvitation::where('training_id', $session->id)
                ->where('status', 'accepted')
                ->lockForUpdate()
                ->get();

            foreach ($invitations as $invite) {
                $member = Member::find($invite->member_id);
                if (!$member) {
                    continue;
                }

                // WAL-01: skip flag lives on the wallet owner (parent for juniors).
                $walletMember = WalletHelper::resolveMember($member);
                if ($walletMember->skip_credit_consumption) {
                    continue;
                }

                $remainingRefund = InvitationSyncService::remainingSessionRefund($session, $member, $invite);
                if ($remainingRefund <= 0) {
                    continue;
                }

                $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                $freshWallet->credit = round($freshWallet->credit + $remainingRefund, 2);
                $freshWallet->save();

                $transaction = Transaction::create([
                    'id' => 't_' . Str::random(8),
                    'member_id' => $freshWallet->id,
                    'type' => 'refund',
                    'amount' => $remainingRefund,
                    'description' => 'Refund — cancelled training session for ' . $member->name . ': ' . $session->name,
                    'date' => now(),
                ]);

                try {
                    MailHelper::sendTransactionEmail($freshWallet, $transaction);
                } catch (\Exception $e) {
                    logger()->error("Transaction refund email failed for member {$freshWallet->id}: " . $e->getMessage());
                }
            }
        }
    }

    private function formatTraining($t)
    {
        $parentId = $t->parent_id ?: $t->id;
        $series = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();

        $idx = $series->search(fn($item) => $item->id === $t->id);
        $schIndex = ($idx !== false) ? $idx : 0;
        $totalSessions = $series->count();

        $storeWeeks = (int)($t->repeat_weeks ?? 3);
        $storeMonths = (int)($t->repeat_months ?? 1);

        $remainingWeeks = 1;
        $remainingMonths = 1;

        if ($totalSessions > 0) {
            $remainingCount = max(1, $totalSessions - $schIndex);

            if ($storeMonths <= 1) {
                $remainingWeeks = $remainingCount;
                $remainingMonths = 1;
            } else {
                $firstSession = $series->first();
                $storeMonths = (int)($firstSession->repeat_months ?? $t->repeat_months ?? 1);
                $parentStart = \Carbon\Carbon::parse($firstSession->start_date);
                $trStart = \Carbon\Carbon::parse($t->start_date);
                $mIdx = ($trStart->year - $parentStart->year) * 12 + ($trStart->month - $parentStart->month);
                if ($mIdx < 0) $mIdx = 0;

                $weeksPerMonth = max(1, $storeWeeks);
                $wIdx = $schIndex % $weeksPerMonth;

                $remainingWeeks = max(1, $weeksPerMonth - $wIdx);
                $remainingMonths = max(1, $storeMonths - $mIdx);
            }
        }

        return [
            'id' => $t->id,
            'parentId' => $t->parent_id,
            'name' => $t->name,
            'startDate' => $t->start_date ? \Carbon\Carbon::parse($t->start_date)->format('Y-m-d H:i:s') : null,
            'endDate' => $t->end_date ? \Carbon\Carbon::parse($t->end_date)->format('Y-m-d H:i:s') : null,
            'repeatWeeks' => $storeWeeks,
            'repeatMonths' => $remainingMonths,
            'sessions' => (int)($t->sessions ?? $totalSessions),
            'slots' => (int)$t->slots,
            'duration' => $t->duration,
            'fees' => (float)$t->fees,
            'coach' => $t->coach,
            'location' => $t->location,
            'status' => $t->status,
            'cancelReason' => $t->cancel_reason,
            'targetType' => $t->target_type ?? 'junior',
            'isGroupTraining' => (bool)$t->is_group_training,
            'leagueGroupIds' => is_array($t->league_group_ids) ? $t->league_group_ids : (json_decode($t->league_group_ids, true) ?? []),
        ];
    }

    /**
     * Get the number of unique training programs the current user is enrolled in or has access to.
     */
    public function getUniqueTrainingsCount(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return 0;
        }

        if ($user->role === 'admin' || $user->role === 'volunteer') {
            return DB::table('trainings')
                ->get()
                ->map(fn($t) => $t->parent_id ?: $t->id)
                ->filter()
                ->unique()
                ->count();
        }

        $myMemberIds = $this->getFamilyMemberIdsForUser($user);

        $invitedTrainingIds = TrainingInvitation::whereIn('member_id', $myMemberIds)
            ->whereIn('status', ['open', 'accepted', 'waiting', 'declined'])
            ->pluck('training_id')
            ->all();

        if (empty($invitedTrainingIds)) {
            return 0;
        }

        return DB::table('trainings')
            ->whereIn('id', $invitedTrainingIds)
            ->get()
            ->map(fn($t) => $t->parent_id ?: $t->id)
            ->filter()
            ->unique()
            ->count();
    }

}
