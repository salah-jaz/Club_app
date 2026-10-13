<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Location;
use App\Models\Member;
use App\Models\PlayInvitation;
use App\Models\PlaySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class GroupPlayScheduleVisibilityTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $userL1Member1;
    protected User $userL1Member2;
    protected User $userOutside;
    protected User $userL2Member;
    protected User $userBothGroups;

    protected Member $memberL1A;
    protected Member $memberL1B;
    protected Member $memberOutside;
    protected Member $memberL2;
    protected Member $memberBoth;

    protected LeagueGroup $groupL1;
    protected LeagueGroup $groupL2;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Location::firstOrCreate(['name' => 'Center Court']);
        \App\Models\PlayerPosition::firstOrCreate(['name' => 'Captain']);
        \App\Models\PlayerPosition::firstOrCreate(['name' => 'Player']);
        \App\Models\PlayerPosition::firstOrCreate(['name' => 'DualPlayer']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_grp_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'Leader',
                'sex' => 'male',
                'dob' => '1985-01-01',
                'email' => 'admin_grp@test.com',
                'mobile' => '+1000000000',
                'address' => 'Admin Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->userL1Member1 = User::create([
            'id' => 'u_l1_m1',
            'first_name' => 'Alice',
            'last_name' => 'L1',
            'sex' => 'female',
            'dob' => '1990-01-01',
            'email' => 'alice@test.com',
            'mobile' => '+1000000001',
            'address' => 'L1 Address 1',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->userL1Member2 = User::create([
            'id' => 'u_l1_m2',
            'first_name' => 'Bob',
            'last_name' => 'L1',
            'sex' => 'male',
            'dob' => '1991-01-01',
            'email' => 'bob@test.com',
            'mobile' => '+1000000002',
            'address' => 'L1 Address 2',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->userOutside = User::create([
            'id' => 'u_outside',
            'first_name' => 'Charlie',
            'last_name' => 'Outside',
            'sex' => 'male',
            'dob' => '1992-01-01',
            'email' => 'charlie@test.com',
            'mobile' => '+1000000003',
            'address' => 'Outside Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->userL2Member = User::create([
            'id' => 'u_l2_m',
            'first_name' => 'David',
            'last_name' => 'L2',
            'sex' => 'male',
            'dob' => '1993-01-01',
            'email' => 'david@test.com',
            'mobile' => '+1000000004',
            'address' => 'L2 Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->userBothGroups = User::create([
            'id' => 'u_both',
            'first_name' => 'Eva',
            'last_name' => 'Both',
            'sex' => 'female',
            'dob' => '1994-01-01',
            'email' => 'eva@test.com',
            'mobile' => '+1000000005',
            'address' => 'Both Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->memberL1A = Member::create([
            'id' => 'm_l1_a',
            'user_id' => $this->userL1Member1->id,
            'first_name' => 'Alice',
            'last_name' => 'L1',
            'email' => 'alice@test.com',
            'sex' => 'female',
            'dob' => '1990-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $this->memberL1B = Member::create([
            'id' => 'm_l1_b',
            'user_id' => $this->userL1Member2->id,
            'first_name' => 'Bob',
            'last_name' => 'L1',
            'email' => 'bob@test.com',
            'sex' => 'male',
            'dob' => '1991-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $this->memberOutside = Member::create([
            'id' => 'm_outside',
            'user_id' => $this->userOutside->id,
            'first_name' => 'Charlie',
            'last_name' => 'Outside',
            'email' => 'charlie@test.com',
            'sex' => 'male',
            'dob' => '1992-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $this->memberL2 = Member::create([
            'id' => 'm_l2',
            'user_id' => $this->userL2Member->id,
            'first_name' => 'David',
            'last_name' => 'L2',
            'email' => 'david@test.com',
            'sex' => 'male',
            'dob' => '1993-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $this->memberBoth = Member::create([
            'id' => 'm_both',
            'user_id' => $this->userBothGroups->id,
            'first_name' => 'Eva',
            'last_name' => 'Both',
            'email' => 'eva@test.com',
            'sex' => 'female',
            'dob' => '1994-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $this->groupL1 = LeagueGroup::create([
            'id' => 'lg_l1',
            'name' => 'L1',
            'description' => 'Level 1 Group',
            'group_type' => 'Adult',
        ]);
        $this->groupL1->members()->sync([
            $this->memberL1A->id => ['position' => 'Captain'],
            $this->memberL1B->id => ['position' => 'Player'],
        ]);

        $this->groupL2 = LeagueGroup::create([
            'id' => 'lg_l2',
            'name' => 'L2',
            'description' => 'Level 2 Group',
            'group_type' => 'Adult',
        ]);
        $this->groupL2->members()->sync([
            $this->memberL2->id => ['position' => 'Player'],
        ]);
    }

    private function createGroupSchedule(array $groupIds, array $overrides = []): PlaySchedule
    {
        return PlaySchedule::create(array_merge([
            'id' => 's_' . Str::random(8),
            'name' => 'Group Match Session',
            'date' => now()->addDays(2)->format('Y-m-d H:i:s'),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hrs',
            'session_rate' => 15,
            'hall_rate' => 0,
            'location' => 'Center Court',
            'status' => 'open',
            'is_league_match' => true,
            'league_group_ids' => $groupIds,
        ], $overrides));
    }

    /**
     * Test Case 1 & 2: Create group L1 with 2 members, release Play Schedule using L1,
     * and verify both eligible L1 members can see the schedule.
     */
    public function test_1_and_2_both_eligible_l1_members_can_see_schedule(): void
    {
        $schedule = $this->createGroupSchedule([$this->groupL1->id]);

        $releaseRes = $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release");
        $releaseRes->assertStatus(200);

        // Verify member 1 of L1 sees the schedule
        $res1 = $this->actingAs($this->userL1Member1)->getJson('/api/schedules');
        $res1->assertStatus(200);
        $schedules1 = collect($res1->json());
        $this->assertTrue($schedules1->contains('id', $schedule->id));

        // Verify member 2 of L1 sees the schedule
        $res2 = $this->actingAs($this->userL1Member2)->getJson('/api/schedules');
        $res2->assertStatus(200);
        $schedules2 = collect($res2->json());
        $this->assertTrue($schedules2->contains('id', $schedule->id));
    }

    /**
     * Test Case 3: Verify a member outside L1 cannot see the schedule card or any related details.
     */
    public function test_3_member_outside_l1_cannot_see_schedule(): void
    {
        $schedule = $this->createGroupSchedule([$this->groupL1->id]);
        $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release")->assertStatus(200);

        // Non-group member calls /api/schedules
        $res = $this->actingAs($this->userOutside)->getJson('/api/schedules');
        $res->assertStatus(200);
        $schedules = collect($res->json());

        // The restricted schedule is completely absent
        $this->assertFalse($schedules->contains('id', $schedule->id));
    }

    /**
     * Test Case 4: Verify the "No eligible members for this session" card does not appear for non-group members.
     * The schedule is not returned in schedules API or sync API for non-group members.
     */
    public function test_4_no_session_card_or_empty_eligible_state_for_non_group_members(): void
    {
        $schedule = $this->createGroupSchedule([$this->groupL1->id]);
        $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release")->assertStatus(200);

        // Call sync API (used by member portal)
        $syncRes = $this->actingAs($this->userOutside)->getJson('/api/sync-data');
        $syncRes->assertStatus(200);

        $schedules = collect($syncRes->json('schedules'));
        $this->assertFalse($schedules->contains('id', $schedule->id));
    }

    /**
     * Test Case 5: Verify direct API requests from non-group members cannot retrieve restricted schedule or player details.
     */
    public function test_5_direct_api_requests_from_non_group_members_are_blocked(): void
    {
        $schedule = $this->createGroupSchedule([$this->groupL1->id]);
        $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release")->assertStatus(200);

        // 1. Direct GET /api/schedules/{id} returns 403 Forbidden
        $schedDetailRes = $this->actingAs($this->userOutside)->getJson("/api/schedules/{$schedule->id}");
        $schedDetailRes->assertStatus(403);

        // 2. Direct GET /api/schedules/{id}/players returns 403 Forbidden
        $playerDetailRes = $this->actingAs($this->userOutside)->getJson("/api/schedules/{$schedule->id}/players");
        $playerDetailRes->assertStatus(403);

        // 3. GET /api/play-invitations must NOT expose invitations of restricted schedule to non-group members
        $invRes = $this->actingAs($this->userOutside)->getJson('/api/play-invitations');
        $invRes->assertStatus(200);
        $invScheduleIds = collect($invRes->json())->pluck('scheduleId')->all();
        $this->assertNotContains($schedule->id, $invScheduleIds);

        // 4. Direct POST /api/schedules/{id}/enroll by non-group member is rejected with 422
        $enrollRes = $this->actingAs($this->userOutside)->postJson("/api/schedules/{$schedule->id}/enroll", [
            'memberIds' => [$this->memberOutside->id],
        ]);
        $enrollRes->assertStatus(422);
    }

    /**
     * Test Case 6: Select multiple groups and verify members from those groups can see the schedule,
     * without duplicate cards or invitations for a member belonging to multiple selected groups.
     */
    public function test_6_multiple_groups_visibility_and_no_duplicate_invitations(): void
    {
        // Add memberBoth to both group L1 and group L2
        $this->groupL1->members()->syncWithoutDetaching([
            $this->memberBoth->id => ['position' => 'DualPlayer'],
        ]);
        $this->groupL2->members()->syncWithoutDetaching([
            $this->memberBoth->id => ['position' => 'DualPlayer'],
        ]);

        $schedule = $this->createGroupSchedule([$this->groupL1->id, $this->groupL2->id]);
        $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release")->assertStatus(200);

        // L1 member can see schedule
        $resL1 = $this->actingAs($this->userL1Member1)->getJson('/api/schedules');
        $this->assertTrue(collect($resL1->json())->contains('id', $schedule->id));

        // L2 member can see schedule
        $resL2 = $this->actingAs($this->userL2Member)->getJson('/api/schedules');
        $this->assertTrue(collect($resL2->json())->contains('id', $schedule->id));

        // Member in both groups can see schedule
        $resBoth = $this->actingAs($this->userBothGroups)->getJson('/api/schedules');
        $matching = collect($resBoth->json())->where('id', $schedule->id);
        $this->assertCount(1, $matching, 'Member in multiple groups must receive exactly 1 schedule card');

        // Member in both groups must receive exactly 1 invitation record in the database
        $bothInvites = PlayInvitation::where('schedule_id', $schedule->id)
            ->where('member_id', $this->memberBoth->id)
            ->get();
        $this->assertCount(1, $bothInvites, 'Member in multiple groups must receive exactly 1 invitation');

        // Non-group member still cannot see schedule
        $resOutside = $this->actingAs($this->userOutside)->getJson('/api/schedules');
        $this->assertFalse(collect($resOutside->json())->contains('id', $schedule->id));
    }

    /**
     * Test Case 7: Verify non-group Play Schedules retain their existing behavior.
     */
    public function test_7_non_group_play_schedules_retain_existing_behavior(): void
    {
        $nonGroupSchedule = PlaySchedule::create([
            'id' => 's_open_social_test',
            'name' => 'Open Social All Members',
            'date' => now()->addDays(3)->format('Y-m-d H:i:s'),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hrs',
            'session_rate' => 15,
            'hall_rate' => 0,
            'location' => 'Center Court',
            'status' => 'open',
            'is_league_match' => false,
            'league_group_ids' => [],
        ]);

        $this->actingAs($this->admin)->postJson("/api/schedules/{$nonGroupSchedule->id}/release")->assertStatus(200);

        // All active club members receive invitations and see the schedule
        $resOutside = $this->actingAs($this->userOutside)->getJson('/api/schedules');
        $this->assertTrue(collect($resOutside->json())->contains('id', $nonGroupSchedule->id));

        $resL1 = $this->actingAs($this->userL1Member1)->getJson('/api/schedules');
        $this->assertTrue(collect($resL1->json())->contains('id', $nonGroupSchedule->id));

        // Invitations exist for both
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $nonGroupSchedule->id,
            'member_id' => $this->memberOutside->id,
        ]);
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $nonGroupSchedule->id,
            'member_id' => $this->memberL1A->id,
        ]);
    }
}
