<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\TrainingDate;
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
        return response()->json($trainings->map(fn($t) => $this->formatTraining($t)));
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'startDate' => 'required|date',
            'endDate' => 'required|date',
            'repeatWeeks' => 'sometimes|integer|min:1|max:52',
            'repeatMonths' => 'sometimes|integer|min:1|max:24',
            'sessions' => 'sometimes|integer|min:1',
            'slots' => 'required|integer|min:1',
            'duration' => 'required|string',
            'fees' => 'required|numeric',
            'coach' => 'required|string',
            'location' => 'required|string',
            'targetType' => 'required|in:adult,junior,Adult,Junior',
        ]);

        $repeatWeeks = max(1, min(52, (int) $request->input('repeatWeeks', 3)));
        $repeatMonths = max(1, min(24, (int) $request->input('repeatMonths', 1)));
        $targetType = strtolower($request->targetType) === 'adult' ? 'adult' : 'junior';

        $baseStart = \Carbon\Carbon::parse($request->startDate);
        $baseEnd = \Carbon\Carbon::parse($request->endDate);
        $durationMins = max(15, $baseStart->diffInMinutes($baseEnd));

        $parentId = 'tr_' . Str::random(8);
        $created = [];
        $totalSessions = $repeatWeeks * $repeatMonths;

        for ($m = 0; $m < $repeatMonths; $m++) {
            for ($w = 0; $w < $repeatWeeks; $w++) {
                $isParent = ($m === 0 && $w === 0);
                $schId = $isParent ? $parentId : ('tr_' . Str::random(8));

                $sessionStart = $baseStart->copy()->addWeeks($w)->addMonths($m);
                $sessionEnd = $sessionStart->copy()->addMinutes($durationMins);

                $rawName = $isParent ? $request->name : $this->trainingNameFromDate($sessionStart);
                $name = $this->uniqueTrainingName($rawName);

                $tr = Training::create([
                    'id' => $schId,
                    'parent_id' => $parentId,
                    'name' => $name,
                    'start_date' => $sessionStart,
                    'end_date' => $sessionEnd,
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

        $schIndex = $series->search(fn($item) => $item->id === $tr->id);
        if ($schIndex === false) {
            $schIndex = 0;
        }

        $oldWeeks = (int)($tr->repeat_weeks ?? 3);
        $oldMonths = (int)($tr->repeat_months ?? 1);

        $newWeeks = $request->has('repeatWeeks') ? max(1, min(52, (int) $request->input('repeatWeeks'))) : $oldWeeks;
        $newMonths = $request->has('repeatMonths') ? max(1, min(24, (int) $request->input('repeatMonths'))) : $oldMonths;

        if ($request->has('repeatWeeks') || $request->has('repeatMonths')) {
            if ($oldMonths <= 1 && $newMonths <= 1) {
                if ($request->has('repeatWeeks')) {
                    $requestedWeeks = max(1, min(52, (int) $request->input('repeatWeeks')));
                    $targetTotalWeeks = $schIndex + $requestedWeeks;
                    $currentTotal = $series->count();

                    if ($targetTotalWeeks < $currentTotal) {
                        for ($i = $targetTotalWeeks; $i < $currentTotal; $i++) {
                            if (isset($series[$i])) {
                                $sToDelete = $series[$i];
                                TrainingInvitation::where('training_id', $sToDelete->id)->delete();
                                TrainingDate::where('training_id', $sToDelete->id)->delete();
                                $sToDelete->delete();
                            }
                        }
                    } else if ($targetTotalWeeks > $currentTotal) {
                        $toAddCount = $targetTotalWeeks - $currentTotal;
                        $lastSession = $series->last();
                        $baseStart = \Carbon\Carbon::parse($lastSession->start_date);
                        $baseEnd = \Carbon\Carbon::parse($lastSession->end_date);
                        $durMins = max(15, $baseStart->diffInMinutes($baseEnd));

                        for ($i = 1; $i <= $toAddCount; $i++) {
                            $nextStart = $baseStart->copy()->addWeeks($i);
                            $exists = Training::where('parent_id', $parentId)
                                ->whereDate('start_date', $nextStart->toDateString())
                                ->exists();

                            if (!$exists) {
                                $nextEnd = $nextStart->copy()->addMinutes($durMins);
                                $rawName = $this->trainingNameFromDate($nextStart);
                                $name = $this->uniqueTrainingName($rawName);

                                Training::create([
                                    'id' => 'tr_' . Str::random(8),
                                    'parent_id' => $parentId,
                                    'name' => $name,
                                    'start_date' => $nextStart,
                                    'end_date' => $nextEnd,
                                    'repeat_weeks' => $targetTotalWeeks,
                                    'repeat_months' => 1,
                                    'sessions' => $targetTotalWeeks,
                                    'slots' => $request->input('slots', $tr->slots),
                                    'duration' => $request->input('duration', $tr->duration),
                                    'fees' => $request->input('fees', $tr->fees),
                                    'coach' => $request->input('coach', $tr->coach),
                                    'location' => $request->input('location', $tr->location),
                                    'status' => 'open',
                                    'target_type' => $tr->target_type ?? 'junior',
                                ]);
                            }
                        }
                    }
                    $newWeeks = $targetTotalWeeks;
                }
            } else {
                $mIdx = intdiv($schIndex, max(1, $oldWeeks));
                $wIdx = $schIndex % max(1, $oldWeeks);

                if ($request->has('repeatWeeks')) {
                    $requestedWeeks = max(1, min(52, (int) $request->input('repeatWeeks')));
                    $targetWeeksPerMonth = $wIdx + $requestedWeeks;

                    if ($targetWeeksPerMonth < $oldWeeks) {
                        for ($m = 0; $m < $oldMonths; $m++) {
                            for ($w = $targetWeeksPerMonth; $w < $oldWeeks; $w++) {
                                $idxToDelete = $m * $oldWeeks + $w;
                                if (isset($series[$idxToDelete])) {
                                    $sToDelete = $series[$idxToDelete];
                                    TrainingInvitation::where('training_id', $sToDelete->id)->delete();
                                    TrainingDate::where('training_id', $sToDelete->id)->delete();
                                    $sToDelete->delete();
                                }
                            }
                        }
                    } else if ($targetWeeksPerMonth > $oldWeeks) {
                        $toAddW = $targetWeeksPerMonth - $oldWeeks;
                        for ($m = 0; $m < $oldMonths; $m++) {
                            $mLastIdx = min($series->count() - 1, $m * $oldWeeks + ($oldWeeks - 1));
                            $mLastSession = $series[$mLastIdx] ?? $series->last();
                            $mBaseStart = \Carbon\Carbon::parse($mLastSession->start_date);
                            $mBaseEnd = \Carbon\Carbon::parse($mLastSession->end_date);
                            $durMins = max(15, $mBaseStart->diffInMinutes($mBaseEnd));

                            for ($w = 1; $w <= $toAddW; $w++) {
                                $nextStart = $mBaseStart->copy()->addWeeks($w);
                                $exists = Training::where('parent_id', $parentId)
                                    ->whereDate('start_date', $nextStart->toDateString())
                                    ->exists();
                                if (!$exists) {
                                    $nextEnd = $nextStart->copy()->addMinutes($durMins);
                                    $rawName = $this->trainingNameFromDate($nextStart);
                                    $name = $this->uniqueTrainingName($rawName);

                                    Training::create([
                                        'id' => 'tr_' . Str::random(8),
                                        'parent_id' => $parentId,
                                        'name' => $name,
                                        'start_date' => $nextStart,
                                        'end_date' => $nextEnd,
                                        'repeat_weeks' => $targetWeeksPerMonth,
                                        'repeat_months' => $newMonths,
                                        'sessions' => $targetWeeksPerMonth * $newMonths,
                                        'slots' => $request->input('slots', $tr->slots),
                                        'duration' => $request->input('duration', $tr->duration),
                                        'fees' => $request->input('fees', $tr->fees),
                                        'coach' => $request->input('coach', $tr->coach),
                                        'location' => $request->input('location', $tr->location),
                                        'status' => 'open',
                                        'target_type' => $tr->target_type ?? 'junior',
                                    ]);
                                }
                            }
                        }
                    }
                    $newWeeks = $targetWeeksPerMonth;
                }

                $series = Training::where('parent_id', $parentId)
                    ->orWhere('id', $parentId)
                    ->orderBy('start_date', 'asc')
                    ->get();

                if ($request->has('repeatMonths')) {
                    $requestedMonths = max(1, min(24, (int) $request->input('repeatMonths')));
                    $currentRemainingMonths = max(1, $oldMonths - $mIdx);

                    if ($requestedMonths < $currentRemainingMonths) {
                        $keepMonthsCount = $mIdx + $requestedMonths;
                        for ($m = $keepMonthsCount; $m < $oldMonths; $m++) {
                            for ($w = 0; $w < $newWeeks; $w++) {
                                $idxToDelete = $m * $newWeeks + $w;
                                if (isset($series[$idxToDelete])) {
                                    $sToDelete = $series[$idxToDelete];
                                    TrainingInvitation::where('training_id', $sToDelete->id)->delete();
                                    TrainingDate::where('training_id', $sToDelete->id)->delete();
                                    $sToDelete->delete();
                                }
                            }
                        }
                        $newMonths = $keepMonthsCount;
                    } else if ($requestedMonths > $currentRemainingMonths) {
                        $targetTotalMonths = $mIdx + $requestedMonths;
                        $firstSession = $series->first();
                        $baseStart = \Carbon\Carbon::parse($firstSession->start_date);
                        $baseEnd = \Carbon\Carbon::parse($firstSession->end_date);
                        $durMins = max(15, $baseStart->diffInMinutes($baseEnd));

                        for ($m = $oldMonths; $m < $targetTotalMonths; $m++) {
                            for ($w = 0; $w < $newWeeks; $w++) {
                                $wBaseSession = $series[$w] ?? $series->first();
                                $wStart = \Carbon\Carbon::parse($wBaseSession->start_date);
                                $nextStart = $wStart->copy()->addMonths($m);

                                $exists = Training::where('parent_id', $parentId)
                                    ->whereDate('start_date', $nextStart->toDateString())
                                    ->exists();

                                if (!$exists) {
                                    $nextEnd = $nextStart->copy()->addMinutes($durMins);
                                    $rawName = $this->trainingNameFromDate($nextStart);
                                    $name = $this->uniqueTrainingName($rawName);

                                    Training::create([
                                        'id' => 'tr_' . Str::random(8),
                                        'parent_id' => $parentId,
                                        'name' => $name,
                                        'start_date' => $nextStart,
                                        'end_date' => $nextEnd,
                                        'repeat_weeks' => $newWeeks,
                                        'repeat_months' => $targetTotalMonths,
                                        'sessions' => $newWeeks * $targetTotalMonths,
                                        'slots' => $request->input('slots', $tr->slots),
                                        'duration' => $request->input('duration', $tr->duration),
                                        'fees' => $request->input('fees', $tr->fees),
                                        'coach' => $request->input('coach', $tr->coach),
                                        'location' => $request->input('location', $tr->location),
                                        'status' => 'open',
                                        'target_type' => $tr->target_type ?? 'junior',
                                    ]);
                                }
                            }
                        }
                        $newMonths = $targetTotalMonths;
                    }
                }
            }
        }

        $data = [];
        if ($request->has('name')) $data['name'] = $this->uniqueTrainingName($request->name, $tr->id);
        if ($request->has('startDate')) $data['start_date'] = $request->startDate;
        if ($request->has('endDate')) $data['end_date'] = $request->endDate;
        if ($request->has('repeatWeeks')) $data['repeat_weeks'] = $newWeeks;
        if ($request->has('repeatMonths')) $data['repeat_months'] = $newMonths;
        if ($request->has('slots')) $data['slots'] = $request->slots;
        if ($request->has('duration')) $data['duration'] = $request->duration;
        if ($request->has('fees')) $data['fees'] = $request->fees;
        if ($request->has('coach')) $data['coach'] = $request->coach;
        if ($request->has('location')) $data['location'] = $request->location;
        if ($request->has('status')) $data['status'] = $request->status;
        if ($request->has('targetType')) {
            $data['target_type'] = strtolower($request->targetType) === 'adult' ? 'adult' : 'junior';
        }

        $tr->update($data);

        // Synchronize repeat_weeks and repeat_months on remaining series items
        $updatedSeries = Training::where('parent_id', $parentId)
            ->orWhere('id', $parentId)
            ->orderBy('start_date', 'asc')
            ->get();
        $totalCount = $updatedSeries->count();
        foreach ($updatedSeries as $sItem) {
            $sItem->update([
                'repeat_weeks' => $newWeeks,
                'repeat_months' => $newMonths,
                'sessions' => $totalCount,
            ]);
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
        $repeatWeeks = max(1, (int)($tr->repeat_weeks ?? 1));
        $basePerWeekFee = (float) $tr->fees / $repeatWeeks;
        foreach ($newMemberIds as $mid) {
            $member = Member::find($mid);
            if ($member) {
                $feeToDeduct = FeeHelper::forMember($basePerWeekFee, $member);
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
                    $feeToDeduct = FeeHelper::forMember($basePerWeekFee, $member);
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

        return response()->json([
            'id' => $invite->id,
            'trainingId' => $invite->training_id,
            'memberId' => $invite->member_id,
            'status' => $invite->status,
        ]);
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

        $feeToDeduct = FeeHelper::forMember((float) $tr->fees, $member);

        return DB::transaction(function () use ($invite, $tr, $member, $feeToDeduct) {
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

            $freshInvite->status = 'accepted';
            $freshInvite->save();

            $invite->status = 'accepted';

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

                $totalFeeToDeduct = 0;
                $trainingNames = [];
                foreach ($mInvites as $inv) {
                    $tr = Training::find($inv->training_id);
                    if ($tr) {
                        // Determine the number of weekly sessions in this session's monthly group.
                        // This is the correct denominator for the per-week fee calculation.
                        $parentId = $tr->parent_id ?: $tr->id;
                        $storedRepeatWeeks = max(1, (int)($tr->repeat_weeks ?? 1));
                        $storedRepeatMonths = max(1, (int)($tr->repeat_months ?? 1));

                        $weeksPerMonth = $storedRepeatWeeks;

                        if ($storedRepeatMonths > 1) {
                            // Multi-month series: determine which month this session belongs to
                            // and count the actual sessions in that month's slice.
                            $series = Training::where('parent_id', $parentId)
                                ->orWhere('id', $parentId)
                                ->orderBy('start_date', 'asc')
                                ->pluck('id')
                                ->values();

                            $sessionIndex = $series->search($tr->id);
                            if ($sessionIndex !== false && $storedRepeatWeeks > 0) {
                                $monthIndex = intdiv($sessionIndex, $storedRepeatWeeks);
                                $monthStart = $monthIndex * $storedRepeatWeeks;
                                $monthEnd = $monthStart + $storedRepeatWeeks;
                                $weeksPerMonth = $series->slice($monthStart, $storedRepeatWeeks)->count();
                            }
                        }

                        $basePerWeekFee = (float) $tr->fees / max(1, $weeksPerMonth);
                        $totalFeeToDeduct += FeeHelper::forMember($basePerWeekFee, $member);
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
                            // Instead of returning JSON from inside the transaction, throw exception
                            // But returning a json response directly from DB::transaction won't rollback properly unless it's an exception, wait
                            // Actually Laravel DB::transaction will rollback ONLY if an exception is thrown.
                            throw new \Exception('Insufficient wallet balance. Please add funds before accepting this training invitation.');
                        }

                        $freshWalletMember->credit = round($freshWalletMember->credit - $totalFeeToDeduct, 2);
                        $freshWalletMember->save();

                        $description = 'Training program invitation accepted: ' . implode(', ', $trainingNames);
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

                foreach ($mInvites as $inv) {
                    $inv->status = 'accepted';
                    $inv->save();
                }
            }

            return response()->json(['message' => 'Invitations accepted successfully.']);
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
                }
                $invites[] = [
                    'id' => $existingInv->id,
                    'trainingId' => $existingInv->training_id,
                    'memberId' => $existingInv->member_id,
                    'status' => $existingInv->status,
                ];
            } else {
                $inv = TrainingInvitation::create([
                    'id' => 'ti_' . Str::random(8),
                    'training_id' => $tr->id,
                    'member_id' => $mid,
                    'status' => $inviteStatus === 'accepted' ? 'open' : $inviteStatus,
                ]);

                if ($inviteStatus === 'accepted') {
                    $this->processTrainingAcceptance($inv);
                    $inv->refresh();
                }

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
        }

        $trainingDates = [];
        foreach ($memberIds as $mid) {
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
                    ];
                } else {
                    $trainingDates[] = [
                        'id' => $existingDate->id,
                        'trainingId' => $existingDate->training_id,
                        'memberId' => $existingDate->member_id,
                        'date' => $existingDate->date,
                        'attended' => $existingDate->attended === null ? null : (bool)$existingDate->attended,
                    ];
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

        $this->refundTrainingSessions($sessionIds);

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

    private function refundTrainingSessions(array $sessionIds): void
    {
        $sessions = Training::whereIn('id', $sessionIds)->get();
        foreach ($sessions as $session) {
            $invitations = TrainingInvitation::where('training_id', $session->id)
                ->where('status', 'accepted')
                ->get();

            foreach ($invitations as $invite) {
                $member = Member::find($invite->member_id);
                if (!$member || $member->skip_credit_consumption) {
                    continue;
                }

                $debitTxn = Transaction::where('member_id', $member->id)
                    ->where('type', 'debit')
                    ->where(function ($q) use ($session) {
                        $q->where('description', 'like', '%' . $session->name . '%')
                          ->orWhere('description', 'like', 'Training%');
                    })
                    ->latest()
                    ->first();

                if ($debitTxn) {
                    $refundAmount = (float) $debitTxn->amount;

                    $alreadyRefunded = Transaction::where('member_id', $member->id)
                        ->where('type', 'credit')
                        ->where('description', 'like', '%' . $session->name . '%')
                        ->exists();

                    if (!$alreadyRefunded && $refundAmount > 0) {
                        $member->credit += $refundAmount;
                        $member->save();

                        $transaction = Transaction::create([
                            'id' => 't_' . Str::random(8),
                            'member_id' => $member->id,
                            'type' => 'credit',
                            'amount' => $refundAmount,
                            'description' => 'Refund — cancelled training session: ' . $session->name,
                            'date' => now(),
                        ]);

                        try {
                            MailHelper::sendTransactionEmail($member, $transaction);
                        } catch (\Exception $e) {
                            logger()->error("Transaction refund email failed for member {$member->id}: " . $e->getMessage());
                        }
                    }
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
                $weeksPerMonth = max(1, $storeWeeks);
                $mIdx = intdiv($schIndex, $weeksPerMonth);
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
            'repeatWeeks' => $remainingWeeks,
            'repeatMonths' => $remainingMonths,
            'sessions' => (int)($t->sessions ?? $totalSessions),
            'slots' => (int)$t->slots,
            'duration' => $t->duration,
            'fees' => (float)$t->fees,
            'coach' => $t->coach,
            'location' => $t->location,
            'status' => $t->status,
            'targetType' => $t->target_type ?? 'junior',
        ];
    }
}
