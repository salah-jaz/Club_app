<?php

namespace App\Http\Controllers\Api;

use App\Helpers\PermissionHelper;
use App\Http\Controllers\Controller;
use App\Models\LeagueGroup;
use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LeagueGroupController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();
        $groups = LeagueGroup::with('members')->orderBy('name')->get();

        // Members only see groups they (or their family profiles) belong to
        if (!$user || $user->role !== 'admin') {
            $myMemberIds = Member::where('user_id', $user->id)->pluck('id')->all();
            $groups = $groups->filter(function ($g) use ($myMemberIds) {
                return $g->members->contains(fn ($m) => in_array($m->id, $myMemberIds, true));
            })->values();
        }

        return response()->json($groups->map(fn ($g) => $this->formatGroup($g)));
    }

    public function store(Request $request)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'league_groups.create')) {
            return $response;
        }

        if ($request->user()?->role !== 'admin') {
            return response()->json(['message' => 'Only admins can create league groups.'], 403);
        }

        $request->validate([
            'name'                  => 'required|string|max:255',
            'description'           => 'nullable|string',
            'memberIds'             => 'sometimes|array',
            'memberIds.*'           => 'string|exists:members,id',
            'memberPositions'       => 'sometimes|array',
            'memberPositions.*'     => 'nullable|string|max:255',
        ]);

        $group = LeagueGroup::create([
            'id'          => 'lg_' . Str::random(8),
            'name'        => $request->name,
            'description' => $request->description,
        ]);

        if ($request->has('memberIds')) {
            $syncData = $this->buildSyncData($request->memberIds, $request->memberPositions ?? []);
            $group->members()->sync($syncData);
        }

        return response()->json($this->formatGroup($group->load('members')), 201);
    }

    public function update(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'league_groups.edit')) {
            return $response;
        }

        if ($request->user()?->role !== 'admin') {
            return response()->json(['message' => 'Only admins can update league groups.'], 403);
        }

        $group = LeagueGroup::findOrFail($id);

        $request->validate([
            'name'                  => 'sometimes|required|string|max:255',
            'description'           => 'nullable|string',
            'memberIds'             => 'sometimes|array',
            'memberIds.*'           => 'string|exists:members,id',
            'memberPositions'       => 'sometimes|array',
            'memberPositions.*'     => 'nullable|string|max:255',
        ]);

        if ($request->has('name'))        $group->name        = $request->name;
        if ($request->has('description')) $group->description = $request->description;
        $group->save();

        if ($request->has('memberIds')) {
            $syncData = $this->buildSyncData($request->memberIds, $request->memberPositions ?? []);
            $group->members()->sync($syncData);
        }

        return response()->json($this->formatGroup($group->load('members')));
    }

    public function destroy(Request $request, $id)
    {
        if ($response = PermissionHelper::requireAdminPermission($request, 'league_groups.delete')) {
            return $response;
        }

        if ($request->user()?->role !== 'admin') {
            return response()->json(['message' => 'Only admins can delete league groups.'], 403);
        }

        $group = LeagueGroup::findOrFail($id);
        $group->delete();

        return response()->json(['message' => 'League group deleted successfully.']);
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

    private function formatGroup(LeagueGroup $g): array
    {
        $memberIds       = [];
        $memberPositions = [];
        $members         = [];

        foreach ($g->members as $member) {
            $memberIds[]                  = $member->id;
            $memberPositions[$member->id] = $member->pivot->position ?? null;
            $members[] = [
                'id'        => $member->id,
                'firstName' => $member->first_name,
                'lastName'  => $member->last_name,
                'grade'     => $member->grade,
                'position'  => $member->pivot->position ?? null,
            ];
        }

        return [
            'id'              => $g->id,
            'name'            => $g->name,
            'description'     => $g->description ?? '',
            'memberIds'       => $memberIds,
            'memberPositions' => $memberPositions,
            'members'         => $members,
        ];
    }
}
