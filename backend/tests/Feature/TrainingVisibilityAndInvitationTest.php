<?php

namespace Tests\Feature;

use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\TrainingDate;
use App\Models\User;
use App\Models\Member;
use App\Models\Location;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrainingVisibilityAndInvitationTest extends TestCase
{
    use RefreshDatabase;

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
            'startDate' => '2026-11-01 10:00:00',
            'endDate' => '2026-11-01 11:00:00',
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
            'startDate' => '2026-11-01 10:00:00',
            'endDate' => '2026-11-01 11:00:00',
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

        // Admin selects ONLY Nov 1 and Nov 8 and sends
        $res1 = $this->actingAs($this->admin)->postJson("/api/trainings/{$jul1->id}/release", [
            'memberIds' => [$this->juniorMember->id],
        ]);
        $res1->assertStatus(200);

        $res2 = $this->actingAs($this->admin)->postJson("/api/trainings/{$jul8->id}/release", [
            'memberIds' => [$this->juniorMember->id],
        ]);
        $res2->assertStatus(200);

        // Verify invitations exist ONLY for Nov 1 and Nov 8
        $this->assertTrue(TrainingInvitation::where('training_id', $jul1->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertTrue(TrainingInvitation::where('training_id', $jul8->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertFalse(TrainingInvitation::where('training_id', $jul15->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertFalse(TrainingInvitation::where('training_id', $jul22->id)->where('member_id', $this->juniorMember->id)->exists());

        // Verify dates exist ONLY for Nov 1 and Nov 8
        $this->assertTrue(TrainingDate::where('training_id', $jul1->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertTrue(TrainingDate::where('training_id', $jul8->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertFalse(TrainingDate::where('training_id', $jul15->id)->where('member_id', $this->juniorMember->id)->exists());
        $this->assertFalse(TrainingDate::where('training_id', $jul22->id)->where('member_id', $this->juniorMember->id)->exists());
    }

    public function test_update_member_invitation_persists_selected_weeks_and_prevents_restoring_unselected_weeks()
    {
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Monthly Pro Training',
            'startDate' => '2026-12-01 10:00:00',
            'endDate' => '2026-12-01 11:00:00',
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

    public function test_member_training_visibility_flow_create_uninvited_member_cannot_see_invited_member_can_see(): void
    {
        // Set up Member User A and Junior A
        $userA = User::create([
            'id' => 'u_member_a_vis',
            'first_name' => 'Alice',
            'last_name' => 'Parent',
            'sex' => 'female',
            'dob' => '1990-01-01',
            'email' => 'alice@test.com',
            'mobile' => '+1234567895',
            'address' => 'Test Address A',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);
        $memberA = Member::create([
            'id' => 'm_child_a_vis',
            'user_id' => $userA->id,
            'first_name' => 'Child',
            'last_name' => 'Alice',
            'sex' => 'female',
            'dob' => '2016-01-01',
            'email' => 'child_a@test.com',
            'mobile' => '+1234567895',
            'address' => 'Test Address A',
            'member_type' => 'junior',
            'grade' => 'Grade A',
            'training_eligible' => true,
            'status' => 'active',
        ]);

        // Set up Member User B and Junior B
        $userB = User::create([
            'id' => 'u_member_b_vis',
            'first_name' => 'Bob',
            'last_name' => 'Parent',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'bob@test.com',
            'mobile' => '+1234567896',
            'address' => 'Test Address B',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);
        $memberB = Member::create([
            'id' => 'm_child_b_vis',
            'user_id' => $userB->id,
            'first_name' => 'Child',
            'last_name' => 'Bob',
            'sex' => 'male',
            'dob' => '2016-01-01',
            'email' => 'child_b@test.com',
            'mobile' => '+1234567896',
            'address' => 'Test Address B',
            'member_type' => 'junior',
            'grade' => 'Grade A',
            'training_eligible' => true,
            'status' => 'active',
        ]);

        // 1. Admin creates a training program
        $createRes = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Elite Camp',
            'startDate' => '2027-01-01 10:00:00',
            'endDate' => '2027-01-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);
        $createRes->assertStatus(201);
        $trainingId = $createRes->json('id');
        $parentId = $createRes->json('parentId');

        // 2. No member invitation has been sent yet -> Neither Member A nor Member B should see it
        // Check GET /api/trainings for Member A
        $trainingsA = $this->actingAs($userA)->getJson('/api/trainings');
        $trainingsA->assertStatus(200);
        $this->assertEmpty(collect($trainingsA->json())->where('name', 'Junior Elite Camp'));

        // Check GET /api/training-invitations for Member A
        $invitesA = $this->actingAs($userA)->getJson('/api/training-invitations');
        $invitesA->assertStatus(200);
        $this->assertEmpty(collect($invitesA->json())->where('trainingId', $trainingId));

        // Check GET /api/sync-data for Member A
        $syncA = $this->actingAs($userA)->getJson('/api/sync-data');
        $syncA->assertStatus(200);
        $this->assertEmpty(collect($syncA->json('trainings'))->where('name', 'Junior Elite Camp'));
        $this->assertEmpty(collect($syncA->json('trainingInvites'))->where('trainingId', $trainingId));

        // Check GET /api/trainings and sync for Member B
        $trainingsB = $this->actingAs($userB)->getJson('/api/trainings');
        $trainingsB->assertStatus(200);
        $this->assertEmpty(collect($trainingsB->json())->where('name', 'Junior Elite Camp'));

        $syncB = $this->actingAs($userB)->getJson('/api/sync-data');
        $syncB->assertStatus(200);
        $this->assertEmpty(collect($syncB->json('trainings'))->where('name', 'Junior Elite Camp'));

        // 3. Admin sends invitation to Member A (for 2 weekly sessions)
        $allCampSessions = Training::where('parent_id', $parentId)->orderBy('start_date', 'asc')->get();
        $selectedSessions = [$allCampSessions[0]->id, $allCampSessions[1]->id];

        $inviteRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/update-member-invitation", [
            'memberId' => $memberA->id,
            'sessionIds' => $selectedSessions,
        ]);
        $inviteRes->assertStatus(200);

        // 4. Member A can NOW see the training and their invitations
        // Check GET /api/trainings for Member A
        $trainingsAAfter = $this->actingAs($userA)->getJson('/api/trainings');
        $trainingsAAfter->assertStatus(200);
        $this->assertNotEmpty(collect($trainingsAAfter->json())->where('name', 'Junior Elite Camp'));

        // Check GET /api/training-invitations for Member A
        $invitesAAfter = $this->actingAs($userA)->getJson('/api/training-invitations');
        $invitesAAfter->assertStatus(200);
        $campInvitesA = collect($invitesAAfter->json())->where('memberId', $memberA->id);
        $this->assertCount(2, $campInvitesA);
        $this->assertTrue($campInvitesA->every(fn($i) => $i['status'] === 'open'));

        // Check GET /api/sync-data for Member A
        $syncAAfter = $this->actingAs($userA)->getJson('/api/sync-data');
        $syncAAfter->assertStatus(200);
        $this->assertNotEmpty(collect($syncAAfter->json('trainings'))->where('name', 'Junior Elite Camp'));
        $this->assertCount(2, collect($syncAAfter->json('trainingInvites'))->where('memberId', $memberA->id));

        // 5. Non-invited Member B still CANNOT see the training or any invitations
        $trainingsBAfter = $this->actingAs($userB)->getJson('/api/trainings');
        $trainingsBAfter->assertStatus(200);
        $this->assertEmpty(collect($trainingsBAfter->json())->where('name', 'Junior Elite Camp'));

        $invitesBAfter = $this->actingAs($userB)->getJson('/api/training-invitations');
        $invitesBAfter->assertStatus(200);
        $this->assertEmpty(collect($invitesBAfter->json())->where('memberId', $memberB->id));

        $syncBAfter = $this->actingAs($userB)->getJson('/api/sync-data');
        $syncBAfter->assertStatus(200);
        $this->assertEmpty(collect($syncBAfter->json('trainings'))->where('name', 'Junior Elite Camp'));
        $this->assertEmpty(collect($syncBAfter->json('trainingInvites'))->where('memberId', $memberB->id));
    }
}
