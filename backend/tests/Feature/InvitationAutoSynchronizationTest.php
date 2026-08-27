<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Member;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\User;
use App\Models\Location;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvitationAutoSynchronizationTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Member $parentMember;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Beginner'], ['type' => 'junior']);
        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Location::firstOrCreate(['name' => 'Court 1']);

        PlaySchedule::query()->delete();
        Training::query()->delete();

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_sync_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'SyncTest',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_sync@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->parentMember = Member::firstOrCreate(
            ['id' => 'm_parent_sync_test'],
            [
                'user_id' => $this->admin->id,
                'first_name' => 'Parent',
                'last_name' => 'Member',
                'dob' => '1985-05-05',
                'email' => 'parent_sync@test.com',
                'sex' => 'male',
                'member_type' => 'adult',
                'membership' => true,
                'status' => 'active',
                'credit' => 100.00,
                'grade' => 'Grade A',
            ]
        );
    }

    /** Scenario 1: Junior play_eligible toggled from OFF -> ON automatically creates PlayInvitation in Yet to Accept ('open'). */
    public function test_scenario_1_play_eligibility_changed_creates_invitation()
    {
        // 1. Create a PlaySchedule and release it
        $schedule = PlaySchedule::create([
            'id' => 's_sync_test_1',
            'name' => 'Saturday Play',
            'date' => '2026-08-01 10:00:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hours',
            'session_rate' => 20,
            'hall_rate' => 100,
            'location' => 'Court 1',
            'status' => 'released',
            'is_league_match' => false,
        ]);

        // 2. Create Junior with play_eligible = OFF
        $junior = Member::create([
            'id' => 'm_kaja_muja',
            'user_id' => $this->admin->id,
            'parent_member_id' => $this->parentMember->id,
            'first_name' => 'Kaja',
            'last_name' => 'Muja',
            'dob' => '2015-01-01',
            'email' => 'kaja@test.com',
            'sex' => 'female',
            'member_type' => 'junior',
            'membership' => false,
            'training_eligible' => false,
            'play_eligible' => false,
            'status' => 'active',
            'credit' => 0.00,
            'grade' => 'Beginner',
        ]);

        // Initially, no invitation should exist for Kaja Muja
        $this->assertDatabaseMissing('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $junior->id,
        ]);

        // 3. Admin edits Kaja Muja -> play_eligible = ON
        $updateRes = $this->actingAs($this->admin)->patchJson("/api/members/{$junior->id}", [
            'playEligible' => true,
        ]);
        $updateRes->assertStatus(200);

        // 4. Verify invitation is automatically created with status 'open' (Yet to Accept)
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $junior->id,
            'status' => 'open',
        ]);
    }

    /** Scenario 2: Creating a new adult member automatically creates invitations for active Play Schedules. */
    public function test_scenario_2_new_adult_member_added_creates_invitations()
    {
        $schedule = PlaySchedule::create([
            'id' => 's_sync_test_2',
            'name' => 'Sunday Social',
            'date' => '2026-08-02 10:00:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hours',
            'session_rate' => 20,
            'hall_rate' => 100,
            'location' => 'Court 1',
            'status' => 'released',
            'is_league_match' => false,
        ]);

        // Admin creates a new adult member with membership = true
        $res = $this->actingAs($this->admin)->postJson('/api/members', [
            'firstName' => 'John',
            'lastName' => 'Doe',
            'dob' => '1992-03-03',
            'email' => 'john.doe@test.com',
            'sex' => 'male',
            'memberType' => 'adult',
            'membership' => true,
            'status' => 'active',
            'grade' => 'Grade A',
            'userId' => $this->admin->id,
        ]);
        $res->assertStatus(201);
        $newMemberId = $res->json('id');

        // Verify invitation automatically created
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $newMemberId,
            'status' => 'open',
        ]);
    }

    /** Scenario 3: Creating a new junior member with play_eligible = true automatically creates invitations. */
    public function test_scenario_3_new_junior_member_added_creates_invitations()
    {
        $schedule = PlaySchedule::create([
            'id' => 's_sync_test_3',
            'name' => 'Open Play',
            'date' => '2026-08-03 10:00:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hours',
            'session_rate' => 20,
            'hall_rate' => 100,
            'location' => 'Court 1',
            'status' => 'released',
            'is_league_match' => false,
        ]);

        $res = $this->actingAs($this->admin)->postJson('/api/members', [
            'firstName' => 'Little',
            'lastName' => 'Tim',
            'dob' => '2016-04-04',
            'email' => 'tim@test.com',
            'sex' => 'male',
            'memberType' => 'junior',
            'membership' => false,
            'playEligible' => true,
            'status' => 'active',
            'grade' => 'Beginner',
            'parentMemberId' => $this->parentMember->id,
        ]);
        $res->assertStatus(201);
        $newJuniorId = $res->json('id');

        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $newJuniorId,
            'status' => 'open',
        ]);
    }

    /** Scenario 4: Training Programs invitation auto-synchronization when training_eligible changes OFF -> ON. */
    public function test_scenario_4_training_program_eligibility_changed()
    {
        $training = Training::create([
            'id' => 'tr_sync_test_4',
            'name' => 'Junior Academy',
            'start_date' => '2026-08-05 10:00:00',
            'end_date' => '2026-08-05 11:00:00',
            'repeat_weeks' => 1,
            'repeat_months' => 1,
            'sessions' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 50,
            'coach' => 'Coach Smith',
            'location' => 'Court 1',
            'status' => 'released',
            'target_type' => 'junior',
        ]);

        $junior = Member::create([
            'id' => 'm_junior_training_sync',
            'user_id' => $this->admin->id,
            'parent_member_id' => $this->parentMember->id,
            'first_name' => 'Sam',
            'last_name' => 'Junior',
            'dob' => '2014-02-02',
            'email' => 'sam@test.com',
            'sex' => 'male',
            'member_type' => 'junior',
            'membership' => false,
            'training_eligible' => false,
            'play_eligible' => false,
            'status' => 'active',
            'credit' => 0.00,
            'grade' => 'Beginner',
        ]);

        $this->assertDatabaseMissing('training_invitations', [
            'training_id' => $training->id,
            'member_id' => $junior->id,
        ]);

        // Enable training_eligible = true
        $updateRes = $this->actingAs($this->admin)->patchJson("/api/members/{$junior->id}", [
            'trainingEligible' => true,
        ]);
        $updateRes->assertStatus(200);

        // Verify training invitation automatically created
        $this->assertDatabaseHas('training_invitations', [
            'training_id' => $training->id,
            'member_id' => $junior->id,
            'status' => 'pending',
        ]);
    }

    /** Verify closed/cancelled schedules are NOT affected by auto-sync. */
    public function test_closed_or_cancelled_schedules_not_affected()
    {
        $closedSchedule = PlaySchedule::create([
            'id' => 's_closed_test',
            'name' => 'Closed Play',
            'date' => '2026-08-10 10:00:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hours',
            'session_rate' => 20,
            'hall_rate' => 100,
            'location' => 'Court 1',
            'status' => 'closed',
            'is_league_match' => false,
        ]);

        $junior = Member::create([
            'id' => 'm_junior_closed_test',
            'user_id' => $this->admin->id,
            'parent_member_id' => $this->parentMember->id,
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'dob' => '2015-05-05',
            'email' => 'jane@test.com',
            'sex' => 'female',
            'member_type' => 'junior',
            'membership' => false,
            'play_eligible' => false,
            'status' => 'active',
            'credit' => 0.00,
            'grade' => 'Beginner',
        ]);

        // Enable play_eligible
        $this->actingAs($this->admin)->patchJson("/api/members/{$junior->id}", [
            'playEligible' => true,
        ]);

        // Verify NO invitation created for closed schedule
        $this->assertDatabaseMissing('play_invitations', [
            'schedule_id' => $closedSchedule->id,
            'member_id' => $junior->id,
        ]);
    }

    /** Verify no duplicate invitations are created if an invitation already exists. */
    public function test_no_duplicate_invitations_created()
    {
        $schedule = PlaySchedule::create([
            'id' => 's_dup_test',
            'name' => 'Dup Test Play',
            'date' => '2026-08-15 10:00:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hours',
            'session_rate' => 20,
            'hall_rate' => 100,
            'location' => 'Court 1',
            'status' => 'released',
            'is_league_match' => false,
        ]);

        $junior = Member::create([
            'id' => 'm_junior_dup_test',
            'user_id' => $this->admin->id,
            'parent_member_id' => $this->parentMember->id,
            'first_name' => 'Dup',
            'last_name' => 'Check',
            'dob' => '2015-06-06',
            'email' => 'dup@test.com',
            'sex' => 'male',
            'member_type' => 'junior',
            'membership' => false,
            'play_eligible' => true,
            'status' => 'active',
            'credit' => 0.00,
            'grade' => 'Beginner',
        ]);

        // Primary invitation created on Member creation
        $count1 = PlayInvitation::where('schedule_id', $schedule->id)->where('member_id', $junior->id)->count();
        $this->assertEquals(1, $count1);

        // Save member again to trigger saved event
        $junior->update(['nickname' => 'Speedy']);

        // Count should still be 1 (no duplicates)
        $count2 = PlayInvitation::where('schedule_id', $schedule->id)->where('member_id', $junior->id)->count();
        $this->assertEquals(1, $count2);
    }

    /** Scenario 2a: Disabling Play Eligibility removes open (Yet to Accept) invitations. */
    public function test_disable_play_eligibility_removes_open_invitation()
    {
        $schedule = PlaySchedule::create([
            'id' => 's_disable_open_test',
            'name' => 'Weekly Play',
            'date' => '2026-08-20 10:00:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hours',
            'session_rate' => 20,
            'hall_rate' => 100,
            'location' => 'Court 1',
            'status' => 'released',
            'is_league_match' => false,
        ]);

        $junior = Member::create([
            'id' => 'm_junior_disable_open',
            'user_id' => $this->admin->id,
            'parent_member_id' => $this->parentMember->id,
            'first_name' => 'Alex',
            'last_name' => 'Muja',
            'dob' => '2015-02-02',
            'email' => 'alex@test.com',
            'sex' => 'male',
            'member_type' => 'junior',
            'membership' => false,
            'play_eligible' => true,
            'status' => 'active',
            'credit' => 50.00,
            'grade' => 'Beginner',
        ]);

        // Invitation exists initially
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $junior->id,
            'status' => 'open',
        ]);

        // Disable play_eligible -> OFF
        $this->actingAs($this->admin)->patchJson("/api/members/{$junior->id}", [
            'playEligible' => false,
        ])->assertStatus(200);

        // Invitation removed completely
        $this->assertDatabaseMissing('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $junior->id,
        ]);
    }

    /** Scenario 2b: Disabling Play Eligibility for accepted member refunds fee and promotes next waiting member. */
    public function test_disable_play_eligibility_cancels_accepted_invitation_refunds_and_promotes_waiting()
    {
        $schedule = PlaySchedule::create([
            'id' => 's_disable_acc_test',
            'name' => 'Competitive Play',
            'date' => '2026-08-22 10:00:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hours',
            'session_rate' => 20,
            'hall_rate' => 100,
            'location' => 'Court 1',
            'status' => 'released',
            'is_league_match' => false,
        ]);

        $juniorAcc = Member::create([
            'id' => 'm_junior_accepted',
            'user_id' => $this->admin->id,
            'parent_member_id' => $this->parentMember->id,
            'first_name' => 'Accepted',
            'last_name' => 'Player',
            'dob' => '2015-03-03',
            'email' => 'accepted@test.com',
            'sex' => 'female',
            'member_type' => 'junior',
            'membership' => false,
            'play_eligible' => true,
            'status' => 'active',
            'credit' => 0.00,
            'grade' => 'Beginner',
        ]);

        $juniorWait = Member::create([
            'id' => 'm_junior_waiting',
            'user_id' => $this->admin->id,
            'parent_member_id' => $this->parentMember->id,
            'first_name' => 'Waiting',
            'last_name' => 'Player',
            'dob' => '2015-04-04',
            'email' => 'waiting@test.com',
            'sex' => 'male',
            'member_type' => 'junior',
            'membership' => false,
            'play_eligible' => true,
            'status' => 'active',
            'credit' => 0.00,
            'grade' => 'Beginner',
        ]);

        // Set juniorAcc status to accepted & debited ($20 fee)
        $accInvite = PlayInvitation::where('schedule_id', $schedule->id)->where('member_id', $juniorAcc->id)->first();
        $accInvite->update([
            'status' => 'accepted',
            'accepted_at' => now(),
            'debited' => true,
        ]);
        // Parent wallet was debited $20 session fee (100 - 20 = 80)
        $this->parentMember->update(['credit' => 80.00]);

        // Set juniorWait status to waiting
        $waitInvite = PlayInvitation::where('schedule_id', $schedule->id)->where('member_id', $juniorWait->id)->first();
        $waitInvite->update(['status' => 'waiting']);

        // Disable play_eligible for juniorAcc
        $this->actingAs($this->admin)->patchJson("/api/members/{$juniorAcc->id}", [
            'playEligible' => false,
        ])->assertStatus(200);

        // 1. juniorAcc invitation deleted
        $this->assertDatabaseMissing('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $juniorAcc->id,
        ]);

        // 2. Parent wallet refunded $20, then waiting player promoted and debited $20 (net: stays 80)
        $this->parentMember->refresh();
        $this->assertEquals(80.00, $this->parentMember->credit);
        $juniorAcc->refresh();
        $this->assertEquals(0.00, $juniorAcc->credit);

        // 3. Refund transaction logged on parent wallet
        $this->assertDatabaseHas('transactions', [
            'member_id' => $this->parentMember->id,
            'type' => 'refund',
            'amount' => 20.00,
            'description' => 'Refund — cancelled play session: Competitive Play - ' . $juniorAcc->name,
        ]);

        // 4. Waiting player promoted to accepted
        $waitInvite->refresh();
        $this->assertEquals('accepted', $waitInvite->status);
        $this->assertTrue($waitInvite->debited);
    }

    /** Scenario 2c: Disabling Training Eligibility removes pending invitations. */
    public function test_disable_training_eligibility_removes_pending_invitation()
    {
        $training = Training::create([
            'id' => 'tr_dis_pend',
            'name' => 'Summer Camp',
            'start_date' => '2026-08-25 10:00:00',
            'end_date' => '2026-08-25 11:00:00',
            'repeat_weeks' => 1,
            'repeat_months' => 1,
            'sessions' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 60,
            'coach' => 'Coach Dave',
            'location' => 'Court 1',
            'status' => 'released',
            'target_type' => 'junior',
        ]);

        $junior = Member::create([
            'id' => 'm_junior_tr_pend',
            'user_id' => $this->admin->id,
            'parent_member_id' => $this->parentMember->id,
            'first_name' => 'Pend',
            'last_name' => 'Tr',
            'dob' => '2015-05-05',
            'email' => 'pendtr@test.com',
            'sex' => 'male',
            'member_type' => 'junior',
            'membership' => false,
            'training_eligible' => true,
            'play_eligible' => false,
            'status' => 'active',
            'credit' => 50.00,
            'grade' => 'Beginner',
        ]);

        $this->assertDatabaseHas('training_invitations', [
            'training_id' => $training->id,
            'member_id' => $junior->id,
            'status' => 'pending',
        ]);

        // Disable training_eligible
        $this->actingAs($this->admin)->patchJson("/api/members/{$junior->id}", [
            'trainingEligible' => false,
        ])->assertStatus(200);

        // Invitation removed
        $this->assertDatabaseMissing('training_invitations', [
            'training_id' => $training->id,
            'member_id' => $junior->id,
        ]);
    }

    /** Scenario 2d: Disabling Training Eligibility for accepted enrollment cancels, refunds remaining fee, and deletes future attendance. */
    public function test_disable_training_eligibility_cancels_accepted_enrollment_refunds_and_deletes_future_attendance()
    {
        $training = Training::create([
            'id' => 'tr_dis_acc',
            'name' => 'Elite Training',
            'start_date' => '2026-08-30 10:00:00',
            'end_date' => '2026-08-30 11:00:00',
            'repeat_weeks' => 1,
            'repeat_months' => 1,
            'sessions' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 80,
            'coach' => 'Coach Dave',
            'location' => 'Court 1',
            'status' => 'released',
            'target_type' => 'junior',
        ]);

        $junior = Member::create([
            'id' => 'm_junior_tr_acc',
            'user_id' => $this->admin->id,
            'parent_member_id' => $this->parentMember->id,
            'first_name' => 'Acc',
            'last_name' => 'Tr',
            'dob' => '2015-06-06',
            'email' => 'acctr@test.com',
            'sex' => 'female',
            'member_type' => 'junior',
            'membership' => false,
            'training_eligible' => true,
            'play_eligible' => false,
            'status' => 'active',
            'credit' => 0.00,
            'grade' => 'Beginner',
        ]);

        // Parent wallet balance after $80 training debit (100 - 80 = 20)
        $this->parentMember->update(['credit' => 20.00]);

        // Create accepted invitation
        TrainingInvitation::where('training_id', $training->id)->where('member_id', $junior->id)->update([
            'status' => 'accepted',
        ]);

        // Record debit transaction on parent wallet for initial enrollment
        \App\Models\Transaction::create([
            'id' => 't_tr_debit_init',
            'member_id' => $this->parentMember->id,
            'type' => 'debit',
            'amount' => 80.00,
            'description' => 'Training session: Elite Training',
            'date' => now(),
        ]);

        // Future attendance date
        \App\Models\TrainingDate::create([
            'id' => 'td_future_1',
            'training_id' => $training->id,
            'member_id' => $junior->id,
            'date' => '2026-08-30 10:00:00',
            'attended' => false,
        ]);

        // Disable training_eligible
        $this->actingAs($this->admin)->patchJson("/api/members/{$junior->id}", [
            'trainingEligible' => false,
        ])->assertStatus(200);

        // 1. Training invitation removed
        $this->assertDatabaseMissing('training_invitations', [
            'training_id' => $training->id,
            'member_id' => $junior->id,
        ]);

        // 2. $80 credit refunded to parent wallet (20 + 80 = 100); junior stays at 0
        $this->parentMember->refresh();
        $this->assertEquals(100.00, $this->parentMember->credit);
        $junior->refresh();
        $this->assertEquals(0.00, $junior->credit);

        // 3. Refund transaction created on parent wallet
        $this->assertDatabaseHas('transactions', [
            'member_id' => $this->parentMember->id,
            'type' => 'refund',
            'amount' => 80.00,
            'description' => 'Refund — cancelled training session for Acc Tr: Elite Training',
        ]);

        // 4. Future attendance record deleted
        $this->assertDatabaseMissing('training_dates', [
            'id' => 'td_future_1',
        ]);
    }
}

