<?php

namespace App\Http\Controllers\Api;

use App\Helpers\PermissionHelper;
use App\Helpers\WalletHelper;
use App\Http\Controllers\Controller;
use App\Models\LeagueGroup;
use App\Models\PlaySchedule;
use App\Models\Training;
use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LeagueGroupController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $groups = LeagueGroup::with(['members.parentMember'])->orderBy('name')->get();

        // Members only see groups they (or their family profiles) belong to
        if (!$user || $user->role !== 'admin') {
            if (!$user) {
                return response()->json([]);
            }
            $myMemberIds = Member::where('user_id', $user->id)
                ->orWhereIn('parent_member_id', function ($query) use ($user) {
                    $query->select('id')->from('members')->where('user_id', $user->id);
                })
                ->pluck('id')
                ->all();
            $groups = $groups->filter(function ($g) use ($myMemberIds) {
                return $g->members->contains(fn ($m) => in_array($m->id, $myMemberIds, true));
            })->values();
        }

        $isAdmin = $user->role === 'admin';

        return response()->json($groups->map(fn ($g) => $this->formatGroup($g, $isAdmin)));
    }

    /**
     * Remove non-club members from every group membership.
     * Runs only from admin write operations (never from a GET).
     */
    private function purgeNonClubMemberships(): void
    {
        DB::table('league_group_member')
            ->whereIn('member_id', Member::where('membership', false)->pluck('id'))
            ->delete();
    }

    /**
     * Strip a deleted group id from the league_group_ids JSON arrays of schedules and trainings.
     */
    private function stripGroupFromSchedules(string $groupId): void
    {
        foreach ([PlaySchedule::class, Training::class] as $modelClass) {
            $modelClass::whereNotNull('league_group_ids')->get()->each(function ($model) use ($groupId) {
                $ids = $model->league_group_ids;
                if (is_string($ids)) {
                    $ids = json_decode($ids, true) ?? [];
                }
                if (!is_array($ids) || !in_array($groupId, $ids, true)) {
                    return;
                }

                $model->league_group_ids = array_values(array_filter($ids, fn ($gid) => $gid !== $groupId));
                $model->save();
            });
        }
    }

    public function store(Request $request)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'league_groups.create')) {
            return $response;
        }

        if ($request->user()?->role !== 'admin') {
            return response()->json(['message' => 'Only admins can create groups.'], 403);
        }

        $request->validate([
            'name'                  => 'required|string|max:255',
            'description'           => 'nullable|string',
            'groupType'             => 'required|string|in:Adult,Junior',
            'memberIds'             => 'sometimes|array',
            'memberIds.*'           => 'string|exists:members,id',
            'memberPositions'       => 'sometimes|array',
            'memberPositions.*'     => 'nullable|string|max:255',
        ]);

        $targetGroupType = strtolower($request->groupType);

        if ($request->has('memberIds') && !empty($request->memberIds)) {
            $uniqueMemberIds = array_values(array_unique($request->memberIds));
            $validCount = Member::whereIn('id', $uniqueMemberIds)
                ->whereRaw('LOWER(member_type) = ?', [$targetGroupType])
                ->where('membership', true)
                ->count();

            if ($validCount !== count($uniqueMemberIds)) {
                return response()->json(['message' => 'All members must be club members and belong to the selected group type.'], 422);
            }
        }

        $group = LeagueGroup::create([
            'id'          => 'lg_' . Str::random(8),
            'name'        => $request->name,
            'description' => $request->description,
            'group_type'  => $request->groupType,
        ]);

        if ($request->has('memberIds')) {
            $syncData = $this->buildSyncData($request->memberIds, $request->memberPositions ?? []);
            $group->members()->sync($syncData);
        }

        $this->purgeNonClubMemberships();

        return response()->json($this->formatGroup($group->load(['members.parentMember']), true), 201);
    }

    public function update(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'league_groups.edit')) {
            return $response;
        }

        if ($request->user()?->role !== 'admin') {
            return response()->json(['message' => 'Only admins can update groups.'], 403);
        }

        $group = LeagueGroup::findOrFail($id);

        $request->validate([
            'name'                  => 'sometimes|required|string|max:255',
            'description'           => 'nullable|string',
            'groupType'             => 'sometimes|required|string|in:Adult,Junior',
            'memberIds'             => 'sometimes|array',
            'memberIds.*'           => 'string|exists:members,id',
            'memberPositions'       => 'sometimes|array',
            'memberPositions.*'     => 'nullable|string|max:255',
        ]);

        $currentGroupType = $request->has('groupType') ? $request->groupType : $group->group_type;
        $targetGroupType = strtolower($currentGroupType);

        if ($request->has('memberIds')) {
            $uniqueMemberIds = array_values(array_unique($request->memberIds ?? []));
            if (!empty($uniqueMemberIds)) {
                $validCount = Member::whereIn('id', $uniqueMemberIds)
                    ->whereRaw('LOWER(member_type) = ?', [$targetGroupType])
                    ->where('membership', true)
                    ->count();

                if ($validCount !== count($uniqueMemberIds)) {
                    return response()->json(['message' => 'All members must be club members and belong to the selected group type.'], 422);
                }
            }
        } elseif ($request->has('groupType') && strtolower((string) $group->group_type) !== $targetGroupType) {
            $existingIds = $group->members()->pluck('members.id')->all();
            if (!empty($existingIds)) {
                $validCount = Member::whereIn('id', $existingIds)
                    ->whereRaw('LOWER(member_type) = ?', [$targetGroupType])
                    ->where('membership', true)
                    ->count();

                if ($validCount !== count($existingIds)) {
                    return response()->json(['message' => 'All members must be club members and belong to the selected group type.'], 422);
                }
            }
        }

        if ($request->has('name'))        $group->name        = $request->name;
        if ($request->has('description')) $group->description = $request->description;
        if ($request->has('groupType'))   $group->group_type  = $request->groupType;
        $group->save();

        if ($request->has('memberIds')) {
            $syncData = $this->buildSyncData($request->memberIds, $request->memberPositions ?? []);
            $group->members()->sync($syncData);
        }

        $this->purgeNonClubMemberships();

        return response()->json($this->formatGroup($group->load(['members.parentMember']), true));
    }

    public function destroy(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'league_groups.delete')) {
            return $response;
        }

        if ($request->user()?->role !== 'admin') {
            return response()->json(['message' => 'Only admins can delete groups.'], 403);
        }

        DB::transaction(function () use ($id) {
            $group = LeagueGroup::findOrFail($id);
            $this->stripGroupFromSchedules((string) $group->id);
            $group->delete();
        });

        $this->purgeNonClubMemberships();

        return response()->json(['message' => 'Group deleted successfully.']);
    }

    /**
     * Build the sync array: [ memberId => ['position' => value], ... ]
     */
    private function buildSyncData(array $memberIds, array $memberPositions): array
    {
        $data = [];
        foreach ($memberIds as $memberId) {
            $pos = $memberPositions[$memberId] ?? null;
            if ($pos !== null && $pos !== '') {
                \App\Models\PlayerPosition::firstOrCreate(['name' => $pos]);
            }
            $data[$memberId] = ['position' => $pos ?: null];
        }
        return $data;
    }

    private function formatGroup($g, bool $includeWallet = false): array
    {
        $memberIds       = [];
        $memberPositions = [];
        $members         = [];

        foreach ($g->members as $member) {
            $memberIds[]                  = $member->id;
            $memberPositions[$member->id] = $member->pivot->position ?? null;
            $entry = [
                'id'            => $member->id,
                'firstName'     => $member->first_name,
                'lastName'      => $member->last_name,
                'grade'         => $member->grade,
                'position'      => $member->pivot->position ?? null,
            ];
            // Wallet balances are financial data: admins only.
            if ($includeWallet) {
                $walletMember          = WalletHelper::resolveMember($member);
                $entry['walletBalance'] = (float) ($walletMember->credit ?? 0.0);
            }
            $members[] = $entry;
        }

        return [
            'id'              => $g->id,
            'name'            => $g->name,
            'description'     => $g->description ?? '',
            'groupType'       => $g->group_type,
            'memberIds'       => $memberIds,
            'memberPositions' => $memberPositions,
            'members'         => $members,
        ];
    }
}
