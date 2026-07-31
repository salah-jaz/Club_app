<?php

namespace Tests\Feature;

use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\TrainingDate;
use App\Models\User;
use App\Models\Member;
use App\Models\Location;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class TrainingVisibilityAndInvitationTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;
    protected Member $juniorMember;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        $grade = \App\Models\Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'junior']);
        Training::query()->delete();

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_vis_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_vis@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->juniorMember = Member::firstOrCreate(
            ['id' => 'm_junior_vis_test'],
            [
                'user_id' => $this->admin->id,
                'first_name' => 'Child',
                'last_name' => 'One',
                'sex' => 'male',
                'dob' => '2015-01-01',
                'email' => 'child@test.com',
                'mobile' => '+1234567891',
                'address' => 'Test Address',
                'member_type' => 'junior',
                'grade' => $grade->name,
                'credit' => 100.0,
                'training_eligible' => true,
                'status' => 'active',
            ]
        );
    }

    public function test_newly_created_training_program_is_admin_only_with_no_invitations()
    {
        $response = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Summer Junior Camp',
            'startDate' => '2026-07-01 10:00:00',
            'endDate' => '2026-07-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $response->assertStatus(201);
        $this->assertEquals('created', $response->json('status'));

        // Ensure 0 invitations and 0 dates created at program creation time
        $allTrainings = Training::orderBy('start_date', 'asc')->get();
        $this->assertCount(4, $allTrainings);

        $invitationCount = TrainingInvitation::whereIn('training_id', $allTrainings->pluck('id'))->count();
        $dateCount = TrainingDate::whereIn('training_id', $allTrainings->pluck('id'))->count();

        $this->assertEquals(0, $invitationCount);
        $this->assertEquals(0, $dateCount);
    }

    public function test_sending_invitations_only_creates_invitations_and_dates_for_selected_weeks()
    {
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Summer Junior Camp',
            'startDate' => '2026-07-01 10:00:00',
            'endDate' => '2026-07-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $sessions = Training::orderBy('start_date', 'asc')->get();
        $jul1 = $sessions[0];
        $jul8 = $sessions[1];
        $jul15 = $sessions[2];
        $jul22 = $sessions[3];

        // Admin selects ONLY Jul 1 and Jul 8 and sends
        $res1 = $this->actingAs($this->admin)->postJson("/api/trainings/{$jul1->id}/release", [
            'memberIds' => [$this->juniorMember->id],
        ]);
        $res1->assertStatus(200);

        $res2 = $this->actingAs($this->admin)->postJson("/api/trainings/{$jul8->id}/release", [
            'memberIds' => [$this->juniorMember->id],
        ]);
        $res2->assertStatus(200);

        // Verify invitations exist ONLY for Jul 1 and Jul 8
        $this->assertTrue(TrainingInvitation::where('training_id', $jul1->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertTrue(TrainingInvitation::where('training_id', $jul8->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertFalse(TrainingInvitation::where('training_id', $jul15->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertFalse(TrainingInvitation::where('training_id', $jul22->id)->where('member_id', $this->juniorMember->id)->exists());

        // Verify dates exist ONLY for Jul 1 and Jul 8
        $this->assertTrue(TrainingDate::where('training_id', $jul1->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertTrue(TrainingDate::where('training_id', $jul8->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertFalse(TrainingDate::where('training_id', $jul15->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertFalse(TrainingDate::where('training_id', $jul22->id)->where('member_id', $this->juniorMember->id)->exists());
    }

    public function test_update_member_invitation_persists_selected_weeks_and_prevents_restoring_unselected_weeks()
    {
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Monthly Pro Training',
            'startDate' => '2026-08-01 10:00:00',
            'endDate' => '2026-08-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $sessions = Training::orderBy('start_date', 'asc')->get();
        $this->assertCount(4, $sessions);

        // Member initially has 4 pending invitations created by auto-sync
        \App\Services\InvitationSyncService::syncAllTrainingInvitations();
        $this->assertEquals(4, TrainingInvitation::where('member_id', $this->juniorMember->id)->count());

        // Admin selects ONLY 3 weeks (Jul 1, Jul 8, Jul 15) and sends invitation
        $threeSessionIds = [$sessions[0]->id, $sessions[1]->id, $sessions[2]->id];
        $unselectedId = $sessions[3]->id;

        $res = $this->actingAs($this->admin)->postJson("/api/trainings/{$sessions[0]->id}/update-member-invitation", [
            'memberId' => $this->juniorMember->id,
            'sessionIds' => $threeSessionIds,
        ]);
        $res->assertStatus(200);

        // Verify ONLY 3 invitations exist now (open status)
        $this->assertEquals(3, TrainingInvitation::where('member_id', $this->juniorMember->id)->count());
        $this->assertFalse(TrainingInvitation::where('training_id', $unselectedId)->where('member_id', $this->juniorMember->id)->exists());

        // Simulate page refresh / sync by calling GET /api/training-invitations
        $listRes = $this->actingAs($this->admin)->getJson('/api/training-invitations');
        $listRes->assertStatus(200);

        // Verify auto-sync DOES NOT restore the 4th week
        $this->assertEquals(3, TrainingInvitation::where('member_id', $this->juniorMember->id)->count());
        $this->assertFalse(TrainingInvitation::where('training_id', $unselectedId)->where('member_id', $this->juniorMember->id)->exists());
    }
}
