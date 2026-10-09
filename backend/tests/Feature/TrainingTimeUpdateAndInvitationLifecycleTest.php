<?php

namespace Tests\Feature;

use App\Helpers\MailHelper;
use App\Helpers\SessionTimingHelper;
use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Location;
use App\Models\Member;
use App\Models\Training;
use App\Models\TrainingDate;
use App\Models\TrainingInvitation;
use App\Models\TrainingUpdateRequest;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

class TrainingTimeUpdateAndInvitationLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $parentUser;
    protected User $adultUser;
    protected Member $juniorMember;
    protected Member $adultMember;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        $grade = Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'junior']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_lifecycle'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_lifecycle@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->parentUser = User::firstOrCreate(
            ['id' => 'u_parent_lifecycle'],
            [
                'first_name' => 'Parent',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1985-05-15',
                'email' => 'parent_lifecycle@test.com',
                'mobile' => '+1234567891',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->juniorMember = Member::firstOrCreate(
            ['id' => 'm_junior_lifecycle'],
            [
                'user_id' => $this->parentUser->id,
                'first_name' => 'Junior',
                'last_name' => 'Player',
                'sex' => 'male',
                'dob' => '2015-06-01',
                'email' => 'junior_lifecycle@test.com',
                'mobile' => '+1234567892',
                'address' => 'Test Address',
                'member_type' => 'junior',
                'grade' => $grade->name,
                'training_eligible' => true,
                'credit' => 500.0,
                'status' => 'active',
            ]
        );

        $this->adultUser = User::firstOrCreate(
            ['id' => 'u_adult_lifecycle'],
            [
                'first_name' => 'Adult',
                'last_name' => 'Player',
                'sex' => 'female',
                'dob' => '1992-03-20',
                'email' => 'adult_lifecycle@test.com',
                'mobile' => '+1234567893',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->adultMember = Member::firstOrCreate(
            ['id' => 'm_adult_lifecycle'],
            [
                'user_id' => $this->adultUser->id,
                'first_name' => 'Adult',
                'last_name' => 'Player',
                'sex' => 'female',
                'dob' => '1992-03-20',
                'email' => 'adult_lifecycle@test.com',
                'mobile' => '+1234567893',
                'address' => 'Test Address',
                'member_type' => 'adult',
                'grade' => $grade->name,
                'training_eligible' => true,
                'credit' => 500.0,
                'status' => 'active',
            ]
        );
    }

    /**
     * Exact reproduction scenario from user request:
     * 1. Create a Junior Training: Oct 8, 2026 · 12:20 PM, 3 weeks.
     * 2. Send invitations.
     * 3. Member accepts at 12:21 PM (time passed for Oct 8 session).
     * 4. Verify Oct 8 = Not Included and remaining 2 sessions are accepted.
     * 5. Change training time to 1:20 PM.
     * 6. Save.
     * 7. Verify NO invitation is automatically sent/recreated.
     * 8. Verify Oct 8 remains Not Included for that member.
     * 9. Verify no email is sent.
     * 10. Verify no duplicate invitation exists.
     * 11. Click "Send Update".
     * 12. Verify invitation update happens ONLY now.
     */
    public function test_exact_reproduction_time_update_does_not_reopen_skipped_session(): void
    {
        Mail::fake();

        // Step 1: Current time is 11:00 AM on Oct 8, 2026.
        Carbon::setTestNow(Carbon::parse('2026-10-08 11:00:00', SessionTimingHelper::clubTimezone()));

        $createRes = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Academy Training',
            'startDate' => '2026-10-08 12:20:00',
            'endDate' => '2026-10-22',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 90.0,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);
        $createRes->assertStatus(201);
        $parentId = $createRes->json('id');

        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();
        $this->assertCount(3, $sessions);

        $oct8Session = $sessions[0];
        $oct15Session = $sessions[1];
        $oct22Session = $sessions[2];

        $this->assertEquals('2026-10-08 12:20:00', $oct8Session->start_date);
        $this->assertEquals('2026-10-15 12:20:00', $oct15Session->start_date);
        $this->assertEquals('2026-10-22 12:20:00', $oct22Session->start_date);

        // Step 2: Admin sends invitations to junior member for all 3 sessions
        $sendRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$oct8Session->id}/update-member-invitation", [
            'memberId' => $this->juniorMember->id,
            'sessionIds' => [$oct8Session->id, $oct15Session->id, $oct22Session->id],
        ]);
        $sendRes->assertStatus(200);

        $oct8Invite = TrainingInvitation::where('training_id', $oct8Session->id)->where('member_id', $this->juniorMember->id)->firstOrFail();
        $oct15Invite = TrainingInvitation::where('training_id', $oct15Session->id)->where('member_id', $this->juniorMember->id)->firstOrFail();
        $oct22Invite = TrainingInvitation::where('training_id', $oct22Session->id)->where('member_id', $this->juniorMember->id)->firstOrFail();

        $this->assertEquals('open', $oct8Invite->status);
        $this->assertEquals('open', $oct15Invite->status);
        $this->assertEquals('open', $oct22Invite->status);

        // Step 3: Advance time to 12:21 PM on Oct 8 (Oct 8 session is now in-progress / start time reached)
        Carbon::setTestNow(Carbon::parse('2026-10-08 12:21:00', SessionTimingHelper::clubTimezone()));

        // Attempting to accept Oct 8 session is blocked (422)
        $failAccept = $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$oct8Invite->id],
            'status' => 'accepted',
        ]);
        $failAccept->assertStatus(422);

        // Member accepts remaining 2 sessions (Oct 15 and Oct 22)
        $acceptRes = $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$oct15Invite->id, $oct22Invite->id],
            'status' => 'accepted',
        ]);
        $acceptRes->assertStatus(200);

        // Step 4: Verify Oct 8 is Not Included, and remaining 2 sessions are accepted
        $oct15Invite->refresh();
        $oct22Invite->refresh();
        $this->assertEquals('accepted', $oct15Invite->status);
        $this->assertEquals('accepted', $oct22Invite->status);

        // Fee: 90 / 3 * 2 = 60. Credit: 500 - 60 = 440
        $this->juniorMember->refresh();
        $this->assertEquals(440.0, (float)$this->juniorMember->credit);

        // Oct 8 invitation is deleted / Not Included
        $this->assertNull($oct8Invite->fresh());
        $allInvsAfterAccept = TrainingInvitation::where('member_id', $this->juniorMember->id)->get();
        $this->assertCount(2, $allInvsAfterAccept);

        // Step 5: Admin edits training time from 12:20 PM to 1:20 PM (13:20:00)
        // Reset mail fake counts to specifically check that EDIT does NOT send emails
        Mail::fake();

        $updateRes = $this->actingAs($this->admin)->patchJson("/api/trainings/{$oct8Session->id}", [
            'name' => 'Junior Academy Training',
            'startDate' => '2026-10-08 13:20:00',
            'endDate' => '2026-10-22',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'targetType' => 'junior',
        ]);
        $updateRes->assertStatus(200);

        // Step 6 & 7: Verify NO invitation is automatically sent or recreated
        // Verify schedule updated
        $oct8Session->refresh();
        $this->assertEquals('2026-10-08 13:20:00', $oct8Session->start_date);

        // Sessions 2 and 3 also have scheduled time aligned to 13:20:00
        $oct15Session->refresh();
        $oct22Session->refresh();
        $this->assertEquals('2026-10-15 13:20:00', $oct15Session->start_date);
        $this->assertEquals('2026-10-22 13:20:00', $oct22Session->start_date);

        // Step 8: Verify Oct 8 remains Not Included for junior member
        $oct8InviteAfterUpdate = TrainingInvitation::where('training_id', $oct8Session->id)
            ->where('member_id', $this->juniorMember->id)
            ->first();
        $this->assertNull($oct8InviteAfterUpdate);

        // Step 9: Verify NO email notification was sent during training save
        Mail::assertNothingSent();

        // Step 10: Verify no duplicate invitations exist
        $memberInvs = TrainingInvitation::where('member_id', $this->juniorMember->id)->get();
        $this->assertCount(2, $memberInvs);

        // Step 11: Admin explicitly clicks "Send Update"
        $sendUpdateRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$oct8Session->id}/send-update-request", [
            'memberId' => $this->juniorMember->id,
            'existingSessionIds' => [$oct15Session->id, $oct22Session->id],
            'newSessionIds' => [$oct8Session->id],
            'previouslyPaidAmount' => 60.0,
            'updatedMonthlyFee' => 90.0,
            'newPerSessionFee' => 30.0,
            'additionalAmount' => 30.0,
        ]);
        $sendUpdateRes->assertStatus(200);

        // Step 12: Verify invitation update happened ONLY now
        $updateReq = TrainingUpdateRequest::where('member_id', $this->juniorMember->id)
            ->where('training_id', $oct8Session->id)
            ->first();
        $this->assertNotNull($updateReq);
        $this->assertEquals('pending', $updateReq->status);
        $this->assertEquals(30.0, (float)$updateReq->additional_amount);

        // Member responds and accepts the update request
        $respondUpdateRes = $this->actingAs($this->parentUser)->postJson("/api/training-update-requests/{$updateReq->id}/respond", [
            'status' => 'accepted',
        ]);
        $respondUpdateRes->assertStatus(200);

        // Now Oct 8 is accepted, additional fee debited: 440 - 30 = 410
        $this->juniorMember->refresh();
        $this->assertEquals(410.0, (float)$this->juniorMember->credit);

        $oct8InviteAccepted = TrainingInvitation::where('training_id', $oct8Session->id)
            ->where('member_id', $this->juniorMember->id)
            ->first();
        $this->assertNotNull($oct8InviteAccepted);
        $this->assertEquals('accepted', $oct8InviteAccepted->status);

        // 3 attendance dates exist
        $dates = TrainingDate::where('member_id', $this->juniorMember->id)->get();
        $this->assertCount(3, $dates);
    }

    /**
     * Test pending member and yet-to-accept member during training time update:
     * - Pending member remains pending, no emails sent.
     * - Yet to accept member remains yet to accept, no emails sent.
     * - Preserves selections and statuses.
     */
    public function test_time_update_preserves_pending_and_open_members_without_emails(): void
    {
        Mail::fake();

        Carbon::setTestNow(Carbon::parse('2026-10-08 09:00:00', SessionTimingHelper::clubTimezone()));

        // Create 3-week adult training
        $createRes = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Adult Masterclass',
            'startDate' => '2026-10-08 18:00:00',
            'endDate' => '2026-10-22',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1.5 hours',
            'fees' => 120.0,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'adult',
        ]);
        $createRes->assertStatus(201);
        $parentId = $createRes->json('id');

        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();
        $oct8 = $sessions[0];
        $oct15 = $sessions[1];
        $oct22 = $sessions[2];

        // Adult member has initial pending invites created by sync
        \App\Services\InvitationSyncService::syncAllTrainingInvitations(true);

        $pendingInvs = TrainingInvitation::where('member_id', $this->adultMember->id)->get();
        $this->assertCount(3, $pendingInvs);
        foreach ($pendingInvs as $inv) {
            $this->assertEquals('pending', $inv->status);
        }

        // Admin releases / sends invites to adult member
        $this->actingAs($this->admin)->postJson("/api/trainings/{$oct8->id}/update-member-invitation", [
            'memberId' => $this->adultMember->id,
            'sessionIds' => [$oct8->id, $oct15->id, $oct22->id],
        ]);

        $openInvs = TrainingInvitation::where('member_id', $this->adultMember->id)->get();
        $this->assertCount(3, $openInvs);
        foreach ($openInvs as $inv) {
            $this->assertEquals('open', $inv->status);
        }

        // Now Admin edits training time from 6:00 PM to 7:00 PM (19:00:00)
        Mail::fake();

        $updateRes = $this->actingAs($this->admin)->patchJson("/api/trainings/{$oct8->id}", [
            'name' => 'Adult Masterclass',
            'startDate' => '2026-10-08 19:00:00',
            'endDate' => '2026-10-22',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'targetType' => 'adult',
        ]);
        $updateRes->assertStatus(200);

        // Verify NO emails were sent on edit
        Mail::assertNothingSent();

        // Verify all 3 sessions have new time 19:00:00
        $oct8->refresh();
        $oct15->refresh();
        $oct22->refresh();
        $this->assertEquals('2026-10-08 19:00:00', $oct8->start_date);
        $this->assertEquals('2026-10-15 19:00:00', $oct15->start_date);
        $this->assertEquals('2026-10-22 19:00:00', $oct22->start_date);

        // Open invitations remain open for the adult member
        $invsAfterUpdate = TrainingInvitation::where('member_id', $this->adultMember->id)->get();
        $this->assertCount(3, $invsAfterUpdate);
        foreach ($invsAfterUpdate as $inv) {
            $this->assertEquals('open', $inv->status);
        }

        // Adult member can accept all 3 at 7:00 PM
        $acceptRes = $this->actingAs($this->adultUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => $invsAfterUpdate->pluck('id')->toArray(),
            'status' => 'accepted',
        ]);
        $acceptRes->assertStatus(200);

        $this->adultMember->refresh();
        $this->assertEquals(380.0, (float)$this->adultMember->credit); // 500 - 120 = 380
    }

    /**
     * Test group-based training preserves state during time update.
     */
    public function test_group_based_training_time_update_preserves_state(): void
    {
        Mail::fake();

        Carbon::setTestNow(Carbon::parse('2026-10-08 10:00:00', SessionTimingHelper::clubTimezone()));

        $group = LeagueGroup::create([
            'id' => (string) Str::uuid(),
            'name' => 'Junior Elite Squad',
            'group_type' => 'junior',
        ]);

        \Illuminate\Support\Facades\DB::table('league_group_member')->insert([
            'league_group_id' => $group->id,
            'member_id' => $this->juniorMember->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Create group training
        $createRes = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Elite Group Training',
            'startDate' => '2026-10-08 14:00:00',
            'endDate' => '2026-10-22',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'slots' => 5,
            'duration' => '1 hour',
            'fees' => 75.0,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
            'isGroupTraining' => true,
            'leagueGroupIds' => [$group->id],
        ]);
        $createRes->assertStatus(201);
        $parentId = $createRes->json('id');

        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();
        $oct8 = $sessions[0];

        // Send invitations to junior member
        $this->actingAs($this->admin)->postJson("/api/trainings/{$oct8->id}/update-member-invitation", [
            'memberId' => $this->juniorMember->id,
            'sessionIds' => $sessions->pluck('id')->toArray(),
        ]);

        // Time passes 14:00 (e.g. 14:05)
        Carbon::setTestNow(Carbon::parse('2026-10-08 14:05:00', SessionTimingHelper::clubTimezone()));

        // Member accepts remaining 2 sessions
        $invites = TrainingInvitation::where('member_id', $this->juniorMember->id)->get();
        $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$invites[1]->id, $invites[2]->id],
            'status' => 'accepted',
        ]);

        // Verify Oct 8 is Not Included
        $this->assertNull($invites[0]->fresh());

        // Admin changes time to 15:00:00
        Mail::fake();
        $updateRes = $this->actingAs($this->admin)->patchJson("/api/trainings/{$oct8->id}", [
            'startDate' => '2026-10-08 15:00:00',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'targetType' => 'junior',
            'isGroupTraining' => true,
            'leagueGroupIds' => [$group->id],
        ]);
        $updateRes->assertStatus(200);

        // Verify NO invitation recreated for Oct 8
        $oct8Inv = TrainingInvitation::where('training_id', $oct8->id)->where('member_id', $this->juniorMember->id)->first();
        $this->assertNull($oct8Inv);

        // Verify NO emails sent
        Mail::assertNothingSent();
    }
}
