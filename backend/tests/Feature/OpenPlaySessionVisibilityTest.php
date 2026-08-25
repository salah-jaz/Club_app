<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Member;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\User;
use App\Services\InvitationSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OpenPlaySessionVisibilityTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Member $adultMember;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        \App\Models\Location::firstOrCreate(['name' => 'Main Hall']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_open_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'OpenTest',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_open@test.com',
                'mobile' => '+1234567891',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $user = User::firstOrCreate(
            ['id' => 'u_member_open_test'],
            [
                'first_name' => 'Member',
                'last_name' => 'OpenTest',
                'sex' => 'male',
                'dob' => '1992-02-02',
                'email' => 'member_open@test.com',
                'mobile' => '+1234567892',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->adultMember = Member::firstOrCreate(
            ['id' => 'm_adult_open_test'],
            [
                'user_id' => $user->id,
                'member_type' => 'adult',
                'status' => 'active',
                'membership' => true,
                'credit' => 100,
                'first_name' => 'Member',
                'last_name' => 'OpenTest',
                'email' => 'member_open@test.com',
                'sex' => 'male',
                'dob' => '1992-02-02',
                'grade' => 'Grade A',
            ]
        );
    }

    public function test_open_play_schedule_does_not_generate_or_expose_invitations_before_release(): void
    {
        // 1. Create an Open Play Schedule (status = 'open')
        $schedule = PlaySchedule::create([
            'id' => 's_test_unreleased',
            'name' => 'Unreleased Play Session',
            'date' => now()->addDays(2),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hrs',
            'session_rate' => 10,
            'hall_rate' => 0,
            'location' => 'Main Hall',
            'status' => 'open',
            'is_league_match' => false,
        ]);

        // 2. Trigger auto synchronization for member
        InvitationSyncService::syncMemberInvitations($this->adultMember);

        // 3. Assert NO invitations exist for this open schedule
        $this->assertDatabaseMissing('play_invitations', [
            'schedule_id' => $schedule->id,
        ]);

        // 4. Query invitations API endpoint and verify open schedule invites are excluded
        $response = $this->actingAs($this->admin)->getJson('/api/play-invitations');
        $response->assertStatus(200);
        $scheduleInvites = collect($response->json())->where('scheduleId', $schedule->id);
        $this->assertEmpty($scheduleInvites);

        // 5. Release the schedule
        $releaseRes = $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release");
        $releaseRes->assertStatus(200);

        // 6. Assert invitation IS now created and schedule status is 'released'
        $this->assertDatabaseHas('play_schedules', [
            'id' => $schedule->id,
            'status' => 'released',
        ]);
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember->id,
        ]);
    }
}
