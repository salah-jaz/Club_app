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

class SessionBasedPaymentRecalculationTest extends TestCase
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
            ['id' => 'u_admin_recalc_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_recalc@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $user = User::firstOrCreate(
            ['id' => 'u_member_recalc_test'],
            [
                'first_name' => 'Member',
                'last_name' => 'One',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'member1_recalc@test.com',
                'mobile' => '+1234567891',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->member = Member::firstOrCreate(
            ['id' => 'm_test_recalc_1'],
            [
                'user_id' => $user->id,
                'first_name' => 'Member',
                'last_name' => 'One',
                'email' => 'member1_recalc@test.com',
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

    public function test_example_1_only_weeks_changed_zero_additional_payable(): void
    {
        // Initial Training: Monthly Fee = $100, Repeat Weeks = 2
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Training Program Ex1',
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

        // Release and accept both sessions ($100 total)
        $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/release");
        $allSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();
        $sessionIds = $allSessions->pluck('id')->all();

        $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/update-member-invitation", [
            'memberId' => $this->member->id,
            'sessionIds' => $sessionIds,
            'forceAccept' => true,
        ])->assertStatus(200);

        // Balance after initial payment: 500 - 100 = 400
        $this->member->refresh();
        $this->assertEquals(400.00, $this->member->credit);

        // Admin updates training: Repeat Weeks = 4, Monthly Fee = 100
        $this->actingAs($this->admin)->patchJson("/api/trainings/{$trainingId}", [
            'repeatWeeks' => 4,
            'fees' => 100,
        ])->assertStatus(200);

        $updatedSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();
        $this->assertCount(4, $updatedSessions);

        $existingSessionIds = [$updatedSessions[0]->id, $updatedSessions[1]->id];
        $newSessionIds = [$updatedSessions[2]->id, $updatedSessions[3]->id];

        // Send Update Request: Previously Paid = 100, Updated Fee = 100, New Per Session Fee = 25, Additional Payable = 0
        $sendRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/send-update-request", [
            'memberId' => $this->member->id,
            'existingSessionIds' => $existingSessionIds,
            'newSessionIds' => $newSessionIds,
            'previouslyPaidAmount' => 100.00,
            'updatedMonthlyFee' => 100.00,
            'newPerSessionFee' => 25.00,
            'additionalAmount' => 0.00,
        ]);
        $sendRes->assertStatus(200);
        $updateReqId = $sendRes->json('updateRequest.id');
        $this->assertEquals(0.00, $sendRes->json('updateRequest.additionalAmount'));

        // Member accepts update request
        $respondRes = $this->actingAs($this->admin)->postJson("/api/training-update-requests/{$updateReqId}/respond", [
            'status' => 'accepted',
        ]);
        $respondRes->assertStatus(200);

        // Wallet balance remains 400.00 (no additional deduction)
        $this->member->refresh();
        $this->assertEquals(400.00, $this->member->credit);

        // Attendance now created for all 4 sessions
        $attendanceCount = TrainingDate::where('member_id', $this->member->id)->count();
        $this->assertEquals(4, $attendanceCount);
    }

    public function test_example_2_weeks_and_fee_increased_remaining_payable_deducted(): void
    {
        // Initial Training: Monthly Fee = $100, Repeat Weeks = 2
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Training Program Ex2',
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
        $allSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();
        $sessionIds = $allSessions->pluck('id')->all();

        $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/update-member-invitation", [
            'memberId' => $this->member->id,
            'sessionIds' => $sessionIds,
            'forceAccept' => true,
        ]);

        $this->member->refresh();
        $this->assertEquals(400.00, $this->member->credit);

        // Admin updates training: Repeat Weeks = 4, Monthly Fee = 150
        $this->actingAs($this->admin)->patchJson("/api/trainings/{$trainingId}", [
            'repeatWeeks' => 4,
            'fees' => 150,
        ]);

        $updatedSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();
        $existingSessionIds = [$updatedSessions[0]->id, $updatedSessions[1]->id];
        $newSessionIds = [$updatedSessions[2]->id, $updatedSessions[3]->id];

        // Send Update Request: Previously Paid = 100, Updated Fee = 150, New Per Session Fee = 37.50, Additional Payable = 50
        $sendRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/send-update-request", [
            'memberId' => $this->member->id,
            'existingSessionIds' => $existingSessionIds,
            'newSessionIds' => $newSessionIds,
            'previouslyPaidAmount' => 100.00,
            'updatedMonthlyFee' => 150.00,
            'newPerSessionFee' => 37.50,
            'additionalAmount' => 50.00,
        ]);
        $updateReqId = $sendRes->json('updateRequest.id');

        // Member accepts update request
        $respondRes = $this->actingAs($this->admin)->postJson("/api/training-update-requests/{$updateReqId}/respond", [
            'status' => 'accepted',
        ]);
        $respondRes->assertStatus(200);

        // Wallet balance: 400 - 50 = 350.00
        $this->member->refresh();
        $this->assertEquals(350.00, $this->member->credit);

        // New transaction created for $50.00
        $updateTxn = Transaction::where('member_id', $this->member->id)
            ->where('description', 'like', '%update request accepted%')
            ->first();
        $this->assertNotNull($updateTxn);
        $this->assertEquals(50.00, $updateTxn->amount);
        $this->assertEquals('debit', $updateTxn->type);
    }

    public function test_example_3_fee_reduced_difference_credited_back(): void
    {
        // Initial Training: Monthly Fee = $100, Repeat Weeks = 2
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Training Program Ex3',
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
        $allSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();
        $sessionIds = $allSessions->pluck('id')->all();

        $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/update-member-invitation", [
            'memberId' => $this->member->id,
            'sessionIds' => $sessionIds,
            'forceAccept' => true,
        ]);

        $this->member->refresh();
        $this->assertEquals(400.00, $this->member->credit);

        // Admin updates training: Repeat Weeks = 4, Monthly Fee = 80
        $this->actingAs($this->admin)->patchJson("/api/trainings/{$trainingId}", [
            'repeatWeeks' => 4,
            'fees' => 80,
        ]);

        $updatedSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();
        $existingSessionIds = [$updatedSessions[0]->id, $updatedSessions[1]->id];
        $newSessionIds = [$updatedSessions[2]->id, $updatedSessions[3]->id];

        // Send Update Request: Previously Paid = 100, Updated Fee = 80, New Per Session Fee = 20, Additional Payable = -20 (Refund)
        $sendRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/send-update-request", [
            'memberId' => $this->member->id,
            'existingSessionIds' => $existingSessionIds,
            'newSessionIds' => $newSessionIds,
            'previouslyPaidAmount' => 100.00,
            'updatedMonthlyFee' => 80.00,
            'newPerSessionFee' => 20.00,
            'additionalAmount' => -20.00,
        ]);
        $updateReqId = $sendRes->json('updateRequest.id');

        // Member accepts update request
        $respondRes = $this->actingAs($this->admin)->postJson("/api/training-update-requests/{$updateReqId}/respond", [
            'status' => 'accepted',
        ]);
        $respondRes->assertStatus(200);

        // Wallet balance: 400 + 20 = 420.00
        $this->member->refresh();
        $this->assertEquals(420.00, $this->member->credit);

        // Credit transaction created for $20.00
        $refundTxn = Transaction::where('member_id', $this->member->id)
            ->where('type', 'refund')
            ->where('description', 'like', '%update refund%')
            ->first();
        $this->assertNotNull($refundTxn);
        $this->assertEquals(20.00, $refundTxn->amount);
    }

    public function test_attendance_refund_uses_latest_updated_per_session_fee(): void
    {
        // Initial Training: Monthly Fee = $100, Repeat Weeks = 2 ($50 per session)
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Attendance Fee Test',
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
        $allSessions = Training::where('parent_id', $parentId)->orWhere('id', $parentId)->orderBy('start_date', 'asc')->get();

        $this->actingAs($this->admin)->postJson("/api/trainings/{$trainingId}/update-member-invitation", [
            'memberId' => $this->member->id,
            'sessionIds' => [$allSessions[0]->id],
            'forceAccept' => true,
        ]);

        // Admin updates training: Repeat Weeks = 4, Monthly Fee = 80 ($20 per session)
        $this->actingAs($this->admin)->patchJson("/api/trainings/{$trainingId}", [
            'repeatWeeks' => 4,
            'fees' => 80,
        ]);

        $tDate = TrainingDate::where('member_id', $this->member->id)->where('training_id', $allSessions[0]->id)->first();
        $this->assertNotNull($tDate);

        // Mark absent
        $this->actingAs($this->admin)->patchJson("/api/training-dates/{$tDate->id}/attendance", [
            'attended' => false,
        ])->assertStatus(200);

        // Process full refund for absent session
        $refundRes = $this->actingAs($this->admin)->postJson("/api/training-dates/{$tDate->id}/process-refund", [
            'refundType' => 'full',
        ]);
        $refundRes->assertStatus(200);

        // Assert refund amount is $20.00 (the updated per-session fee of $80 / 4)
        $this->assertEquals(20.00, $refundRes->json('date.refundAmount'));
    }
}
