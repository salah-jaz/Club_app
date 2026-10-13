<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Member;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class MemberDashboardUpcomingPlaySessionsTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $user;
    protected Member $adultMember;
    protected Member $juniorMember;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Grade::firstOrCreate(['name' => 'Junior Grade'], ['type' => 'junior']);
        \App\Models\Location::firstOrCreate(['name' => 'Main Court']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_dash_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1985-01-01',
                'email' => 'admin_dash@test.com',
                'mobile' => '+1111111111',
                'address' => 'Admin Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->user = User::firstOrCreate(
            ['id' => 'u_parent_dash_test'],
            [
                'first_name' => 'John',
                'last_name' => 'Family',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'parent_dash@test.com',
                'mobile' => '+2222222222',
                'address' => 'Family Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->adultMember = Member::create([
            'id' => 'm_adult_' . Str::random(6),
            'user_id' => $this->user->id,
            'first_name' => 'John',
            'last_name' => 'Family',
            'email' => 'parent_dash@test.com',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $this->juniorMember = Member::create([
            'id' => 'm_junior_' . Str::random(6),
            'user_id' => $this->user->id,
            'parent_member_id' => $this->adultMember->id,
            'first_name' => 'Jane',
            'last_name' => 'Family',
            'email' => 'jane_dash@test.com',
            'sex' => 'female',
            'dob' => '2015-01-01',
            'member_type' => 'junior',
            'membership' => true,
            'status' => 'active',
            'play_eligible' => true,
            'credit' => 100.0,
            'grade' => 'Junior Grade',
        ]);
    }

    private function createSchedule(array $overrides = []): PlaySchedule
    {
        return PlaySchedule::create(array_merge([
            'id' => 's_' . Str::random(8),
            'name' => 'Open Social Play',
            'date' => now()->addDays(2)->format('Y-m-d H:i:s'),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hrs',
            'session_rate' => 15,
            'hall_rate' => 0,
            'location' => 'Main Court',
            'status' => 'released',
            'is_league_match' => false,
        ], $overrides));
    }

    /**
     * Scenario 1: Adult Accepted + Junior Yet To Accept -> Show.
     */
    public function test_scenario_1_adult_accepted_junior_yet_to_accept_shows_on_dashboard(): void
    {
        $schedule = $this->createSchedule(['name' => 'Test Schedule 1']);

        PlayInvitation::create([
            'id' => 'pi_1_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);

        PlayInvitation::create([
            'id' => 'pi_2_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'open',
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/schedules/upcoming-play-sessions')->assertStatus(200);
        $schedules = $res->json();

        $this->assertCount(1, $schedules);
        $this->assertEquals($schedule->id, $schedules[0]['id']);

        $familyStatuses = collect($schedules[0]['familyStatuses'])->keyBy('memberId');
        $this->assertEquals('accepted', $familyStatuses[$this->adultMember->id]['status']);
        $this->assertEquals('open', $familyStatuses[$this->juniorMember->id]['status']);
    }

    /**
     * Scenario 2: Adult Waiting List + Junior Yet To Accept -> Show.
     */
    public function test_scenario_2_adult_waiting_list_junior_yet_to_accept_shows_on_dashboard(): void
    {
        $schedule = $this->createSchedule(['name' => 'Test Schedule 2']);

        PlayInvitation::create([
            'id' => 'pi_1_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember->id,
            'status' => 'waiting',
        ]);

        PlayInvitation::create([
            'id' => 'pi_2_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'open',
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/schedules/upcoming-play-sessions')->assertStatus(200);
        $schedules = $res->json();

        $this->assertCount(1, $schedules);
        $this->assertEquals($schedule->id, $schedules[0]['id']);

        $familyStatuses = collect($schedules[0]['familyStatuses'])->keyBy('memberId');
        $this->assertEquals('waiting', $familyStatuses[$this->adultMember->id]['status']);
        $this->assertEquals('open', $familyStatuses[$this->juniorMember->id]['status']);
    }

    /**
     * Scenario 3: Adult Yet To Accept + Junior Yet To Accept -> Hide.
     */
    public function test_scenario_3_both_yet_to_accept_hides_from_dashboard(): void
    {
        $schedule = $this->createSchedule(['name' => 'Test Schedule 3']);

        PlayInvitation::create([
            'id' => 'pi_1_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember->id,
            'status' => 'open',
        ]);

        PlayInvitation::create([
            'id' => 'pi_2_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'open',
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/schedules/upcoming-play-sessions')->assertStatus(200);
        $schedules = $res->json();

        $this->assertCount(0, $schedules);
    }

    /**
     * Scenario 4: Adult Declined + Junior Waiting List -> Show.
     */
    public function test_scenario_4_adult_declined_junior_waiting_list_shows_on_dashboard(): void
    {
        $schedule = $this->createSchedule(['name' => 'Test Schedule 4']);

        PlayInvitation::create([
            'id' => 'pi_1_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember->id,
            'status' => 'declined',
        ]);

        PlayInvitation::create([
            'id' => 'pi_2_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'waiting',
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/schedules/upcoming-play-sessions')->assertStatus(200);
        $schedules = $res->json();

        $this->assertCount(1, $schedules);
        $this->assertEquals($schedule->id, $schedules[0]['id']);

        $familyStatuses = collect($schedules[0]['familyStatuses'])->keyBy('memberId');
        $this->assertEquals('declined', $familyStatuses[$this->adultMember->id]['status']);
        $this->assertEquals('waiting', $familyStatuses[$this->juniorMember->id]['status']);
    }

    /**
     * Scenario 5: Both Declined -> Hide.
     */
    public function test_scenario_5_both_declined_hides_from_dashboard(): void
    {
        $schedule = $this->createSchedule(['name' => 'Test Schedule 5']);

        PlayInvitation::create([
            'id' => 'pi_1_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember->id,
            'status' => 'declined',
        ]);

        PlayInvitation::create([
            'id' => 'pi_2_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'declined',
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/schedules/upcoming-play-sessions')->assertStatus(200);
        $schedules = $res->json();

        $this->assertCount(0, $schedules);
    }

    /**
     * Scenario 6: Cancelled, Closed, Finished, or past schedule -> Hide.
     */
    public function test_scenario_6_cancelled_closed_finished_past_schedules_hidden(): void
    {
        // 6a: Cancelled schedule
        $cancelledSchedule = $this->createSchedule([
            'status' => 'cancelled',
            'date' => now()->addDays(2)->format('Y-m-d H:i:s'),
        ]);
        PlayInvitation::create([
            'id' => 'pi_c_' . Str::random(6),
            'schedule_id' => $cancelledSchedule->id,
            'member_id' => $this->adultMember->id,
            'status' => 'accepted',
        ]);

        // 6b: Closed schedule
        $closedSchedule = $this->createSchedule([
            'status' => 'closed',
            'date' => now()->addDays(2)->format('Y-m-d H:i:s'),
        ]);
        PlayInvitation::create([
            'id' => 'pi_cl_' . Str::random(6),
            'schedule_id' => $closedSchedule->id,
            'member_id' => $this->adultMember->id,
            'status' => 'accepted',
        ]);

        // 6c: Past schedule
        $pastSchedule = $this->createSchedule([
            'status' => 'released',
            'date' => now()->subDays(2)->format('Y-m-d H:i:s'),
        ]);
        PlayInvitation::create([
            'id' => 'pi_p_' . Str::random(6),
            'schedule_id' => $pastSchedule->id,
            'member_id' => $this->adultMember->id,
            'status' => 'accepted',
        ]);

        // 6d: Unreleased open schedule
        $openSchedule = $this->createSchedule([
            'status' => 'open',
            'date' => now()->addDays(2)->format('Y-m-d H:i:s'),
        ]);
        PlayInvitation::create([
            'id' => 'pi_o_' . Str::random(6),
            'schedule_id' => $openSchedule->id,
            'member_id' => $this->adultMember->id,
            'status' => 'accepted',
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/schedules/upcoming-play-sessions')->assertStatus(200);
        $schedules = $res->json();

        $this->assertCount(0, $schedules);
    }

    /**
     * Scenario 7: Multiple qualifying family members for one schedule -> Display the schedule only once, with their correct individual statuses.
     */
    public function test_scenario_7_multiple_qualifying_family_members_displays_schedule_only_once(): void
    {
        $schedule = $this->createSchedule(['name' => 'Multi Qualifying Schedule']);

        PlayInvitation::create([
            'id' => 'pi_1_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);

        PlayInvitation::create([
            'id' => 'pi_2_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'waiting',
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/schedules/upcoming-play-sessions')->assertStatus(200);
        $schedules = $res->json();

        // Must display schedule EXACTLY ONCE
        $this->assertCount(1, $schedules);
        $this->assertEquals($schedule->id, $schedules[0]['id']);

        // Must display correct individual statuses for each member
        $familyStatuses = collect($schedules[0]['familyStatuses'])->keyBy('memberId');
        $this->assertCount(2, $familyStatuses);
        $this->assertEquals('accepted', $familyStatuses[$this->adultMember->id]['status']);
        $this->assertEquals('waiting', $familyStatuses[$this->juniorMember->id]['status']);
    }

    /**
     * Scenario 8: Do not expose unrelated members' private invitation information.
     */
    public function test_scenario_8_does_not_expose_unrelated_members_invitations(): void
    {
        $otherUser = User::create([
            'id' => 'u_other_' . Str::random(6),
            'first_name' => 'Other',
            'last_name' => 'Person',
            'sex' => 'male',
            'dob' => '1988-01-01',
            'email' => 'other_' . Str::random(4) . '@test.com',
            'mobile' => '+3333333333',
            'address' => 'Other Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $otherMember = Member::create([
            'id' => 'm_other_' . Str::random(6),
            'user_id' => $otherUser->id,
            'first_name' => 'Stranger',
            'last_name' => 'Danger',
            'email' => 'stranger@test.com',
            'sex' => 'male',
            'dob' => '1988-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $schedule = $this->createSchedule(['name' => 'Shared Schedule']);

        PlayInvitation::create([
            'id' => 'pi_user_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);

        PlayInvitation::create([
            'id' => 'pi_other_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'member_id' => $otherMember->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/schedules/upcoming-play-sessions')->assertStatus(200);
        $schedules = $res->json();

        $this->assertCount(1, $schedules);
        $memberIdsInResponse = collect($schedules[0]['familyStatuses'])->pluck('memberId')->all();

        $this->assertContains($this->adultMember->id, $memberIdsInResponse);
        $this->assertNotContains($otherMember->id, $memberIdsInResponse);
    }
}
