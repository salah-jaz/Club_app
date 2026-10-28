<?php

namespace App\Http\Controllers\Api;

use App\Helpers\MailHelper;
use App\Helpers\PermissionHelper;
use App\Helpers\SessionTimingHelper;
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

    /**
     * Normalize fixture status names between legacy and new requirements.
     */
    private function normalizeStatus(?string $status): string
    {
        return match ($status) {
            'Opened' => 'Created',
            'In Progress' => 'Scheduled',
            'Closed' => 'Completed',
            'Created', 'Scheduled', 'Completed' => $status,
            default => $status ?? 'Created',
        };
    }

    /**
     * Validate and normalize multiple comma-separated captain email addresses.
     * Rejects semicolons and invalid email formats.
     */
    private function parseAndValidateCaptainEmails(?string $emails, string $fieldName): ?string
    {
        if ($emails === null || trim($emails) === '') {
            return null;
        }

        if (str_contains($emails, ';')) {
            abort(response()->json([
                'message' => "The {$fieldName} must use comma-separated email addresses only. Semicolons and other separators are not allowed."
            ], 422));
        }

        $parts = explode(',', $emails);
        $validList = [];

        foreach ($parts as $part) {
            $trimmed = trim($part);
            if ($trimmed === '') {
                abort(response()->json([
                    'message' => "The {$fieldName} contains empty entries between commas."
                ], 422));
            }

            if (!filter_var($trimmed, FILTER_VALIDATE_EMAIL)) {
                abort(response()->json([
                    'message' => "The {$fieldName} contains an invalid email address: '{$trimmed}'."
                ], 422));
            }

            $validList[] = $trimmed;
        }

        return implode(', ', $validList);
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
            'status' => 'required|string|in:Created,Scheduled,Completed,Opened,In Progress,Closed',
            'clubLocation' => 'nullable|string|max:255',
            'club_location' => 'nullable|string|max:255',
            'location' => 'nullable|string|max:255',
            'homeCaptainEmail' => 'nullable|string',
            'home_captain_email' => 'nullable|string',
            'oppositionCaptainEmail' => 'nullable|string',
            'opposition_captain_email' => 'nullable|string',
            'oppositionClubEmail' => 'nullable|string',
            'opposition_club_email' => 'nullable|string',
        ]);

        $matchType = $request->input('matchType') ?? $request->input('match_type');
        $venueType = $request->input('venueType') ?? $request->input('venue_type');
        $oppositionClub = $request->input('oppositionClub') ?? $request->input('opposition_club');
        $teamName = $request->input('teamName') ?? $request->input('team_name');
        $clubLocation = $request->input('clubLocation') ?? $request->input('club_location') ?? $request->input('location');

        $rawHomeCaptainEmail = $request->input('homeCaptainEmail') ?? $request->input('home_captain_email');
        $homeCaptainEmail = $this->parseAndValidateCaptainEmails($rawHomeCaptainEmail, 'Home Captain Email');

        $rawOppCaptainEmail = $request->input('oppositionCaptainEmail') ?? $request->input('opposition_captain_email')
            ?? $request->input('oppositionClubEmail') ?? $request->input('opposition_club_email');
        $oppositionCaptainEmail = $this->parseAndValidateCaptainEmails($rawOppCaptainEmail, 'Opposition Club / Team Captain Email');

        SessionTimingHelper::applyClubTimezone();
        $date = SessionTimingHelper::parseDateTime($request->date)->format('Y-m-d H:i:s');
        $status = $this->normalizeStatus($request->status);

        $rawEmailSent = $request->input('emailSent') ?? $request->input('email_sent');
        $emailSent = $rawEmailSent !== null ? filter_var($rawEmailSent, FILTER_VALIDATE_BOOLEAN) : false;
        $emailSentAt = null;
        if ($emailSent) {
            $rawEmailSentAt = $request->input('emailSentAt') ?? $request->input('email_sent_at');
            $emailSentAt = $rawEmailSentAt ? SessionTimingHelper::parseDateTime($rawEmailSentAt)->format('Y-m-d H:i:s') : now();
        }

        $fixture = Fixture::create([
            'id' => 'fix_' . Str::random(8),
            'name' => $request->name,
            'date' => $date,
            'league_group_id' => $targetGroupId,
            'match_type' => $matchType,
            'venue_type' => $venueType,
            'opposition_club' => $oppositionClub,
            'team_name' => $teamName,
            'club_location' => $clubLocation,
            'home_captain_email' => $homeCaptainEmail,
            'opposition_captain_email' => $oppositionCaptainEmail,
            'email_sent' => $emailSent,
            'email_sent_at' => $emailSentAt,
            'grade' => $request->grade,
            'status' => $status,
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
            'match_type' => 'sometimes|required_without:matchType|string|max:255',
            'venueType' => 'sometimes|required|string|max:255',
            'venue_type' => 'sometimes|required|string|max:255',
            'oppositionClub' => 'sometimes|required|string|max:255',
            'opposition_club' => 'sometimes|required|string|max:255',
            'teamName' => 'sometimes|required|string|max:255',
            'team_name' => 'sometimes|required|string|max:255',
            'grade' => 'sometimes|required|string|max:255',
            'status' => 'sometimes|required|string|in:Created,Scheduled,Completed,Opened,In Progress,Closed',
            'result' => 'nullable|string|in:Win,Loss',
            'clubLocation' => 'nullable|string|max:255',
            'club_location' => 'nullable|string|max:255',
            'location' => 'nullable|string|max:255',
            'homeCaptainEmail' => 'nullable|string',
            'home_captain_email' => 'nullable|string',
            'oppositionCaptainEmail' => 'nullable|string',
            'opposition_captain_email' => 'nullable|string',
            'oppositionClubEmail' => 'nullable|string',
            'opposition_club_email' => 'nullable|string',
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

        SessionTimingHelper::applyClubTimezone();

        $updates = [];
        if ($request->has('name')) $updates['name'] = $request->input('name');
        if ($request->has('date')) {
            $updates['date'] = SessionTimingHelper::parseDateTime($request->input('date'))->format('Y-m-d H:i:s');
        }
        if ($targetGroupId !== null) $updates['league_group_id'] = $targetGroupId;

        $matchType = $request->input('matchType') ?? $request->input('match_type');
        if ($matchType !== null) $updates['match_type'] = $matchType;

        $venueType = $request->input('venueType') ?? $request->input('venue_type');
        if ($venueType !== null) $updates['venue_type'] = $venueType;

        $oppositionClub = $request->input('oppositionClub') ?? $request->input('opposition_club');
        if ($oppositionClub !== null) $updates['opposition_club'] = $oppositionClub;

        $teamName = $request->input('teamName') ?? $request->input('team_name');
        if ($teamName !== null) $updates['team_name'] = $teamName;

        if ($request->has('clubLocation') || $request->has('club_location') || $request->has('location')) {
            $updates['club_location'] = $request->input('clubLocation') ?? $request->input('club_location') ?? $request->input('location');
        }

        if ($request->has('homeCaptainEmail') || $request->has('home_captain_email')) {
            $rawHome = $request->input('homeCaptainEmail') ?? $request->input('home_captain_email');
            $updates['home_captain_email'] = $this->parseAndValidateCaptainEmails($rawHome, 'Home Captain Email');
        }

        if (
            $request->has('oppositionCaptainEmail') || $request->has('opposition_captain_email') ||
            $request->has('oppositionClubEmail') || $request->has('opposition_club_email')
        ) {
            $rawOpp = $request->input('oppositionCaptainEmail') ?? $request->input('opposition_captain_email')
                ?? $request->input('oppositionClubEmail') ?? $request->input('opposition_club_email');
            $updates['opposition_captain_email'] = $this->parseAndValidateCaptainEmails($rawOpp, 'Opposition Club / Team Captain Email');
        }

        if ($request->has('grade')) $updates['grade'] = $request->input('grade');
        if ($request->has('status')) {
            $updates['status'] = $this->normalizeStatus($request->input('status'));
        }

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

        if ($request->has('emailSent') || $request->has('email_sent')) {
            $val = filter_var($request->input('emailSent') ?? $request->input('email_sent'), FILTER_VALIDATE_BOOLEAN);
            if ($val) {
                $updates['email_sent'] = true;
                if (!$fixture->email_sent_at) {
                    $updates['email_sent_at'] = now();
                }
            }
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

    /**
     * Validate and return multiple comma-separated email addresses as a unique array.
     * Rejects semicolons and invalid email formats.
     */
    private function parseAndValidateEmailList(?string $emails, string $fieldName): array
    {
        $normalized = $this->parseAndValidateCaptainEmails($emails, $fieldName);
        if ($normalized === null || trim($normalized) === '') {
            return [];
        }

        $list = array_map('trim', explode(',', $normalized));
        $validList = [];
        foreach ($list as $item) {
            if ($item !== '') {
                $validList[] = strtolower($item);
            }
        }

        return array_values(array_unique($validList));
    }

    /**
     * Send fixture details email to entered captain email addresses.
     */
    public function sendMail(Request $request, $id = null)
    {
        $user = $request->user();
        if (!$user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        // 1. Backend enforcement of notification toggle rule
        if (!MailHelper::isTemplateEnabled('fixture_scheduled')) {
            return response()->json([
                'message' => 'Fixture Scheduled Notification is currently disabled. Enable it under Email Templates & Notifications to send emails.',
                'notification_disabled' => true,
            ], 422);
        }

        $fixtureId = $id ?? $request->input('fixtureId') ?? $request->input('fixture_id') ?? $request->input('id');
        $fixture = null;
        if ($fixtureId) {
            $fixture = Fixture::with('leagueGroup')->findOrFail($fixtureId);
            if ($user->role !== 'admin') {
                $groupIds = $this->getMemberGroupIds($user);
                if (!in_array($fixture->league_group_id, $groupIds, true)) {
                    return response()->json(['message' => 'Unauthorized. You can only send emails for fixtures associated with your groups.'], 403);
                }
            }
        } else {
            if ($user->role !== 'admin') {
                $groupIds = $this->getMemberGroupIds($user);
                if (empty($groupIds)) {
                    return response()->json(['message' => 'Unauthorized. You do not belong to any groups.'], 403);
                }
                $groupId = $request->input('leagueGroupId') ?? $request->input('league_group_id');
                if (!empty($groupId) && !in_array($groupId, $groupIds, true)) {
                    return response()->json(['message' => 'Unauthorized. You can only send fixture emails for your assigned groups.'], 403);
                }
            }
        }

        // 2. Resolve captain emails for To and CC
        $rawHomeEmail = $request->input('homeCaptainEmail') ?? $request->input('home_captain_email')
            ?? ($fixture ? $fixture->home_captain_email : null);
        $rawOppEmail = $request->input('oppositionCaptainEmail') ?? $request->input('opposition_captain_email')
            ?? $request->input('oppositionClubEmail') ?? $request->input('opposition_club_email')
            ?? ($fixture ? $fixture->opposition_captain_email : null);

        $toEmails = $this->parseAndValidateEmailList($rawOppEmail, 'Opposition Club / Team Captain Email');
        $ccEmails = $this->parseAndValidateEmailList($rawHomeEmail, 'Home Captain Email');

        if (empty($toEmails)) {
            return response()->json([
                'message' => 'Please enter at least one valid email address in Opposition Club / Team Captain Email (To recipient) before sending.'
            ], 422);
        }

        // Prevent duplicate recipients across To and CC
        $ccEmails = array_values(array_diff($ccEmails, $toEmails));

        // 3. Fixture details
        $fixtureName = $request->input('name') ?? $fixture?->name;
        $fixtureDate = $request->input('date') ?? $fixture?->date;
        $teamName = $request->input('teamName') ?? $request->input('team_name') ?? $fixture?->team_name;
        $oppositionClub = $request->input('oppositionClub') ?? $request->input('opposition_club') ?? $fixture?->opposition_club;
        $matchType = $request->input('matchType') ?? $request->input('match_type') ?? $fixture?->match_type;
        $venueType = $request->input('venueType') ?? $request->input('venue_type') ?? $fixture?->venue_type;
        $grade = $request->input('grade') ?? $fixture?->grade;
        $clubLocation = $request->input('clubLocation') ?? $request->input('club_location')
            ?? $request->input('location') ?? $fixture?->club_location;
        $status = $this->normalizeStatus($request->input('status') ?? $fixture?->status);
        $result = $request->input('result') ?? $fixture?->result;

        if (empty($fixtureDate) || empty($teamName) || empty($oppositionClub)) {
            return response()->json([
                'message' => 'Please provide all essential fixture details (Date, Home Team, and Opposition Club) before sending mail.'
            ], 422);
        }

        // If fixture wasn't loaded by ID, check if a matching fixture exists in DB
        if (!$fixture) {
            SessionTimingHelper::applyClubTimezone();
            $parsedDate = SessionTimingHelper::parseDateTime($fixtureDate)->format('Y-m-d H:i:s');
            $existing = Fixture::where('date', $parsedDate)
                ->where('team_name', $teamName)
                ->where('opposition_club', $oppositionClub)
                ->first();
            if ($existing) {
                $fixture = $existing;
            }
        }

        $fixtureData = [
            'name' => $fixtureName,
            'date' => $fixtureDate,
            'team_name' => $teamName,
            'teamName' => $teamName,
            'opposition_club' => $oppositionClub,
            'oppositionClub' => $oppositionClub,
            'match_type' => $matchType,
            'matchType' => $matchType,
            'venue_type' => $venueType,
            'venueType' => $venueType,
            'grade' => $grade,
            'club_location' => $clubLocation,
            'clubLocation' => $clubLocation,
            'location' => $clubLocation,
            'status' => $status,
            'result' => $result,
        ];

        // 4. Concurrency lock to prevent simultaneous send attempts
        $lockKey = $fixture
            ? "fixture_mail_send_{$fixture->id}"
            : 'fixture_mail_send_' . md5(json_encode([$fixtureDate, $teamName, $oppositionClub, $toEmails]));

        $lock = \Illuminate\Support\Facades\Cache::lock($lockKey, 20);

        if (!$lock->get()) {
            return response()->json([
                'message' => 'An email send request is already in progress for this fixture. Please wait.',
            ], 422);
        }

        try {
            try {
                $sent = MailHelper::sendFixtureScheduledNotification($fixtureData, $toEmails, $ccEmails);
                if (!$sent) {
                    return response()->json([
                        'message' => 'Fixture Scheduled Notification is currently disabled. Enable it under Email Templates & Notifications to send emails.',
                        'notification_disabled' => true,
                    ], 422);
                }
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::error('Fixture notification email sending failed: ' . $e->getMessage(), [
                    'exception' => $e,
                    'fixture' => $fixtureData,
                    'to' => $toEmails,
                    'cc' => $ccEmails,
                ]);

                return response()->json([
                    'message' => 'Failed to deliver fixture notification email: ' . $e->getMessage(),
                    'error' => $e->getMessage(),
                ], 500);
            }

            // Mark email as sent in DB ONLY upon confirmed successful send
            if ($fixture) {
                $fixture->update([
                    'email_sent' => true,
                    'email_sent_at' => now(),
                ]);
            }

            $allRecipients = array_values(array_unique(array_merge($toEmails, $ccEmails)));

            return response()->json([
                'message' => 'Fixture notification email sent successfully.',
                'email_sent' => true,
                'emailSent' => true,
                'email_sent_at' => optional($fixture?->fresh()?->email_sent_at)?->toISOString(),
                'emailSentAt' => optional($fixture?->fresh()?->email_sent_at)?->toISOString(),
                'to' => $toEmails,
                'cc' => $ccEmails,
                'recipients' => $allRecipients,
            ]);
        } finally {
            $lock->release();
        }
    }

    private function formatFixture(Fixture $f): array
    {
        $dateStr = '';
        if ($f->date) {
            SessionTimingHelper::applyClubTimezone();
            $parsed = SessionTimingHelper::parseDateTime($f->date);
            $dateStr = $parsed->format('Y-m-d\TH:i:s');
        }

        $status = $this->normalizeStatus($f->status);

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
            'clubLocation' => $f->club_location,
            'club_location' => $f->club_location,
            'homeCaptainEmail' => $f->home_captain_email,
            'home_captain_email' => $f->home_captain_email,
            'oppositionCaptainEmail' => $f->opposition_captain_email,
            'opposition_captain_email' => $f->opposition_captain_email,
            'emailSent' => (bool)$f->email_sent,
            'email_sent' => (bool)$f->email_sent,
            'emailSentAt' => optional($f->email_sent_at)?->toISOString(),
            'email_sent_at' => optional($f->email_sent_at)?->toISOString(),
            'grade' => $f->grade,
            'status' => $status,
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
