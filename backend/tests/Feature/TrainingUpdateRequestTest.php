<?php

namespace Tests\Feature;

use App\Helpers\SessionTimingHelper;
use App\Models\User;
use App\Models\Member;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\TrainingDate;
use App\Models\TrainingUpdateRequest;
use App\Models\Transaction;
use App\Models\Location;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrainingUpdateRequestTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Member $member;

    protected function setUp(): void
    {
        parent::setUp();

        \Carbon\Carbon::setTestNow('2026-07-01 10:00:00');

        Location::firstOrCreate(['name' => 'Main Hall']);
        \App\Models\Grade::firstOrCreate(['name' => 'A'], ['type' => 'adult']);
        Training::query()->delete();

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_tur_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_tur@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'is_super_admin' => true,
                'status' => 'active',
            ]
        );

        $user = User::firstOrCreate(
            ['id' => 'u_member_tur_test'],
            [
                'first_name' => 'Member',
                'last_name' => 'One',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'member1_tur@test.com',
                'mobile' => '+1234567891',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->member = Member::firstOrCreate(
            ['id' => 'm_test_tur_1'],
            [
                'user_id' => $user->id,
                'first_name' => 'Member',
                'last_name' => 'One',
                'email' => 'member1_tur@test.com',
                'dob' => '1990-01-01',
                'sex' => 'male',
                'member_type' => 'adult',
                'membership' => true,
                'status' => 'active',
                'credit' => 500.00,
                'bi_member_id' => 'BI001',
                'grade' => 'A',
                'training_eligible' => true,
                'play_eligible' => true,
                'skip_credit_consumption' => false,
                'apply_discount' => false,
            ]
        );
        $this->member->update(['credit' => 500.00]);
    }

    public function test_accepted_member_not_updated_automatically_on_training_edit(): void
    {
        // 1. Create Training with repeat_weeks = 2, fee = 100 ($50 per session)
        $response = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Summer Camp TUR',
            'startDate' => '2026-08-01 10:00:00',
            'endDate' => '2026-08-01 11:00:00',
            'repeatWeeks' => 2,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'adult',
        ]);

        $response->assertStatus(201);
        $trainingId = $response->json('id');
        $parentId = $response->json('parentId') ?: $trainingId;

        // Release training session 1
        $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/release");

        $invitation = TrainingInvitation::where('training_id', $trainingId)
            ->where('member_id', $this->member->id)
            ->first();

        // Member accepts invitation for session 1 ($50 debited)
        $this->actingAs($this->admin)->postJson("/api/training-invitations/{$invitation->id}/respond", [
            'status' => 'accepted',
        ])->assertStatus(200);

        // Member should have 50 debited, balance = 450
        $this->member->refresh();
        $this->assertEquals(450.00, $this->member->credit);

        // 2 sessions exist in series
        $initialSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->get();
        $this->assertCount(2, $initialSessions);

        // 1 attendance record created for accepted session
        $initialAttendanceCount = TrainingDate::where('member_id', $this->member->id)->count();
        $this->assertEquals(1, $initialAttendanceCount);

        // 2. Admin edits training program to repeatWeeks = 4
        $this->actingAs($this->admin)->patchJson("/api/trainings/{$trainingId}", [
            'repeatWeeks' => 4,
        ])->assertStatus(200);

        // Training now has 4 sessions
        $updatedSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->get();
        $this->assertCount(4, $updatedSessions);

        // Crucial Check: Accepted member's accepted invitations stay at 1!
        $acceptedInvsCount = TrainingInvitation::where('member_id', $this->member->id)
            ->where('status', 'accepted')
            ->count();
        $this->assertEquals(1, $acceptedInvsCount);

        // Member wallet and attendance stay untouched
        $this->member->refresh();
        $this->assertEquals(450.00, $this->member->credit);
        $this->assertEquals(1, TrainingDate::where('member_id', $this->member->id)->count());
    }

    public function test_send_and_accept_training_update_request_deducts_only_additional_amount_and_creates_new_attendance(): void
    {
        // Setup initial training with 2 weeks
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Elite Program TUR',
            'startDate' => '2026-08-01 10:00:00',
            'endDate' => '2026-08-01 11:00:00',
            'repeatWeeks' => 2,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'adult',
        ]);
        $trainingId = $res->json('id');
        $parentId = $res->json('parentId') ?: $trainingId;

        $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/release");

        $invitation = TrainingInvitation::where('training_id', $trainingId)
            ->where('member_id', $this->member->id)
            ->first();

        $this->actingAs($this->admin)->postJson("/api/training-invitations/{$invitation->id}/respond", [
            'status' => 'accepted',
        ]);

        $initialTxn = Transaction::where('member_id', $this->member->id)->first();
        $this->assertNotNull($initialTxn);
        $this->assertEquals(50.00, $initialTxn->amount);

        // Admin updates training to 4 weeks (adding 2 new sessions)
        $this->actingAs($this->admin)->patchJson("/api/trainings/{$trainingId}", [
            'repeatWeeks' => 4,
        ]);

        $allSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();
        $existingSessionIds = [$allSessions[0]->id];
        $newSessionIds = [$allSessions[2]->id, $allSessions[3]->id];

        // 3. Admin sends Update Request for the 2 new sessions ($50 additional amount)
        $sendRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/send-update-request", [
            'memberId' => $this->member->id,
            'existingSessionIds' => $existingSessionIds,
            'newSessionIds' => $newSessionIds,
            'additionalAmount' => 50.00,
        ]);

        $sendRes->assertStatus(200);
        $updateReqId = $sendRes->json('updateRequest.id');
        $this->assertEquals('pending', $sendRes->json('updateRequest.status'));

        // 4. Member accepts the update request
        $respondRes = $this->actingAs($this->admin)->postJson("/api/training-update-requests/{$updateReqId}/respond", [
            'status' => 'accepted',
        ]);

        $respondRes->assertStatus(200);
        $this->assertEquals('accepted', $respondRes->json('updateRequest.status'));

        // Wallet balance after deduction: 500 - 50 - 50 = 400
        $this->member->refresh();
        $this->assertEquals(400.00, $this->member->credit);

        // Assert new transaction created for $50.00, original $50.00 transaction is untouched
        $updateTxn = Transaction::where('member_id', $this->member->id)
            ->where('description', 'like', '%update request accepted%')
            ->first();
        $this->assertNotNull($updateTxn);
        $this->assertEquals(50.00, $updateTxn->amount);

        // Assert attendance created for initial 1 session + 2 new sessions = 3 total
        $attendanceCount = TrainingDate::where('member_id', $this->member->id)->count();
        $this->assertEquals(3, $attendanceCount);

        // Assert member now has accepted invitations for 3 sessions
        $acceptedInvsCount = TrainingInvitation::where('member_id', $this->member->id)
            ->where('status', 'accepted')
            ->count();
        $this->assertEquals(3, $acceptedInvsCount);
    }

    public function test_decline_training_update_request_keeps_original_invitation_and_balance_unchanged(): void
    {
        // Setup initial training with 2 weeks
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Pro TUR',
            'startDate' => '2026-08-01 10:00:00',
            'endDate' => '2026-08-01 11:00:00',
            'repeatWeeks' => 2,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'adult',
        ]);
        $trainingId = $res->json('id');
        $parentId = $res->json('parentId') ?: $trainingId;

        $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/release");

        $invitation = TrainingInvitation::where('training_id', $trainingId)
            ->where('member_id', $this->member->id)
            ->first();

        $this->actingAs($this->admin)->postJson("/api/training-invitations/{$invitation->id}/respond", [
            'status' => 'accepted',
        ]);

        // Admin updates training to 4 weeks
        $this->actingAs($this->admin)->patchJson("/api/trainings/{$trainingId}", [
            'repeatWeeks' => 4,
        ]);

        $allSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();
        $existingSessionIds = [$allSessions[0]->id];
        $newSessionIds = [$allSessions[2]->id, $allSessions[3]->id];

        // Admin sends update request
        $sendRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/send-update-request", [
            'memberId' => $this->member->id,
            'existingSessionIds' => $existingSessionIds,
            'newSessionIds' => $newSessionIds,
            'additionalAmount' => 50.00,
        ]);
        $updateReqId = $sendRes->json('updateRequest.id');

        // Member declines the update request
        $respondRes = $this->actingAs($this->admin)->postJson("/api/training-update-requests/{$updateReqId}/respond", [
            'status' => 'declined',
        ]);

        $respondRes->assertStatus(200);
        $this->assertEquals('declined', $respondRes->json('updateRequest.status'));

        // Member wallet stays at 450.00 (no additional deduction)
        $this->member->refresh();
        $this->assertEquals(450.00, $this->member->credit);

        // Transactions count stays at 1 ($50.00)
        $this->assertEquals(1, Transaction::where('member_id', $this->member->id)->count());

        // Attendance stays at 1 session
        $this->assertEquals(1, TrainingDate::where('member_id', $this->member->id)->count());

        // Accepted invitations stay at 1 session
        $acceptedInvsCount = TrainingInvitation::where('member_id', $this->member->id)
            ->where('status', 'accepted')
            ->count();
        $this->assertEquals(1, $acceptedInvsCount);
    }

    /**
     * Regression (Avanthika flow): member accepts only later weeks, admin later sends
     * an update that adds earlier finished weeks — accept must succeed and debit the
     * additional amount even though the anchor/new sessions are phase-finished.
     */
    public function test_accept_update_request_adding_finished_past_sessions_succeeds(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-01 09:00:00', SessionTimingHelper::clubTimezone()));

        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'November 2026(Monday)6:00PM TUR',
            'startDate' => '2026-11-02 19:00:00',
            'endDate' => '2026-11-30',
            'repeatWeeks' => 5,
            'repeatMonths' => 1,
            'slots' => 6,
            'duration' => '1.5 hours',
            'fees' => 50,
            'coach' => 'Coach Bastian',
            'location' => 'Main Hall',
            'targetType' => 'adult',
        ]);
        $res->assertStatus(201);
        $trainingId = $res->json('id');
        $parentId = $res->json('parentId') ?: $trainingId;

        $sessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)
            ->orderBy('start_date')
            ->get();
        $this->assertCount(5, $sessions);

        // Invite + accept only the last two (upcoming) weeks first.
        $existing = $sessions->slice(3)->values(); // Nov 23, Nov 30
        $past = $sessions->take(3)->values(); // Nov 2, 9, 16

        foreach ($existing as $session) {
            $this->actingAs($this->admin)->postJson("/api/trainings/{$session->id}/release", [
                'memberIds' => [$this->member->id],
            ])->assertOk();
        }

        $existingInviteIds = TrainingInvitation::where('member_id', $this->member->id)
            ->whereIn('training_id', $existing->pluck('id'))
            ->where('status', 'open')
            ->pluck('id')
            ->all();
        $this->assertCount(2, $existingInviteIds);

        $this->actingAs($this->admin)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => $existingInviteIds,
            'status' => 'accepted',
        ])->assertOk();

        $this->member->refresh();
        $creditAfterPartial = (float) $this->member->credit;
        $this->assertSame(20.0, round(500.0 - $creditAfterPartial, 2));

        // Mid-month: child weekly sessions from early November are finished.
        Carbon::setTestNow(Carbon::parse('2026-11-19 15:00:00', SessionTimingHelper::clubTimezone()));
        $finishedPast = $past->filter(
            fn (Training $session) => SessionTimingHelper::trainingSessionPhase($session->fresh()) === SessionTimingHelper::PHASE_FINISHED
        );
        $this->assertGreaterThanOrEqual(2, $finishedPast->count());

        // Admin Send Update for already-accepted members goes straight to update-request
        // (update-member-invitation is locked once any month session is accepted).
        $sendRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/send-update-request", [
            'memberId' => $this->member->id,
            'existingSessionIds' => $existing->pluck('id')->all(),
            'newSessionIds' => $past->pluck('id')->all(),
            'previouslyPaidAmount' => 20.0,
            'updatedMonthlyFee' => 50.0,
            'newPerSessionFee' => 10.0,
            'additionalAmount' => 30.0,
        ]);
        $sendRes->assertOk();
        $updateReqId = $sendRes->json('updateRequest.id');

        // Anchor training (often parent / first week) is phase-finished or in_progress —
        // respond must still succeed for catch-up past sessions.
        $anchorPhase = SessionTimingHelper::trainingSessionPhase(Training::findOrFail($trainingId));
        $this->assertContains($anchorPhase, [
            SessionTimingHelper::PHASE_FINISHED,
            SessionTimingHelper::PHASE_IN_PROGRESS,
        ]);

        $respondRes = $this->actingAs($this->admin)->postJson("/api/training-update-requests/{$updateReqId}/respond", [
            'status' => 'accepted',
        ]);
        $respondRes->assertOk();
        $respondRes->assertJsonPath('updateRequest.status', 'accepted');
        $respondRes->assertJsonMissing(['message' => 'This session has finished. No further actions are available.']);
        $respondRes->assertJsonMissing(['message' => 'This session has finished. Accept and payment are no longer available.']);

        $this->member->refresh();
        $this->assertSame(30.0, round($creditAfterPartial - (float) $this->member->credit, 2));
        $this->assertSame(
            5,
            TrainingInvitation::where('member_id', $this->member->id)->where('status', 'accepted')->count()
        );
        foreach ($past as $session) {
            $this->assertSame(
                'accepted',
                TrainingInvitation::where('training_id', $session->id)
                    ->where('member_id', $this->member->id)
                    ->value('status')
            );
        }
    }
}
