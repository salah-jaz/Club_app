<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Member;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\TrainingDate;
use App\Models\TrainingUpdateRequest;
use App\Models\Transaction;
use App\Models\Location;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class TrainingUpdateRequestTest extends TestCase
{
    use DatabaseTransactions;

    private User $admin;
    private Member $member;

    protected function setUp(): void
    {
        parent::setUp();

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
}
