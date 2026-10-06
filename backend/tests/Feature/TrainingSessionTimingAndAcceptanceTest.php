<?php

namespace Tests\Feature;

use App\Helpers\SessionTimingHelper;
use App\Models\Grade;
use App\Models\Location;
use App\Models\Member;
use App\Models\Training;
use App\Models\TrainingDate;
use App\Models\TrainingInvitation;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrainingSessionTimingAndAcceptanceTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $parentUser;
    protected Member $member;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        $grade = Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'junior']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_timing_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_timing@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->parentUser = User::firstOrCreate(
            ['id' => 'u_parent_timing_test'],
            [
                'first_name' => 'Parent',
                'last_name' => 'User',
                'sex' => 'female',
                'dob' => '1985-05-05',
                'email' => 'parent_timing@test.com',
                'mobile' => '+1234567899',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->member = Member::firstOrCreate(
            ['id' => 'm_child_timing_test'],
            [
                'user_id' => $this->parentUser->id,
                'first_name' => 'Child',
                'last_name' => 'Timing',
                'sex' => 'male',
                'dob' => '2015-05-05',
                'email' => 'child_timing@test.com',
                'mobile' => '+1234567898',
                'address' => 'Test Address',
                'member_type' => 'junior',
                'grade' => $grade->name,
                'credit' => 500.0,
                'training_eligible' => true,
                'status' => 'active',
            ]
        );
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_oct_5_at_9pm_training_has_3_valid_sessions_before_9pm_and_deducts_full_fee(): void
    {
        // Set test now to Oct 5 at 6:00 PM IST (before 9:00 PM session)
        Carbon::setTestNow(Carbon::parse('2026-10-05 18:00:00', SessionTimingHelper::clubTimezone()));

        // Create 3-week training starting Oct 5, 2026 at 9:00 PM
        $response = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Monday Night Training',
            'startDate' => '2026-10-05 21:00:00',
            'endDate' => '2026-10-19',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'sessions' => 3,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 90.0,
            'coach' => 'Coach Timing',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $response->assertStatus(201);
        $parentId = $response->json('parentId') ?: $response->json('id');

        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date')->get();
        $this->assertCount(3, $sessions);

        // Verify datetimes are preserved
        $this->assertEquals('2026-10-05 21:00:00', Carbon::parse($sessions[0]->start_date)->format('Y-m-d H:i:s'));
        $this->assertEquals('2026-10-12 21:00:00', Carbon::parse($sessions[1]->start_date)->format('Y-m-d H:i:s'));
        $this->assertEquals('2026-10-19 21:00:00', Carbon::parse($sessions[2]->start_date)->format('Y-m-d H:i:s'));

        // All 3 sessions must be upcoming before 9:00 PM
        foreach ($sessions as $s) {
            $this->assertEquals(SessionTimingHelper::PHASE_UPCOMING, SessionTimingHelper::trainingSessionPhase($s));
        }

        // Release training sessions to send invitations
        foreach ($sessions as $s) {
            $releaseRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$s->id}/release", [
                'memberIds' => [$this->member->id],
            ]);
            $releaseRes->assertStatus(200);
        }

        $invites = TrainingInvitation::where('member_id', $this->member->id)->get();
        $this->assertCount(3, $invites);

        // Accept all 3 sessions via respond-bulk
        $acceptRes = $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => $invites->pluck('id')->all(),
            'status' => 'accepted',
        ]);
        $acceptRes->assertStatus(200);

        // Wallet deduction: 3 sessions = 90.0 fee (500 - 90 = 410)
        $this->assertEquals(410.0, (float) $this->member->fresh()->credit);

        // 3 Training dates created
        $dates = TrainingDate::where('member_id', $this->member->id)->get();
        $this->assertCount(3, $dates);
    }

    public function test_oct_5_after_9pm_is_blocked_for_new_acceptance_and_only_future_sessions_can_be_accepted(): void
    {
        // 1. Created at 6:00 PM
        Carbon::setTestNow(Carbon::parse('2026-10-05 18:00:00', SessionTimingHelper::clubTimezone()));

        $response = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Monday Night Training Late',
            'startDate' => '2026-10-05 21:00:00',
            'endDate' => '2026-10-19',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'sessions' => 3,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 90.0,
            'coach' => 'Coach Timing',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);
        $response->assertStatus(201);
        $parentId = $response->json('parentId') ?: $response->json('id');

        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date')->get();
        foreach ($sessions as $s) {
            $this->actingAs($this->admin)->postJson("/api/trainings/{$s->id}/release", [
                'memberIds' => [$this->member->id],
            ])->assertStatus(200);
        }

        $oct5Session = $sessions[0];
        $oct12Session = $sessions[1];
        $oct19Session = $sessions[2];

        $oct5Invite = TrainingInvitation::where('training_id', $oct5Session->id)->where('member_id', $this->member->id)->first();
        $oct12Invite = TrainingInvitation::where('training_id', $oct12Session->id)->where('member_id', $this->member->id)->first();
        $oct19Invite = TrainingInvitation::where('training_id', $oct19Session->id)->where('member_id', $this->member->id)->first();

        // 2. Advance time past 9:00 PM (e.g. 9:15 PM - in progress)
        Carbon::setTestNow(Carbon::parse('2026-10-05 21:15:00', SessionTimingHelper::clubTimezone()));

        $this->assertEquals(SessionTimingHelper::PHASE_IN_PROGRESS, SessionTimingHelper::trainingSessionPhase($oct5Session));
        $this->assertEquals(SessionTimingHelper::PHASE_UPCOMING, SessionTimingHelper::trainingSessionPhase($oct12Session));
        $this->assertEquals(SessionTimingHelper::PHASE_UPCOMING, SessionTimingHelper::trainingSessionPhase($oct19Session));

        // Attempting to accept Oct 5 session directly must be BLOCKED
        $failSingle = $this->actingAs($this->parentUser)->postJson("/api/training-invitations/{$oct5Invite->id}/respond", [
            'status' => 'accepted',
        ]);
        $failSingle->assertStatus(422);

        // Attempting to accept all 3 via bulk must be BLOCKED because Oct 5 is no longer valid
        $failBulk = $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$oct5Invite->id, $oct12Invite->id, $oct19Invite->id],
            'status' => 'accepted',
        ]);
        $failBulk->assertStatus(422);

        // Advance time to 10:30 PM (finished)
        Carbon::setTestNow(Carbon::parse('2026-10-05 22:30:00', SessionTimingHelper::clubTimezone()));
        $this->assertEquals(SessionTimingHelper::PHASE_FINISHED, SessionTimingHelper::trainingSessionPhase($oct5Session));

        $failFinished = $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$oct5Invite->id, $oct12Invite->id, $oct19Invite->id],
            'status' => 'accepted',
        ]);
        $failFinished->assertStatus(422);

        // Accepting only remaining valid sessions (Oct 12 and Oct 19 = 2 weeks) SUCCEEDS
        $acceptRemaining = $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$oct12Invite->id, $oct19Invite->id],
            'status' => 'accepted',
        ]);
        $acceptRemaining->assertStatus(200);

        // Fee calculation: 90 / 3 * 2 = 60.0. 500 - 60 = 440.0
        $this->assertEquals(440.0, (float) $this->member->fresh()->credit);

        // Verify invitation statuses: Oct 5 remains open (not accepted), Oct 12 and 19 are accepted
        $this->assertEquals('open', $oct5Invite->fresh()->status);
        $this->assertEquals('accepted', $oct12Invite->fresh()->status);
        $this->assertEquals('accepted', $oct19Invite->fresh()->status);
    }

    public function test_oct_6_training_retains_all_3_sessions_available(): void
    {
        // When today is Oct 5 at 6:00 PM, and training starts Oct 6 at 7:00 PM
        Carbon::setTestNow(Carbon::parse('2026-10-05 18:00:00', SessionTimingHelper::clubTimezone()));

        $response = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Tuesday Night Training',
            'startDate' => '2026-10-06 19:00:00',
            'endDate' => '2026-10-20',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'sessions' => 3,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 75.0,
            'coach' => 'Coach Tuesday',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);
        $response->assertStatus(201);
        $parentId = $response->json('parentId') ?: $response->json('id');

        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date')->get();
        $this->assertCount(3, $sessions);

        foreach ($sessions as $s) {
            $this->actingAs($this->admin)->postJson("/api/trainings/{$s->id}/release", [
                'memberIds' => [$this->member->id],
            ])->assertStatus(200);
        }

        foreach ($sessions as $s) {
            $this->assertEquals(SessionTimingHelper::PHASE_UPCOMING, SessionTimingHelper::trainingSessionPhase($s));
        }

        $invites = TrainingInvitation::where('member_id', $this->member->id)->whereIn('training_id', $sessions->pluck('id'))->get();
        $this->assertCount(3, $invites);

        // All 3 sessions can be accepted
        $acceptRes = $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => $invites->pluck('id')->all(),
            'status' => 'accepted',
        ]);
        $acceptRes->assertStatus(200);

        // Fee deduction: 75.0 (500 - 75 = 425)
        $this->assertEquals(425.0, (float) $this->member->fresh()->credit);

        // 3 dates created
        $dates = TrainingDate::where('member_id', $this->member->id)->whereIn('training_id', $sessions->pluck('id'))->get();
        $this->assertCount(3, $dates);
    }

    public function test_oct_5_at_10pm_training_at_6_48pm_has_all_3_sessions_and_remains_available_after_sync_and_edit(): void
    {
        // 1. Current time is Oct 5 at 6:48 PM
        Carbon::setTestNow(Carbon::parse('2026-10-05 18:48:00', SessionTimingHelper::clubTimezone()));

        // Create an adult member
        $adultMember = Member::firstOrCreate(
            ['id' => 'm_adult_timing_test'],
            [
                'user_id' => $this->parentUser->id,
                'first_name' => 'Adult',
                'last_name' => 'Member',
                'sex' => 'female',
                'dob' => '1995-05-05',
                'email' => 'adult_timing@test.com',
                'mobile' => '+1234567897',
                'address' => 'Test Address',
                'member_type' => 'adult',
                'grade' => 'Grade A',
                'credit' => 300.0,
                'training_eligible' => true,
                'status' => 'active',
            ]
        );

        // Admin creates a 3-week adult training program starting Oct 5, 2026 at 10:00 PM
        $response = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Monday 10 PM Adult Training',
            'startDate' => '2026-10-05 22:00:00',
            'endDate' => '2026-10-19',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'sessions' => 3,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 120.0,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'adult',
        ]);
        $response->assertStatus(201);
        $parentId = $response->json('parentId') ?: $response->json('id');

        // Admin sends invitations for all 3 sessions
        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date')->get();
        $this->assertCount(3, $sessions);

        $updateInvRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$parentId}/update-member-invitation", [
            'memberId' => $adultMember->id,
            'sessionIds' => $sessions->pluck('id')->all(),
        ]);
        $updateInvRes->assertStatus(200);

        // Admin edits training (e.g. updating location or name or coach)
        $editRes = $this->actingAs($this->admin)->patchJson("/api/trainings/{$parentId}", [
            'name' => 'Monday 10 PM Adult Training Updated',
            'targetType' => 'adult',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'fees' => 120.0,
        ]);
        $editRes->assertStatus(200);

        // Verify all 3 sessions still have target_type = adult
        $updatedSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date')->get();
        foreach ($updatedSessions as $s) {
            $this->assertEquals('adult', $s->target_type);
        }

        // Run full invitation sync
        \App\Services\InvitationSyncService::syncAllTrainingInvitations(true);

        // Verify that invitations for ALL 3 sessions (Oct 5, Oct 12, Oct 19) are retained and open
        $invites = TrainingInvitation::where('member_id', $adultMember->id)
            ->whereIn('training_id', $sessions->pluck('id'))
            ->get();
        $this->assertCount(3, $invites);
        foreach ($invites as $inv) {
            $this->assertEquals('open', $inv->status);
        }

        // Before 10:00 PM (currently 6:48 PM): all 3 sessions must be PHASE_UPCOMING
        foreach ($updatedSessions as $s) {
            $this->assertEquals(SessionTimingHelper::PHASE_UPCOMING, SessionTimingHelper::trainingSessionPhase($s));
        }

        // Now test scenario after 10:00 PM (e.g. 10:15 PM):
        Carbon::setTestNow(Carbon::parse('2026-10-05 22:15:00', SessionTimingHelper::clubTimezone()));

        $this->assertEquals(SessionTimingHelper::PHASE_IN_PROGRESS, SessionTimingHelper::trainingSessionPhase($updatedSessions[0]));
        $this->assertEquals(SessionTimingHelper::PHASE_UPCOMING, SessionTimingHelper::trainingSessionPhase($updatedSessions[1]));
        $this->assertEquals(SessionTimingHelper::PHASE_UPCOMING, SessionTimingHelper::trainingSessionPhase($updatedSessions[2]));

        // Accepting Oct 5 now fails
        $oct5Invite = $invites->firstWhere('training_id', $updatedSessions[0]->id);
        $failAccept = $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$oct5Invite->id],
            'status' => 'accepted',
        ]);
        $failAccept->assertStatus(422);

        // Accepting remaining valid sessions (Oct 12 and Oct 19) succeeds
        $oct12Invite = $invites->firstWhere('training_id', $updatedSessions[1]->id);
        $oct19Invite = $invites->firstWhere('training_id', $updatedSessions[2]->id);
        $passAccept = $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$oct12Invite->id, $oct19Invite->id],
            'status' => 'accepted',
        ]);
        $passAccept->assertStatus(200);

        // Fee deduction: 120 / 3 * 2 = 80. 300 - 80 = 220
        $this->assertEquals(220.0, (float) $adultMember->fresh()->credit);

        // 2 dates created for Oct 12 and Oct 19
        $dates = TrainingDate::where('member_id', $adultMember->id)->get();
        $this->assertCount(2, $dates);
    }
}
