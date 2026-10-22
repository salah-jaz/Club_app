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

        $memberIds = Member::where('user_id', $user->id)
            ->orWhereIn('parent_member_id', function ($query) use ($user) {
                $query->select('id')->from('members')->where('user_id', $user->id);
            })
            ->pluck('id')
            ->all();

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

        // Member access: must belong to at least one group to access Fixtures module
        $groupIds = $this->getMemberGroupIds($user);
        if (empty($groupIds)) {
            return response()->json([
                'message' => 'Access denied. You must belong to at least one group to access Fixtures.'
            ], 403);
        }

        // All fixtures are visible to members who have access to the Fixtures module
        $fixtures = Fixture::with('leagueGroup')
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

        if ($user->role === 'admin') {
            if ($response = PermissionHelper::requireAdminPermission($request, 'fixtures.view')) {
                return $response;
            }
            $fixture = Fixture::with('leagueGroup')->findOrFail($id);
            return response()->json($this->formatFixture($fixture));
        }

        // Member access: must belong to at least one group to access Fixtures module
        $groupIds = $this->getMemberGroupIds($user);
        if (empty($groupIds)) {
            return response()->json([
                'message' => 'Access denied. You must belong to at least one group to access Fixtures.'
            ], 403);
        }

        // All fixtures are visible to members who have access to the Fixtures module
        $fixture = Fixture::with('leagueGroup')->findOrFail($id);

        return response()->json($this->formatFixture($fixture));
    }

    public function store(Request $request)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $targetGroupId = $request->input('leagueGroupId') ?? $request->input('league_group_id');

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
            if ($targetGroupId && !in_array($targetGroupId, $groupIds, true)) {
                return response()->json([
                    'message' => 'You can only create fixtures for groups you belong to.'
                ], 403);
            }
        }

        $request->validate([
            'name' => 'required|string|max:255',
            'date' => 'required|date',
            'leagueGroupId' => 'sometimes|required_without:league_group_id|string|exists:league_groups,id',
            'league_group_id' => 'sometimes|required_without:leagueGroupId|string|exists:league_groups,id',
            'matchType' => 'sometimes|required_without:match_type|string|max:255',
            'match_type' => 'sometimes|required_without:matchType|string|max:255',
            'venueType' => 'sometimes|required_without:venue_type|string|max:255',
            'venue_type' => 'sometimes|required_without:venueType|string|max:255',
            'oppositionClub' => 'sometimes|required_without:opposition_club|string|max:255',
            'opposition_club' => 'sometimes|required_without:oppositionClub|string|max:255',
            'teamName' => 'sometimes|required_without:team_name|string|max:255',
            'team_name' => 'sometimes|required_without:teamName|string|max:255',
            'grade' => 'required|string|max:255',
            'status' => 'required|string|in:Opened,In Progress,Closed',
        ]);

        $matchType = $request->input('matchType') ?? $request->input('match_type');
        $venueType = $request->input('venueType') ?? $request->input('venue_type');
        $oppositionClub = $request->input('oppositionClub') ?? $request->input('opposition_club');
        $teamName = $request->input('teamName') ?? $request->input('team_name');

        $fixture = Fixture::create([
            'id' => 'fix_' . Str::random(8),
            'name' => $request->name,
            'date' => \Carbon\Carbon::parse($request->date),
            'league_group_id' => $targetGroupId,
            'match_type' => $matchType,
            'venue_type' => $venueType,
            'opposition_club' => $oppositionClub,
            'team_name' => $teamName,
            'grade' => $request->grade,
            'status' => $request->status,
            'result' => $request->input('result'),
            'home_team_name' => $request->input('homeTeamName') ?? $request->input('home_team_name'),
            'home_total_matches' => $request->input('homeTotalMatches') ?? $request->input('home_total_matches'),
            'home_total_games' => $request->input('homeTotalGames') ?? $request->input('home_total_games'),
            'home_total_points' => $request->input('homeTotalPoints') ?? $request->input('home_total_points'),
            'visiting_team_name' => $request->input('visitingTeamName') ?? $request->input('visiting_team_name'),
            'visiting_total_matches' => $request->input('visitingTotalMatches') ?? $request->input('visiting_total_matches'),
            'visiting_total_games' => $request->input('visitingTotalGames') ?? $request->input('visiting_total_games'),
            'visiting_total_points' => $request->input('visitingTotalPoints') ?? $request->input('visiting_total_points'),
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
        $targetGroupId = $request->input('leagueGroupId') ?? $request->input('league_group_id');

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
            if ($targetGroupId && !in_array($targetGroupId, $groupIds, true)) {
                return response()->json([
                    'message' => 'You can only assign fixtures to groups you belong to.'
                ], 403);
            }
        }

        $intFields = [
            'homeTotalMatches', 'home_total_matches',
            'homeTotalGames', 'home_total_games',
            'homeTotalPoints', 'home_total_points',
            'visitingTotalMatches', 'visiting_total_matches',
            'visitingTotalGames', 'visiting_total_games',
            'visitingTotalPoints', 'visiting_total_points',
        ];
        $sanitized = [];
        foreach ($intFields as $field) {
            if ($request->has($field)) {
                $val = $request->input($field);
                $sanitized[$field] = ($val === '' || $val === null) ? null : (is_numeric($val) ? (int)$val : $val);
            }
        }
        if ($request->has('result')) {
            $r = $request->input('result');
            $sanitized['result'] = ($r === '' || $r === 'none') ? null : $r;
        }
        if (!empty($sanitized)) {
            $request->merge($sanitized);
        }

        $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'date' => 'sometimes|required|date',
            'leagueGroupId' => 'sometimes|required|string|exists:league_groups,id',
            'league_group_id' => 'sometimes|required|string|exists:league_groups,id',
            'matchType' => 'sometimes|required|string|max:255',
            'match_type' => 'sometimes|required|string|max:255',
            'venueType' => 'sometimes|required|string|max:255',
            'venue_type' => 'sometimes|required|string|max:255',
            'oppositionClub' => 'sometimes|required|string|max:255',
            'opposition_club' => 'sometimes|required|string|max:255',
            'teamName' => 'sometimes|required|string|max:255',
            'team_name' => 'sometimes|required|string|max:255',
            'grade' => 'sometimes|required|string|max:255',
            'status' => 'sometimes|required|string|in:Opened,In Progress,Closed',
            'result' => 'nullable|string|in:Win,Loss',
            'homeTeamName' => 'nullable|string|max:255',
            'home_team_name' => 'nullable|string|max:255',
            'homeTotalMatches' => 'nullable|integer|min:0',
            'home_total_matches' => 'nullable|integer|min:0',
            'homeTotalGames' => 'nullable|integer|min:0',
            'home_total_games' => 'nullable|integer|min:0',
            'homeTotalPoints' => 'nullable|integer|min:0',
            'home_total_points' => 'nullable|integer|min:0',
            'visitingTeamName' => 'nullable|string|max:255',
            'visiting_team_name' => 'nullable|string|max:255',
            'visitingTotalMatches' => 'nullable|integer|min:0',
            'visiting_total_matches' => 'nullable|integer|min:0',
            'visitingTotalGames' => 'nullable|integer|min:0',
            'visiting_total_games' => 'nullable|integer|min:0',
            'visitingTotalPoints' => 'nullable|integer|min:0',
            'visiting_total_points' => 'nullable|integer|min:0',
        ]);

        $updates = [];
        if ($request->has('name')) $updates['name'] = $request->input('name');
        if ($request->has('date')) $updates['date'] = \Carbon\Carbon::parse($request->input('date'));
        if ($targetGroupId !== null) $updates['league_group_id'] = $targetGroupId;

        $matchType = $request->input('matchType') ?? $request->input('match_type');
        if ($matchType !== null) $updates['match_type'] = $matchType;

        $venueType = $request->input('venueType') ?? $request->input('venue_type');
        if ($venueType !== null) $updates['venue_type'] = $venueType;

        $oppositionClub = $request->input('oppositionClub') ?? $request->input('opposition_club');
        if ($oppositionClub !== null) $updates['opposition_club'] = $oppositionClub;

        $teamName = $request->input('teamName') ?? $request->input('team_name');
        if ($teamName !== null) $updates['team_name'] = $teamName;

        if ($request->has('grade')) $updates['grade'] = $request->input('grade');
        if ($request->has('status')) $updates['status'] = $request->input('status');

        if ($request->has('result')) {
            $r = $request->input('result');
            $updates['result'] = ($r === '' || $r === 'none') ? null : $r;
        }

        if ($request->has('homeTeamName') || $request->has('home_team_name')) {
            $updates['home_team_name'] = $request->input('homeTeamName') ?? $request->input('home_team_name');
        }
        if ($request->has('homeTotalMatches') || $request->has('home_total_matches')) {
            $val = $request->input('homeTotalMatches') ?? $request->input('home_total_matches');
            $updates['home_total_matches'] = ($val !== null && $val !== '') ? (int)$val : null;
        }
        if ($request->has('homeTotalGames') || $request->has('home_total_games')) {
            $val = $request->input('homeTotalGames') ?? $request->input('home_total_games');
            $updates['home_total_games'] = ($val !== null && $val !== '') ? (int)$val : null;
        }
        if ($request->has('homeTotalPoints') || $request->has('home_total_points')) {
            $val = $request->input('homeTotalPoints') ?? $request->input('home_total_points');
            $updates['home_total_points'] = ($val !== null && $val !== '') ? (int)$val : null;
        }

        if ($request->has('visitingTeamName') || $request->has('visiting_team_name')) {
            $updates['visiting_team_name'] = $request->input('visitingTeamName') ?? $request->input('visiting_team_name');
        }
        if ($request->has('visitingTotalMatches') || $request->has('visiting_total_matches')) {
            $val = $request->input('visitingTotalMatches') ?? $request->input('visiting_total_matches');
            $updates['visiting_total_matches'] = ($val !== null && $val !== '') ? (int)$val : null;
        }
        if ($request->has('visitingTotalGames') || $request->has('visiting_total_games')) {
            $val = $request->input('visitingTotalGames') ?? $request->input('visiting_total_games');
            $updates['visiting_total_games'] = ($val !== null && $val !== '') ? (int)$val : null;
        }
        if ($request->has('visitingTotalPoints') || $request->has('visiting_total_points')) {
            $val = $request->input('visitingTotalPoints') ?? $request->input('visiting_total_points');
            $updates['visiting_total_points'] = ($val !== null && $val !== '') ? (int)$val : null;
        }

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
            'league_group_id' => $f->league_group_id,
            'leagueGroupName' => $f->leagueGroup?->name,
            'leagueGroupType' => $f->leagueGroup?->group_type,
            'matchType' => $f->match_type,
            'match_type' => $f->match_type,
            'venueType' => $f->venue_type,
            'venue_type' => $f->venue_type,
            'oppositionClub' => $f->opposition_club,
            'opposition_club' => $f->opposition_club,
            'teamName' => $f->team_name,
            'team_name' => $f->team_name,
            'grade' => $f->grade,
            'status' => $f->status,
            'result' => $f->result,
            'homeTeamName' => $f->home_team_name ?? $f->team_name,
            'home_team_name' => $f->home_team_name ?? $f->team_name,
            'homeTotalMatches' => $f->home_total_matches,
            'home_total_matches' => $f->home_total_matches,
            'homeTotalGames' => $f->home_total_games,
            'home_total_games' => $f->home_total_games,
            'homeTotalPoints' => $f->home_total_points,
            'home_total_points' => $f->home_total_points,
            'visitingTeamName' => $f->visiting_team_name ?? $f->opposition_club,
            'visiting_team_name' => $f->visiting_team_name ?? $f->opposition_club,
            'visitingTotalMatches' => $f->visiting_total_matches,
            'visiting_total_matches' => $f->visiting_total_matches,
            'visitingTotalGames' => $f->visiting_total_games,
            'visiting_total_games' => $f->visiting_total_games,
            'visitingTotalPoints' => $f->visiting_total_points,
            'visiting_total_points' => $f->visiting_total_points,
            'createdAt' => optional($f->created_at)?->toISOString(),
            'updatedAt' => optional($f->updated_at)?->toISOString(),
        ];
    }
}
