<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\TrainingDate;
use App\Models\TrainingUpdateRequest;
use App\Models\Holiday;
use App\Models\Member;
use App\Models\Transaction;
use App\Helpers\MailHelper;
use App\Helpers\FeeHelper;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;

class TrainingController extends Controller
{
    public function index()
    {
        $trainings = Training::orderBy('start_date', 'desc')->get();
        return response()->json($trainings->map(fn(Training $t) => $this->formatTraining($t)));
    }

    public function store(Request $request)
    {
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
        $durationMins = max(15, $baseStart->diffInMinutes($baseEnd));
        $dayOfWeek = $baseStart->dayOfWeek;

        $parentId = 'tr_' . Str::random(8);
        $sessionDates = [];

        for ($m = 0; $m < $repeatMonths; $m++) {
            $monthStart = $baseStart->copy()->startOfMonth()->addMonths($m);
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
                'start_date' => $sStart,
                'end_date' => $sEnd,
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
        $durationMins = max(15, $baseStart->diffInMinutes($baseEnd));
        $dayOfWeek = $baseStart->dayOfWeek;

        if ($request->has('repeatWeeks') || $request->has('repeatMonths') || $request->has('startDate')) {
            $targetDates = [];
            for ($m = 0; $m < $newMonths; $m++) {
                $monthStart = $baseStart->copy()->startOfMonth()->addMonths($m);
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
                        'start_date' => $sStart,
                        'end_date' => $sEnd,
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
                    ]);
                }
            }
        }

        $data = [];
        if ($request->has('name') && !empty($request->name)) $data['name'] = $this->uniqueTrainingName($request->name, $tr->id);
        if ($request->has('startDate') && !empty($request->startDate)) $data['start_date'] = $request->startDate;
        if ($request->has('endDate') && !empty($request->endDate)) $data['end_date'] = $request->endDate;
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
        if ($request->has('status') && !empty($request->status)) $data['status'] = $request->status;
        if ($request->has('targetType')) {
            $data['target_type'] = $targetTypeVal;
        }

        $tr->update($data);

        // Synchronize repeat_weeks, repeat_months, sessions, and fees on remaining series items
        $updatedSeries = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();
        $totalCount = $updatedSeries->count();
        $newFees = $request->has('fees') ? $request->fees : $tr->fees;
        foreach ($updatedSeries as $sItem) {
            $sItemData = [
                'repeat_weeks' => $newWeeks,
                'repeat_months' => $newMonths,
                'sessions' => $totalCount,
                'fees' => $newFees,
            ];
            if (empty($sItem->coach) && !empty($coachVal)) {
                $sItemData['coach'] = $coachVal;
            }
            if (empty($sItem->location) && !empty($locationVal)) {
                $sItemData['location'] = $locationVal;
            }
            $sItem->update($sItemData);
        }

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

        return response()->json($this->formatTraining($tr->fresh()));
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
        $targetType = $tr->target_type ?? 'junior';

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

        $idx = $series->search(fn($item) => $item->id === $tr->id);
        if ($idx === false) $idx = 0;

        $repeatWeeks = max(1, (int)($tr->repeat_weeks ?? 3));
        $monthIndex = intdiv($idx, $repeatWeeks);
        $monthSessions = $series->slice($monthIndex * $repeatWeeks, $repeatWeeks);
        $monthSessionIds = $monthSessions->pluck('id')->all();

        $memberId = $request->memberId;
        $selectedSids = array_values(array_intersect($request->input('sessionIds', []), $monthSessionIds));
        $forceAccept = (bool) $request->input('forceAccept', false);

        $member = Member::findOrFail($memberId);

        $existingInvs = TrainingInvitation::whereIn('training_id', $monthSessionIds)
            ->where('member_id', $memberId)
            ->get();

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
            $basePerWeekFee = (float) $tr->fees / $repeatWeeks;
            $totalFeeToDeduct = FeeHelper::forMember($basePerWeekFee * count($selectedSids), $member);

            return DB::transaction(function () use ($tr, $monthSessions, $selectedSids, $member, $totalFeeToDeduct, $existingInvs) {
                if ($totalFeeToDeduct > 0) {
                    $walletMember = $this->getWalletMember($member, $totalFeeToDeduct);
                    if (!$walletMember->skip_credit_consumption) {
                        $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                        if ($freshWallet->credit < $totalFeeToDeduct) {
                            return response()->json([
                                'message' => 'Insufficient wallet balance to accept this training program.',
                            ], 422);
                        }

                        $freshWallet->credit = round($freshWallet->credit - $totalFeeToDeduct, 2);
                        $freshWallet->save();

                        $transaction = Transaction::create([
                            'id' => 't_' . Str::random(8),
                            'member_id' => $freshWallet->id,
                            'type' => 'debit',
                            'amount' => $totalFeeToDeduct,
                            'description' => 'Training program invitation force accepted: ' . $tr->name,
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
                    if (!in_array($inv->training_id, $selectedSids) && $inv->status !== 'accepted') {
                        $inv->delete();
                    }
                }

                $holidayDates = Holiday::pluck('date')->toArray();
                foreach ($selectedSids as $sid) {
                    $sessionObj = Training::find($sid);
                    $repW = max(1, (int)($sessionObj->repeat_weeks ?? $tr->repeat_weeks ?? 1));
                    $bPerW = (float)($sessionObj->fees ?? $tr->fees ?? 0) / $repW;
                    $inv = TrainingInvitation::where('training_id', $sid)->where('member_id', $member->id)->first();
                    $appDisc = $inv && $inv->apply_discount !== null ? (bool)$inv->apply_discount : (bool)$member->apply_discount;
                    $discountedMonthlyFee = $inv && $inv->calculated_monthly_fee !== null ? (float)$inv->calculated_monthly_fee : FeeHelper::forMember((float)($sessionObj->fees ?? $tr->fees ?? 0), $member, $appDisc);
                    $perSessAmount = round($discountedMonthlyFee / $repW, 2);
                    if (!$inv) {
                        $inv = TrainingInvitation::create([
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

                    $sessionObj = Training::find($sid);
                    if ($sessionObj) {
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
                $inv = TrainingInvitation::create([
                    'id' => 'ti_' . Str::random(8),
                    'training_id' => $sid,
                    'member_id' => $member->id,
                    'status' => 'open',
                ]);

                try {
                    $sessionObj = Training::find($sid);
                    if ($sessionObj) {
                        MailHelper::sendTrainingNotification($member, $sessionObj, 'open', 'release');
                    }
                } catch (\Exception $e) {
                    logger()->error("Training invite email error: " . $e->getMessage());
                }
            } else {
                if ($inv->status === 'pending') {
                    $inv->status = 'open';
                    $inv->save();

                    try {
                        $sessionObj = Training::find($sid);
                        if ($sessionObj) {
                            MailHelper::sendTrainingNotification($member, $sessionObj, 'open', 'release');
                        }
                    } catch (\Exception $e) {
                        logger()->error("Training invite email error: " . $e->getMessage());
                    }
                }
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
        $targetType = $tr->target_type ?? 'junior';

        $familyMemberIds = Member::query()
            ->where('user_id', $userId)
            ->where('member_type', $targetType)
            ->where('status', 'active')
            ->whereIn('id', $memberIds)
            ->pluck('id')
            ->all();

        if (count($familyMemberIds) !== count($memberIds)) {
            return response()->json([
                'message' => "You can only enroll your own active {$targetType} family members.",
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

        // Validate wallet balance for all new members before enrolling
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
        $basePerWeekFee = (float) $tr->fees / $repeatWeeks;
        foreach ($newMemberIds as $mid) {
            $member = Member::find($mid);
            if ($member) {
                $existingInv = TrainingInvitation::where('training_id', $tr->id)->where('member_id', $mid)->first();
                $appDisc = $existingInv && $existingInv->apply_discount !== null ? (bool)$existingInv->apply_discount : (bool)$member->apply_discount;
                $feeToDeduct = $existingInv && $existingInv->calculated_per_session_fee !== null ? (float)$existingInv->calculated_per_session_fee : FeeHelper::forMember($basePerWeekFee, $member, $appDisc);
                $walletMember = $this->getWalletMember($member, $feeToDeduct);
                if (!$walletMember->skip_credit_consumption && $feeToDeduct > 0) {
                    if ($walletMember->credit < $feeToDeduct) {
                        return response()->json([
                            'message' => 'Insufficient wallet balance. Please add funds before accepting this training invitation.',
                        ], 422);
                    }
                }
            }
        }

        return DB::transaction(function () use ($tr, $newMemberIds, $basePerWeekFee) {
            foreach ($newMemberIds as $mid) {
                $member = Member::find($mid);
                if ($member) {
                    $existingInv = TrainingInvitation::where('training_id', $tr->id)->where('member_id', $mid)->first();
                    $appDisc = $existingInv && $existingInv->apply_discount !== null ? (bool)$existingInv->apply_discount : (bool)$member->apply_discount;
                    $feeToDeduct = $existingInv && $existingInv->calculated_per_session_fee !== null ? (float)$existingInv->calculated_per_session_fee : FeeHelper::forMember($basePerWeekFee, $member, $appDisc);
                    $walletMember = $this->getWalletMember($member, $feeToDeduct);
                    if (!$walletMember->skip_credit_consumption && $feeToDeduct > 0) {
                        $freshWalletMember = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                        $freshWalletMember->credit = round($freshWalletMember->credit - $feeToDeduct, 2);
                        $freshWalletMember->save();

                        $transaction = Transaction::create([
                            'id' => 't_' . Str::random(8),
                            'member_id' => $freshWalletMember->id,
                            'type' => 'debit',
                            'amount' => $feeToDeduct,
                            'description' => 'Training program invitation accepted: ' . $tr->name,
                            'date' => now(),
                        ]);

                        try {
                            MailHelper::sendTransactionEmail($freshWalletMember, $transaction);
                        } catch (\Exception $e) {
                            logger()->error("Transaction email failed for member {$freshWalletMember->id}: " . $e->getMessage());
                        }
                    }
                }
            }

            [$invites, $trainingDates] = $this->createInvitationsForMembers($tr, $newMemberIds, false, 'accepted');

            return response()->json([
                'message' => 'Family members accepted into this training program.',
                'training' => $this->formatTraining($tr),
                'invitations' => $invites,
                'dates' => $trainingDates,
            ]);
        });
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

    public function listInvitations()
    {
        \App\Services\InvitationSyncService::syncAllTrainingInvitations();
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

        if ($desired === 'accepted') {
            $error = $this->processTrainingAcceptance($invite);
            if ($error !== null) {
                return response()->json([
                    'message' => $error,
                ], 422);
            }
        } else {
            $invite->status = $desired;
            $invite->save();
        }

        return response()->json($this->formatInvitation($invite));
    }

    private function getWalletMember(Member $member, float $feeToDeduct): Member
    {
        if ($member->credit >= $feeToDeduct || !$member->parent_member_id) {
            return $member;
        }

        if ($member->parent_member_id) {
            $parent = Member::find($member->parent_member_id);
            if ($parent && $parent->credit >= $feeToDeduct) {
                return $parent;
            }
        }

        return $member;
    }

    private function processTrainingAcceptance(TrainingInvitation $invite): ?string
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

        $repeatWeeks = (int)($tr->repeat_weeks ?? 0);
        if ($repeatWeeks <= 0) {
            return 'Invalid or missing Repeat for Weeks configured for this training program.';
        }
        if ($tr->fees === null || (float)$tr->fees < 0) {
            return 'Invalid monthly fee configured for this training program.';
        }
        $appDisc = $invite->apply_discount !== null ? (bool)$invite->apply_discount : (bool)$member->apply_discount;
        $discountedMonthlyFee = $invite->calculated_monthly_fee !== null ? (float)$invite->calculated_monthly_fee : FeeHelper::forMember((float) $tr->fees, $member, $appDisc);
        $feeToDeduct = round($discountedMonthlyFee / $repeatWeeks, 2);
        $originalFee = round((float) $tr->fees / $repeatWeeks, 2);
        $discountApplied = round(max(0, $originalFee - $feeToDeduct), 2);

        return DB::transaction(function () use ($invite, $tr, $member, $feeToDeduct, $repeatWeeks, $originalFee, $discountApplied, $appDisc, $discountedMonthlyFee) {
            // Re-fetch invitation with lock to prevent concurrent acceptance
            $freshInvite = TrainingInvitation::where('id', $invite->id)->lockForUpdate()->first();
            if (!$freshInvite || $freshInvite->status === 'accepted') {
                return null;
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

                $description = 'Training program invitation accepted: ' . $tr->name . ' (Training Fee: $' . number_format($originalFee, 2) . ', Discount: $' . number_format($discountApplied, 2) . ', Amount Debited: $' . number_format($feeToDeduct, 2) . ')';

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
                    'date' => $tr->start_date,
                    'attended' => null,
                ]);
            }

            return null;
        });
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

        if ($status !== 'accepted') {
            TrainingInvitation::whereIn('id', $inviteIds)->update(['status' => $status]);
            return response()->json(['message' => 'Invitations declined.']);
        }

        try {
            return DB::transaction(function () use ($inviteIds) {
                $invites = TrainingInvitation::whereIn('id', $inviteIds)
                    ->where('status', '!=', 'accepted')
                    ->lockForUpdate()
                    ->get();
                
                if ($invites->isEmpty()) {
                    return response()->json(['message' => 'No valid invitations to accept.'], 422);
                }

                // Group by member_id to process fees per member
                $memberInvites = $invites->groupBy('member_id');
                
                foreach ($memberInvites as $memberId => $mInvites) {
                    $member = Member::find($memberId);
                    if (!$member) continue;

                    $totalFeeToDeduct = 0.0;
                    $totalOriginalFee = 0.0;
                    $trainingNames = [];
                    foreach ($mInvites as $inv) {
                        $tr = Training::find($inv->training_id);
                        if ($tr) {
                            $repeatWeeks = (int)($tr->repeat_weeks ?? 0);
                            if ($repeatWeeks <= 0) {
                                throw new \Exception('Invalid or missing Repeat for Weeks configured for training program: ' . $tr->name);
                            }
                            if ($tr->fees === null || (float)$tr->fees < 0) {
                                throw new \Exception('Invalid monthly fee configured for training program: ' . $tr->name);
                            }
                            $appDisc = $inv->apply_discount !== null ? (bool)$inv->apply_discount : (bool)$member->apply_discount;
                            $discountedMonthlyFee = $inv->calculated_monthly_fee !== null ? (float)$inv->calculated_monthly_fee : FeeHelper::forMember((float) $tr->fees, $member, $appDisc);
                            $perSessFee = round($discountedMonthlyFee / $repeatWeeks, 2);
                            $origSessFee = round((float) $tr->fees / $repeatWeeks, 2);

                            $totalFeeToDeduct += $perSessFee;
                            $totalOriginalFee += $origSessFee;
                            if (!in_array($tr->name, $trainingNames)) {
                                $trainingNames[] = $tr->name;
                            }
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

                            $discountApplied = round(max(0, $totalOriginalFee - $totalFeeToDeduct), 2);
                            $description = 'Training program invitation accepted: ' . implode(', ', $trainingNames) . ' (Training Fee: $' . number_format($totalOriginalFee, 2) . ', Discount: $' . number_format($discountApplied, 2) . ', Amount Debited: $' . number_format($totalFeeToDeduct, 2) . ')';
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

                    $holidayDates = Holiday::pluck('date')->toArray();
                    foreach ($mInvites as $inv) {
                        $trSession = Training::find($inv->training_id);
                        if ($trSession) {
                            $repW = max(1, (int)($trSession->repeat_weeks ?? 1));
                            $appDisc = $inv->apply_discount !== null ? (bool)$inv->apply_discount : (bool)$member->apply_discount;
                            $discountedMonthlyFee = $inv->calculated_monthly_fee !== null ? (float)$inv->calculated_monthly_fee : FeeHelper::forMember((float) $trSession->fees, $member, $appDisc);
                            $perSessAmount = round($discountedMonthlyFee / $repW, 2);

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
                                    'date' => $trSession->start_date,
                                    'attended' => null,
                                ]);
                            }
                        } else {
                            $inv->status = 'accepted';
                            $inv->save();
                        }
                    }
                }

                return response()->json(['message' => 'Invitations accepted successfully.']);
            });
        } catch (\Exception $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function listUpdateRequests()
    {
        $requests = TrainingUpdateRequest::orderBy('created_at', 'desc')->get();
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

        if ($updateReq->status !== 'pending') {
            return response()->json([
                'message' => 'This training update request has already been responded to.',
            ], 422);
        }

        $desiredStatus = $request->status;

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
                        'description' => 'Training program update request accepted: ' . $tr->name,
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
                        'type' => 'credit',
                        'amount' => $refundAmount,
                        'description' => 'Training program update refund: ' . $tr->name,
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

    public function listDates()
    {
        $dates = TrainingDate::all();
        return response()->json($dates->map(fn($d) => [
            'id' => $d->id,
            'trainingId' => $d->training_id,
            'memberId' => $d->member_id,
            'date' => $d->date,
            'attended' => $d->attended === null ? null : (bool)$d->attended,
            'refundStatus' => $d->refund_status,
            'refundAmount' => $d->refund_amount !== null ? (float)$d->refund_amount : null,
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
            'refundStatus' => $tDate->refund_status,
            'refundAmount' => $tDate->refund_amount !== null ? (float)$tDate->refund_amount : null,
        ]);
    }

    public function processRefund(Request $request, $id)
    {
        $request->validate([
            'refundType' => 'required|in:none,half,full',
        ]);

        $tDate = TrainingDate::findOrFail($id);

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

        $parentId = $tr->parent_id ?: $tr->id;
        $series = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();

        $idx = $series->search(fn($item) => $item->id === $tr->id);
        if ($idx === false) $idx = 0;

        $repeatWeeks = (int)($tr->repeat_weeks ?? 0);
        if ($repeatWeeks <= 0) {
            return response()->json(['message' => 'Invalid or missing Repeat for Weeks configured for this training program.'], 422);
        }
        if ($tr->fees === null || (float)$tr->fees < 0) {
            return response()->json(['message' => 'Invalid monthly fee configured for this training program.'], 422);
        }
        $existingInv = TrainingInvitation::where('training_id', $tr->id)->where('member_id', $member->id)->first();
        $appDisc = $existingInv && $existingInv->apply_discount !== null ? (bool)$existingInv->apply_discount : (bool)$member->apply_discount;
        $discountedMonthlyFee = FeeHelper::forMember((float) $tr->fees, $member, $appDisc);
        $weeklyFee = round($discountedMonthlyFee / $repeatWeeks, 2);

        $refundType = $request->refundType;
        $refundAmount = 0.0;

        if ($refundType === 'half') {
            $refundAmount = round($weeklyFee * 0.5, 2);
        } else if ($refundType === 'full') {
            $refundAmount = round($weeklyFee, 2);
        }

        return DB::transaction(function () use ($tDate, $tr, $member, $refundType, $refundAmount) {
            $tDate->refund_status = $refundType;
            $tDate->refund_amount = $refundAmount;
            $tDate->save();

            if ($refundAmount > 0 && !$member->skip_credit_consumption) {
                $walletMember = $this->getWalletMember($member, 0);
                $freshWallet = Member::where('id', $walletMember->id)->lockForUpdate()->first();
                $freshWallet->credit = round($freshWallet->credit + $refundAmount, 2);
                $freshWallet->save();

                $refundLabel = $refundType === 'half' ? '50% Refund' : 'Full Refund';
                $transaction = Transaction::create([
                    'id' => 't_' . Str::random(8),
                    'member_id' => $freshWallet->id,
                    'type' => 'credit',
                    'amount' => $refundAmount,
                    'description' => "Training session absent ({$refundLabel}): {$tr->name}",
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
                            MailHelper::sendTrainingNotification($member, $tr, 'open', 'release');
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
                        MailHelper::sendTrainingNotification($member, $tr, $inviteStatus, 'release');
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
                            'date' => $d,
                            'attended' => null,
                        ]);
                        $trainingDates[] = [
                            'id' => $tDate->id,
                            'trainingId' => $tDate->training_id,
                            'memberId' => $tDate->member_id,
                            'date' => $tDate->date,
                            'attended' => null,
                            'refundStatus' => null,
                            'refundAmount' => null,
                        ];
                    } else {
                        $trainingDates[] = [
                            'id' => $existingDate->id,
                            'trainingId' => $existingDate->training_id,
                            'memberId' => $existingDate->member_id,
                            'date' => $existingDate->date,
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

    public function destroy($id)
    {
        $t = Training::findOrFail($id);
        $parentId = $t->parent_id ?: $t->id;

        $series = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();

        $idx = $series->search(fn($item) => $item->id === $t->id);
        if ($idx === false) {
            $idx = 0;
        }

        $repeatWeeks = max(1, (int)($t->repeat_weeks ?? 3));
        $monthIndex = intdiv($idx, $repeatWeeks);

        $monthSessions = $series->slice($monthIndex * $repeatWeeks, $repeatWeeks);
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
        $request->validate([
            'reason' => 'required|string|max:1000',
        ]);

        $tr = Training::findOrFail($id);
        if ($tr->status === 'cancelled') {
            return response()->json([
                'message' => 'Training program is already cancelled.',
                'training' => $this->formatTraining($tr),
            ]);
        }

        $tr->status = 'cancelled';
        $tr->cancel_reason = trim($request->reason);
        $tr->save();

        // Process refunds for members who have paid for this training program session (refund happens only once upon cancellation)
        $this->refundTrainingSessions([$tr->id], false);

        return response()->json([
            'message' => 'Training program cancelled successfully and eligible fees refunded.',
            'training' => $this->formatTraining($tr),
        ]);
    }

    private function refundTrainingSessions(array $sessionIds, bool $isDeletion = false): void
    {
        if ($isDeletion) {
            return;
        }

        $sessions = Training::whereIn('id', $sessionIds)->get();
        $processedMemberParents = [];

        foreach ($sessions as $session) {
            if ($session->status === 'cancelled' && !$isDeletion) {
                // Cancellation refund is handled when status changes to cancelled
            }

            $parentId = $session->parent_id ?: $session->id;

            // Find all session IDs belonging to this training program series
            $seriesSessionIds = Training::where('parent_id', $parentId)
                ->orWhere('id', $parentId)
                ->pluck('id')
                ->all();

            $invitations = TrainingInvitation::where('training_id', $session->id)
                ->where('status', 'accepted')
                ->get();

            $baseName = trim(explode(' - Week', $session->name)[0]);
            $cleanBaseName = trim(preg_replace('/ \(\d+\)$/', '', $baseName));

            foreach ($invitations as $invite) {
                $member = Member::find($invite->member_id);
                if (!$member || $member->skip_credit_consumption) {
                    continue;
                }

                if (isset($processedMemberParents[$parentId][$member->id])) {
                    continue;
                }

                // 1. Total Amount Deducted at Acceptance for this member for this training program
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
                            $repeatWeeks = max(1, (int)($trSession->repeat_weeks ?? 1));
                            $appDisc = $accInv->apply_discount !== null ? (bool)$accInv->apply_discount : (bool)$member->apply_discount;
                            $discountedMonthlyFee = $accInv->calculated_monthly_fee !== null ? (float)$accInv->calculated_monthly_fee : FeeHelper::forMember((float) $trSession->fees, $member, $appDisc);
                            $calculatedDeducted += round($discountedMonthlyFee / $repeatWeeks, 2);
                        }
                    }
                }

                $debitSum = (float) Transaction::where('member_id', $member->id)
                    ->where('type', 'debit')
                    ->where(function ($q) use ($session, $cleanBaseName) {
                        $q->where('description', 'like', '%' . $session->name . '%')
                          ->orWhere('description', 'like', '%' . $cleanBaseName . '%')
                          ->orWhere('description', 'like', 'Training%');
                    })
                    ->sum('amount');

                $totalDeducted = max($calculatedDeducted, $debitSum);

                if ($totalDeducted <= 0) {
                    continue;
                }

                // 2. Total Attendance Refunds Already Approved for this member across this training series
                $tdAttendanceRefunds = TrainingDate::whereIn('training_id', $seriesSessionIds)
                    ->where('member_id', $member->id)
                    ->whereNotNull('refund_amount')
                    ->sum('refund_amount');

                $txnAttendanceRefunds = Transaction::where('member_id', $member->id)
                    ->where('type', 'credit')
                    ->where('description', 'like', 'Training session absent%')
                    ->where(function ($q) use ($session, $cleanBaseName) {
                        $q->where('description', 'like', '%' . $session->name . '%')
                          ->orWhere('description', 'like', '%' . $cleanBaseName . '%');
                    })
                    ->sum('amount');

                $alreadyRefundedAttendance = max((float)$tdAttendanceRefunds, (float)$txnAttendanceRefunds);

                // 3. Previous Cancellation / Deletion Refunds Already Issued for this member for this training program
                $alreadyRefundedCancellation = (float) Transaction::where('member_id', $member->id)
                    ->where('type', 'credit')
                    ->where(function ($q) {
                        $q->where('description', 'like', 'Refund — cancelled training session%')
                          ->orWhere('description', 'like', 'Refund — deleted training session%');
                    })
                    ->where(function ($q) use ($session, $cleanBaseName) {
                        $q->where('description', 'like', '%' . $session->name . '%')
                          ->orWhere('description', 'like', '%' . $cleanBaseName . '%');
                    })
                    ->sum('amount');

                // 4. Calculate Remaining Refund
                // Remaining Refund = Total Deducted − Total Attendance Refunds Already Approved − Previous Cancellation Refunds Already Issued
                $remainingRefund = round($totalDeducted - $alreadyRefundedAttendance - $alreadyRefundedCancellation, 2);

                if ($remainingRefund > 0) {
                    $member->credit = round($member->credit + $remainingRefund, 2);
                    $member->save();

                    $transaction = Transaction::create([
                        'id' => 't_' . Str::random(8),
                        'member_id' => $member->id,
                        'type' => 'credit',
                        'amount' => $remainingRefund,
                        'description' => $isDeletion
                            ? 'Refund — deleted training session: ' . $session->name
                            : 'Refund — cancelled training session: ' . $session->name,
                        'date' => now(),
                    ]);

                    try {
                        MailHelper::sendTransactionEmail($member, $transaction);
                    } catch (\Exception $e) {
                        logger()->error("Transaction refund email failed for member {$member->id}: " . $e->getMessage());
                    }
                }

                $processedMemberParents[$parentId][$member->id] = true;
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
            'startDate' => $t->start_date,
            'endDate' => $t->end_date,
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
        ];
    }
}
