<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Member;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\Rotation;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PlayScheduleClubMembershipEligibilityTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $user;
    protected Member $adultMember;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Grade::firstOrCreate(['name' => 'Beginner'], ['type' => 'junior']);
        \App\Models\Location::firstOrCreate(['name' => 'Main Court']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_elig_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1985-01-01',
                'email' => 'admin_elig@test.com',
                'mobile' => '+1111111111',
                'address' => 'Admin Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->user = User::firstOrCreate(
            ['id' => 'u_member_elig_test'],
            [
                'first_name' => 'John',
                'last_name' => 'Parent',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'parent_elig@test.com',
                'mobile' => '+2222222222',
                'address' => 'Member Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );
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
            'status' => 'open',
            'is_league_match' => false,
        ], $overrides));
    }

    /**
     * Test Case 1: Adult with Club Membership ON -> receives and accesses eligible Play Sessions.
     */
    public function test_1_adult_with_membership_on_receives_and_accesses_eligible_play_sessions(): void
    {
        $adult = Member::create([
            'id' => 'm_adult_on',
            'user_id' => $this->user->id,
            'first_name' => 'Adult',
            'last_name' => 'Eligible',
            'email' => 'adult.on@test.com',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 50.0,
            'grade' => 'Grade A',
        ]);

        $schedule = $this->createSchedule();
        $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release")->assertStatus(200);

        // 1. Receives invitation
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $adult->id,
            'status' => 'open',
        ]);

        // 2. Accesses schedule and invitations via API
        $schedRes = $this->actingAs($this->user)->getJson('/api/schedules')->assertStatus(200);
        $this->assertNotEmpty(collect($schedRes->json())->where('id', $schedule->id));

        $invRes = $this->actingAs($this->user)->getJson('/api/play-invitations')->assertStatus(200);
        $invite = collect($invRes->json())->firstWhere('memberId', $adult->id);
        $this->assertNotNull($invite);

        // 3. Can accept invitation
        $respRes = $this->actingAs($this->user)->postJson("/api/play-invitations/{$invite['id']}/respond", [
            'status' => 'accepted',
        ]);
        $respRes->assertStatus(200);
        $this->assertEquals('accepted', $respRes->json('status'));
        $this->assertEquals(35.0, $adult->fresh()->credit); // 50 - 15 = 35
    }

    /**
     * Test Case 2: Adult with Club Membership OFF -> receives no invitation and sees no session card/details.
     */
    public function test_2_adult_with_membership_off_receives_no_invitation_and_sees_no_session_card(): void
    {
        $adult = Member::create([
            'id' => 'm_adult_off',
            'user_id' => $this->user->id,
            'first_name' => 'Adult',
            'last_name' => 'Ineligible',
            'email' => 'adult.off@test.com',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'member_type' => 'adult',
            'membership' => false,
            'status' => 'active',
            'credit' => 50.0,
            'grade' => 'Grade A',
        ]);

        $schedule = $this->createSchedule();
        $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release")->assertStatus(200);

        // 1. Receives NO invitation
        $this->assertDatabaseMissing('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $adult->id,
        ]);

        // 2. Sees NO session card/details
        $schedRes = $this->actingAs($this->user)->getJson('/api/schedules')->assertStatus(200);
        $this->assertEmpty($schedRes->json());

        // 3. Sees NO invitations
        $invRes = $this->actingAs($this->user)->getJson('/api/play-invitations')->assertStatus(200);
        $this->assertEmpty($invRes->json());
    }

    /**
     * Test Case 3: Junior with Club Membership ON -> receives and accesses eligible Play Sessions.
     */
    public function test_3_junior_with_membership_on_receives_and_accesses_eligible_play_sessions(): void
    {
        $parent = Member::create([
            'id' => 'm_parent_3',
            'user_id' => $this->user->id,
            'first_name' => 'Parent',
            'last_name' => 'Head',
            'email' => 'parent3@test.com',
            'sex' => 'male',
            'dob' => '1985-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $junior = Member::create([
            'id' => 'm_junior_on',
            'user_id' => $this->user->id,
            'parent_member_id' => $parent->id,
            'first_name' => 'Junior',
            'last_name' => 'Eligible',
            'email' => 'junior.on@test.com',
            'sex' => 'female',
            'dob' => '2015-05-05',
            'member_type' => 'junior',
            'membership' => true,
            'play_eligible' => true,
            'status' => 'active',
            'credit' => 0.0,
            'grade' => 'Beginner',
        ]);

        $schedule = $this->createSchedule();
        $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release")->assertStatus(200);

        // Junior receives invitation
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $junior->id,
            'status' => 'open',
        ]);

        // Can accept for junior
        $invite = PlayInvitation::where('schedule_id', $schedule->id)->where('member_id', $junior->id)->first();
        $respRes = $this->actingAs($this->user)->postJson("/api/play-invitations/{$invite->id}/respond", [
            'status' => 'accepted',
        ]);
        $respRes->assertStatus(200);
        $this->assertEquals('accepted', $respRes->json('status'));
        $this->assertEquals(85.0, $parent->fresh()->credit); // 100 - 15 = 85
    }

    /**
     * Test Case 4: Junior with Club Membership OFF -> receives no invitation and cannot accept.
     */
    public function test_4_junior_with_membership_off_receives_no_invitation_and_cannot_accept(): void
    {
        $parent = Member::create([
            'id' => 'm_parent_4',
            'user_id' => $this->user->id,
            'first_name' => 'Parent',
            'last_name' => 'Head',
            'email' => 'parent4@test.com',
            'sex' => 'male',
            'dob' => '1985-01-01',
            'member_type' => 'adult',
            'membership' => false,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $junior = Member::create([
            'id' => 'm_junior_off',
            'user_id' => $this->user->id,
            'parent_member_id' => $parent->id,
            'first_name' => 'Junior',
            'last_name' => 'Ineligible',
            'email' => 'junior.off@test.com',
            'sex' => 'female',
            'dob' => '2015-05-05',
            'member_type' => 'junior',
            'membership' => false,
            'play_eligible' => true,
            'status' => 'active',
            'credit' => 0.0,
            'grade' => 'Beginner',
        ]);

        $schedule = $this->createSchedule();
        $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release")->assertStatus(200);

        // Receives NO invitation
        $this->assertDatabaseMissing('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $junior->id,
        ]);

        // Attempting to enroll junior via API is rejected
        $enrollRes = $this->actingAs($this->user)->postJson("/api/schedules/{$schedule->id}/enroll", [
            'memberIds' => [$junior->id],
        ]);
        $enrollRes->assertStatus(422);
    }

    /**
     * Test Case 5: Attempt acceptance through the API with Club Membership OFF -> rejected without wallet debit or transaction creation.
     */
    public function test_5_attempt_acceptance_through_api_with_club_membership_off_rejected(): void
    {
        $adult = Member::create([
            'id' => 'm_adult_api_reject',
            'user_id' => $this->user->id,
            'first_name' => 'Direct',
            'last_name' => 'Tester',
            'email' => 'direct.tester@test.com',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'member_type' => 'adult',
            'membership' => false,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $schedule = $this->createSchedule();

        // Suppose an invite row existed (or was injected)
        $invite = PlayInvitation::create([
            'id' => 'pi_test_5',
            'schedule_id' => $schedule->id,
            'member_id' => $adult->id,
            'status' => 'open',
        ]);

        $initialTxnCount = Transaction::where('member_id', $adult->id)->count();

        // Attempt acceptance through direct API
        $response = $this->actingAs($this->user)->postJson("/api/play-invitations/{$invite->id}/respond", [
            'status' => 'accepted',
        ]);

        $response->assertStatus(422);
        $this->assertEquals('Member is not eligible for this play session.', $response->json('message'));

        // Assert NO wallet debit and NO transaction created
        $this->assertEquals(100.0, $adult->fresh()->credit);
        $this->assertEquals($initialTxnCount, Transaction::where('member_id', $adult->id)->count());
        $this->assertEquals('open', $invite->fresh()->status);
    }

    /**
     * Test Case 6: Club Membership OFF -> auto-acceptance and waiting-list promotion must not bypass eligibility.
     */
    public function test_6_club_membership_off_auto_accept_and_waiting_promotion_blocked(): void
    {
        $eligibleAdult = Member::create([
            'id' => 'm_adult_wait_el',
            'user_id' => $this->admin->id,
            'first_name' => 'Accepted',
            'last_name' => 'Player',
            'email' => 'acc.player@test.com',
            'sex' => 'male',
            'dob' => '1988-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $ineligibleJunior = Member::create([
            'id' => 'm_junior_wait_inel',
            'user_id' => $this->user->id,
            'first_name' => 'WaitJunior',
            'last_name' => 'Ineligible',
            'email' => 'wait.junior@test.com',
            'sex' => 'female',
            'dob' => '2015-01-01',
            'member_type' => 'junior',
            'membership' => false,
            'play_eligible' => true,
            'status' => 'active',
            'credit' => 50.0,
            'grade' => 'Beginner',
        ]);

        // Capacity = 1, released
        $schedule = $this->createSchedule(['players' => 1, 'status' => 'released']);

        $accInvite = PlayInvitation::create([
            'id' => 'pi_acc_1',
            'schedule_id' => $schedule->id,
            'member_id' => $eligibleAdult->id,
            'status' => 'accepted',
            'accepted_at' => now(),
            'debited' => true,
        ]);

        $waitInvite = PlayInvitation::create([
            'id' => 'pi_wait_2',
            'schedule_id' => $schedule->id,
            'member_id' => $ineligibleJunior->id,
            'status' => 'waiting',
        ]);

        // 1. Test auto-accept enrollment block
        $enrollRes = $this->actingAs($this->user)->postJson("/api/schedules/{$schedule->id}/enroll", [
            'memberIds' => [$ineligibleJunior->id],
            'autoAccept' => true,
        ]);
        $enrollRes->assertStatus(422);

        // 2. Test waiting list promotion when accepted player declines
        // Eligible player declines -> free slot opens
        $declineRes = $this->actingAs($this->admin)->postJson("/api/play-invitations/{$accInvite->id}/respond", [
            'status' => 'declined',
        ]);
        $declineRes->assertStatus(200);

        // The ineligible junior must NOT be promoted to accepted or debited
        $this->assertDatabaseMissing('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $ineligibleJunior->id,
            'status' => 'accepted',
        ]);
        $this->assertEquals(50.0, $ineligibleJunior->fresh()->credit);
    }

    /**
     * Test Case 7: Club Membership turned OFF after an invitation exists -> acceptance and restricted session access are blocked without deleting historical financial records.
     */
    public function test_7_club_membership_turned_off_after_invitation_exists(): void
    {
        $adult = Member::create([
            'id' => 'm_adult_toggle_off',
            'user_id' => $this->user->id,
            'first_name' => 'Toggle',
            'last_name' => 'Member',
            'email' => 'toggle@test.com',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $historicalTxn = Transaction::create([
            'id' => 't_hist_record_1',
            'member_id' => $adult->id,
            'type' => 'deposit',
            'amount' => 100.0,
            'description' => 'Historical deposit',
            'date' => now()->subDays(5),
        ]);

        $schedule = $this->createSchedule(['status' => 'released']);

        $invite = PlayInvitation::create([
            'id' => 'pi_existing_open',
            'schedule_id' => $schedule->id,
            'member_id' => $adult->id,
            'status' => 'open',
        ]);

        // Publish a rotation
        Rotation::create([
            'id' => 'rot_' . Str::random(8),
            'schedule_id' => $schedule->id,
            'rounds' => [],
            'published' => true,
        ]);
        $schedule->update(['status' => 'published']);

        // Turn Club Membership OFF
        $adult->update(['membership' => false]);

        // 1. Acceptance is blocked
        $acceptRes = $this->actingAs($this->user)->postJson("/api/play-invitations/{$invite->id}/respond", [
            'status' => 'accepted',
        ]);
        $acceptRes->assertStatus(422);

        // 2. Restricted court rotation access is blocked
        $rotRes = $this->actingAs($this->user)->getJson('/api/rotations')->assertStatus(200);
        $this->assertEmpty($rotRes->json());

        // 3. Historical financial record is NOT deleted
        $this->assertDatabaseHas('transactions', [
            'id' => $historicalTxn->id,
            'member_id' => $adult->id,
            'amount' => 100.0,
        ]);
    }

    /**
     * Test Case 8: Verify eligible family members continue working normally when another family member is ineligible.
     */
    public function test_8_eligible_family_members_continue_working_normally(): void
    {
        $eligibleAdult = Member::create([
            'id' => 'm_fam_adult_el',
            'user_id' => $this->user->id,
            'first_name' => 'Eligible',
            'last_name' => 'Dad',
            'email' => 'dad@test.com',
            'sex' => 'male',
            'dob' => '1985-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'grade' => 'Grade A',
        ]);

        $ineligibleJunior = Member::create([
            'id' => 'm_fam_junior_inel',
            'user_id' => $this->user->id,
            'parent_member_id' => $eligibleAdult->id,
            'first_name' => 'Ineligible',
            'last_name' => 'Child',
            'email' => 'child.inel@test.com',
            'sex' => 'female',
            'dob' => '2016-01-01',
            'member_type' => 'junior',
            'membership' => false,
            'play_eligible' => true,
            'status' => 'active',
            'credit' => 0.0,
            'grade' => 'Beginner',
        ]);

        $eligibleJunior = Member::create([
            'id' => 'm_fam_junior_el',
            'user_id' => $this->user->id,
            'parent_member_id' => $eligibleAdult->id,
            'first_name' => 'Eligible',
            'last_name' => 'Child',
            'email' => 'child.el@test.com',
            'sex' => 'male',
            'dob' => '2014-01-01',
            'member_type' => 'junior',
            'membership' => true,
            'play_eligible' => true,
            'status' => 'active',
            'credit' => 0.0,
            'grade' => 'Beginner',
        ]);

        $schedule = $this->createSchedule();
        $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release")->assertStatus(200);

        // 1. Eligible members receive invitations
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $eligibleAdult->id,
            'status' => 'open',
        ]);
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $eligibleJunior->id,
            'status' => 'open',
        ]);

        // 2. Ineligible member receives NO invitation
        $this->assertDatabaseMissing('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $ineligibleJunior->id,
        ]);

        // 3. User can see invitations only for eligible members
        $invRes = $this->actingAs($this->user)->getJson('/api/play-invitations')->assertStatus(200);
        $memberIdsInInvites = collect($invRes->json())->pluck('memberId')->all();
        $this->assertContains($eligibleAdult->id, $memberIdsInInvites);
        $this->assertContains($eligibleJunior->id, $memberIdsInInvites);
        $this->assertNotContains($ineligibleJunior->id, $memberIdsInInvites);

        // 4. Eligible adult accepts successfully
        $adultInvite = collect($invRes->json())->firstWhere('memberId', $eligibleAdult->id);
        $this->actingAs($this->user)->postJson("/api/play-invitations/{$adultInvite['id']}/respond", [
            'status' => 'accepted',
        ])->assertStatus(200);

        // 5. Eligible junior accepts successfully
        $juniorInvite = collect($invRes->json())->firstWhere('memberId', $eligibleJunior->id);
        $this->actingAs($this->user)->postJson("/api/play-invitations/{$juniorInvite['id']}/respond", [
            'status' => 'accepted',
        ])->assertStatus(200);

        // Wallet was debited for both (100 - 15 - 15 = 70)
        $this->assertEquals(70.0, $eligibleAdult->fresh()->credit);
    }
}
