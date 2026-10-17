<?php

namespace App\Http\Controllers\Api;

use App\Helpers\PermissionHelper;
use App\Http\Controllers\Controller;
use App\Models\Fixture;
use App\Models\LeagueGroup;
use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FixtureController extends Controller
{
    /**
     * Retrieve all group IDs the authenticated user belongs to.
     */
    private function getMemberGroupIds($user): array
    {
        if (!$user) {
            return [];
        }

        $memberIds = Member::where('user_id', $user->id)->pluck('id')->all();
        if (empty($memberIds)) {
            return [];
        }

        return DB::table('league_group_member')
            ->whereIn('member_id', $memberIds)
            ->pluck('league_group_id')
            ->unique()
            ->values()
            ->all();
    }

    public function index(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([]);
        }

        if ($user->role === 'admin') {
            if ($response = PermissionHelper::requireAdminPermission($request, 'fixtures.view')) {
                return $response;
            }
            $fixtures = Fixture::with('leagueGroup')->orderBy('date', 'asc')->get();
            return response()->json($fixtures->map(fn($f) => $this->formatFixture($f)));
        }

        // Member access: must belong to at least one group
        $groupIds = $this->getMemberGroupIds($user);
        if (empty($groupIds)) {
            return response()->json([
                'message' => 'Access denied. You must belong to at least one group to access Fixtures.'
            ], 403);
        }

        $fixtures = Fixture::with('leagueGroup')
            ->whereIn('league_group_id', $groupIds)
            ->orderBy('date', 'asc')
            ->get();

        return response()->json($fixtures->map(fn($f) => $this->formatFixture($f)));
    }

    public function show(Request $request, $id)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $fixture = Fixture::with('leagueGroup')->findOrFail($id);

        if ($user->role === 'admin') {
            if ($response = PermissionHelper::requireAdminPermission($request, 'fixtures.view')) {
                return $response;
            }
            return response()->json($this->formatFixture($fixture));
        }

        // Member access
        $groupIds = $this->getMemberGroupIds($user);
        if (empty($groupIds)) {
            return response()->json([
                'message' => 'Access denied. You must belong to at least one group to access Fixtures.'
            ], 403);
        }

        if (!in_array($fixture->league_group_id, $groupIds, true)) {
            return response()->json([
                'message' => 'Unauthorized. You can only view fixtures associated with your groups.'
            ], 403);
        }

        return response()->json($this->formatFixture($fixture));
    }

    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user->role === 'admin') {
            if ($response = PermissionHelper::requireAdminPermission($request, 'fixtures.create')) {
                return $response;
            }
        } else {
            $groupIds = $this->getMemberGroupIds($user);
            if (empty($groupIds)) {
                return response()->json([
                    'message' => 'Access denied. You must belong to at least one group to access Fixtures.'
                ], 403);
            }
            if ($request->filled('leagueGroupId') && !in_array($request->leagueGroupId, $groupIds, true)) {
                return response()->json([
                    'message' => 'You can only create fixtures for groups you belong to.'
                ], 403);
            }
        }

        $request->validate([
            'name' => 'required|string|max:255',
            'date' => 'required|date',
            'leagueGroupId' => 'required|string|exists:league_groups,id',
            'matchType' => 'required|string|max:255',
            'venueType' => 'required|string|max:255',
            'oppositionClub' => 'required|string|max:255',
            'teamName' => 'required|string|max:255',
            'grade' => 'required|string|max:255',
            'status' => 'required|string|in:Opened,In Progress,Closed',
        ]);

        $fixture = Fixture::create([
            'id' => 'fix_' . Str::random(8),
            'name' => $request->name,
            'date' => \Carbon\Carbon::parse($request->date),
            'league_group_id' => $request->leagueGroupId,
            'match_type' => $request->matchType,
            'venue_type' => $request->venueType,
            'opposition_club' => $request->oppositionClub,
            'team_name' => $request->teamName,
            'grade' => $request->grade,
            'status' => $request->status,
        ]);

        return response()->json($this->formatFixture($fixture->load('leagueGroup')), 201);
    }

    public function update(Request $request, $id)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $fixture = Fixture::findOrFail($id);

        if ($user->role === 'admin') {
            if ($response = PermissionHelper::requireAdminPermission($request, 'fixtures.edit')) {
                return $response;
            }
        } else {
            $groupIds = $this->getMemberGroupIds($user);
            if (empty($groupIds)) {
                return response()->json([
                    'message' => 'Access denied. You must belong to at least one group to access Fixtures.'
                ], 403);
            }
            if (!in_array($fixture->league_group_id, $groupIds, true)) {
                return response()->json([
                    'message' => 'Unauthorized. You can only edit fixtures associated with your groups.'
                ], 403);
            }
            if ($request->filled('leagueGroupId') && !in_array($request->leagueGroupId, $groupIds, true)) {
                return response()->json([
                    'message' => 'You can only assign fixtures to groups you belong to.'
                ], 403);
            }
        }

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'date' => 'sometimes|required|date',
            'leagueGroupId' => 'sometimes|required|string|exists:league_groups,id',
            'matchType' => 'sometimes|required|string|max:255',
            'venueType' => 'sometimes|required|string|max:255',
            'oppositionClub' => 'sometimes|required|string|max:255',
            'teamName' => 'sometimes|required|string|max:255',
            'grade' => 'sometimes|required|string|max:255',
            'status' => 'sometimes|required|string|in:Opened,In Progress,Closed',
        ]);

        $updates = [];
        if ($request->has('name')) $updates['name'] = $request->name;
        if ($request->has('date')) $updates['date'] = \Carbon\Carbon::parse($request->date);
        if ($request->has('leagueGroupId')) $updates['league_group_id'] = $request->leagueGroupId;
        if ($request->has('matchType')) $updates['match_type'] = $request->matchType;
        if ($request->has('venueType')) $updates['venue_type'] = $request->venueType;
        if ($request->has('oppositionClub')) $updates['opposition_club'] = $request->oppositionClub;
        if ($request->has('teamName')) $updates['team_name'] = $request->teamName;
        if ($request->has('grade')) $updates['grade'] = $request->grade;
        if ($request->has('status')) $updates['status'] = $request->status;

        $fixture->update($updates);

        return response()->json($this->formatFixture($fixture->fresh()->load('leagueGroup')));
    }

    public function destroy(Request $request, $id)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ($user->role !== 'admin') {
            return response()->json(['message' => 'Members are not authorized to delete fixtures.'], 403);
        }

        if ($response = PermissionHelper::requireAdminPermission($request, 'fixtures.delete')) {
            return $response;
        }

        $fixture = Fixture::findOrFail($id);
        $fixture->delete();

        return response()->json(['message' => 'Fixture deleted successfully.']);
    }

    private function formatFixture(Fixture $f): array
    {
        $dateStr = '';
        if ($f->date) {
            $parsed = \Carbon\Carbon::parse($f->date);
            $dateStr = $parsed->format('Y-m-d\TH:i:s');
        }

        return [
            'id' => $f->id,
            'name' => $f->name,
            'date' => $dateStr,
            'leagueGroupId' => $f->league_group_id,
            'leagueGroupName' => $f->leagueGroup?->name,
            'leagueGroupType' => $f->leagueGroup?->group_type,
            'matchType' => $f->match_type,
            'venueType' => $f->venue_type,
            'oppositionClub' => $f->opposition_club,
            'teamName' => $f->team_name,
            'grade' => $f->grade,
            'status' => $f->status,
            'createdAt' => optional($f->created_at)?->toISOString(),
            'updatedAt' => optional($f->updated_at)?->toISOString(),
        ];
    }
}
