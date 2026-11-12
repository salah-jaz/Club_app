<?php

namespace Tests\Feature;

use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\User;
use App\Models\Member;
use App\Models\Transaction;
use App\Models\Location;
use App\Models\Grade;
use App\Models\TrainingDate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrainingCancellationTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $memberUser;
    protected Member $juniorMember;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        $grade = Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'junior']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_cancel_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_cancel@test.com',
                'mobile' => '+1234567891',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'is_super_admin' => true,
                'status' => 'active',
            ]
        );

        $this->memberUser = User::firstOrCreate(
            ['id' => 'u_parent_cancel_test'],
            [
                'first_name' => 'Parent',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1985-01-01',
                'email' => 'parent_cancel@test.com',
                'mobile' => '+1234567892',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->juniorMember = Member::firstOrCreate(
            ['id' => 'm_child_cancel_test'],
            [
                'parent_user_id' => $this->memberUser->id,
                'first_name' => 'Child',
                'last_name' => 'User',
                'email' => 'child_cancel@test.com',
                'sex' => 'female',
                'dob' => '2015-01-01',
                'member_type' => 'junior',
                'grade' => 'Grade A',
                'status' => 'active',
                'training_eligible' => true,
                'credit' => 100.0,
                'skip_credit_consumption' => false,
            ]
        );
    }

    public function test_cancelling_training_requires_reason(): void
    {
        $tr = Training::create([
            'id' => 'tr_cancel_req_' . \Illuminate\Support\Str::random(4),
            'parent_id' => 'tr_cancel_req_parent',
            'name' => 'Saturday Junior Coaching',
            'start_date' => now()->addDays(2),
            'end_date' => now()->addDays(2)->addHours(2),
            'sessions' => 3,
            'repeat_weeks' => 3,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 50.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'open',
            'target_type' => 'junior',
        ]);

        $response = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/cancel", []);
        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['reason']);
    }

    public function test_cancelling_training_updates_status_and_refunds_member(): void
    {
        $tr = Training::create([
            'id' => 'tr_cancel_success_' . \Illuminate\Support\Str::random(4),
            'parent_id' => 'tr_cancel_success_parent',
            'name' => 'Sunday Junior Coaching',
            'start_date' => now()->addDays(3),
            'end_date' => now()->addDays(3)->addHours(2),
            'sessions' => 3,
            'repeat_weeks' => 3,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 60.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);

        // Accept & debit member
        TrainingInvitation::create([
            'id' => 'ti_cancel_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
        ]);

        // Create debit transaction simulating payment
        Transaction::create([
            'id' => 't_debit_' . \Illuminate\Support\Str::random(6),
            'member_id' => $this->juniorMember->id,
            'type' => 'debit',
            'amount' => 60.0,
            'description' => 'Training Program Session — Sunday Junior Coaching',
            'date' => now(),
        ]);
        $this->juniorMember->update(['credit' => 40.0]);

        $cancelReason = 'Coach unavailable due to emergency';
        $response = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/cancel", [
            'reason' => $cancelReason,
        ]);

        $response->assertOk();
        $response->assertJsonPath('training.status', 'cancelled');
        $response->assertJsonPath('training.cancelReason', $cancelReason);

        $tr->refresh();
        $this->assertEquals('cancelled', $tr->status);
        $this->assertEquals($cancelReason, $tr->cancel_reason);

        // Verify credit refund transaction was created and member credit restored
        $this->juniorMember->refresh();
        $this->assertEquals(100.0, $this->juniorMember->credit);

        $this->assertDatabaseHas('transactions', [
            'member_id' => $this->juniorMember->id,
            'type' => 'refund',
            'amount' => 60.0,
            'description' => 'Refund — cancelled training program for Child User: Sunday Junior Coaching',
        ]);
    }

    /**
     * Regression: cancelling a €1 (force-accepted) training must NOT refund prior unrelated training payments.
     * Bug was debit matcher `description LIKE 'Training%'` summing all training debits (e.g. 50 + 1 = 51).
     */
    public function test_cancel_refunds_only_this_training_not_prior_unrelated_training_debits(): void
    {
        $this->juniorMember->update(['credit' => 100.0]);

        // Prior unrelated training (€50) — still active / separately paid
        $prior = Training::create([
            'id' => 'tr_prior_' . \Illuminate\Support\Str::random(4),
            'parent_id' => null,
            'name' => 'Prior Unrelated Coaching',
            'start_date' => now()->addDays(10),
            'end_date' => now()->addDays(10)->addHours(2),
            'sessions' => 1,
            'repeat_weeks' => 1,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 50.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);
        $prior->update(['parent_id' => $prior->id]);

        TrainingInvitation::create([
            'id' => 'ti_prior_' . \Illuminate\Support\Str::random(4),
            'training_id' => $prior->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
            'accepted_amount' => 50.0,
            'accepted_per_session_fee' => 50.0,
            'accepted_monthly_fee' => 50.0,
            'accepted_repeat_weeks' => 1,
        ]);
        Transaction::create([
            'id' => 't_prior_debit_' . \Illuminate\Support\Str::random(4),
            'member_id' => $this->juniorMember->id,
            'type' => 'debit',
            'amount' => 50.0,
            'description' => 'Training program invitation accepted for Child User: Prior Unrelated Coaching (Training Fee: $50.00, Discount: $0.00, Amount Debited: $50.00)',
            'date' => now()->subDay(),
        ]);
        $this->juniorMember->update(['credit' => 50.0]);

        // Current €1 training — force accept
        $current = Training::create([
            'id' => 'tr_curr_' . \Illuminate\Support\Str::random(4),
            'parent_id' => null,
            'name' => 'One Euro Mini Session',
            'start_date' => now()->addDays(2),
            'end_date' => now()->addDays(2)->addHours(1),
            'sessions' => 1,
            'repeat_weeks' => 1,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '1 Hour',
            'fees' => 1.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);
        $current->update(['parent_id' => $current->id]);

        $force = $this->actingAs($this->admin)->postJson("/api/trainings/{$current->id}/update-member-invitation", [
            'memberId' => $this->juniorMember->id,
            'sessionIds' => [$current->id],
            'forceAccept' => true,
        ]);
        $force->assertOk();

        $this->juniorMember->refresh();
        $this->assertEquals(49.0, $this->juniorMember->credit);

        $inv = TrainingInvitation::where('training_id', $current->id)
            ->where('member_id', $this->juniorMember->id)
            ->where('status', 'accepted')
            ->first();
        $this->assertNotNull($inv);
        $this->assertEquals(1.0, (float) $inv->accepted_amount);

        // Cancel the €1 training — must refund ONLY €1, never €51
        $cancel = $this->actingAs($this->admin)->postJson("/api/trainings/{$current->id}/cancel", [
            'reason' => 'Session cancelled by admin',
        ]);
        $cancel->assertOk();

        $this->juniorMember->refresh();
        $this->assertEquals(50.0, $this->juniorMember->credit);

        $refunds = Transaction::where('member_id', $this->juniorMember->id)
            ->where('type', 'refund')
            ->where('description', 'like', '%One Euro Mini Session%')
            ->get();
        $this->assertCount(1, $refunds);
        $this->assertEquals(1.0, (float) $refunds->first()->amount);

        // Prior training enrollment and its €50 debit must remain untouched
        $this->assertDatabaseHas('training_invitations', [
            'training_id' => $prior->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
        ]);
        $this->assertEquals(50.0, (float) Transaction::where('member_id', $this->juniorMember->id)
            ->where('type', 'debit')
            ->where('description', 'like', '%Prior Unrelated Coaching%')
            ->sum('amount'));

        // Repeated cancel must not create a duplicate refund
        $again = $this->actingAs($this->admin)->postJson("/api/trainings/{$current->id}/cancel", [
            'reason' => 'Session cancelled by admin again',
        ]);
        $again->assertOk();
        $this->juniorMember->refresh();
        $this->assertEquals(50.0, $this->juniorMember->credit);
        $this->assertEquals(1, Transaction::where('member_id', $this->juniorMember->id)
            ->where('type', 'refund')
            ->where('description', 'like', '%One Euro Mini Session%')
            ->count());
    }

    public function test_cancel_with_partial_series_payment_refunds_accepted_amount_only(): void
    {
        $this->juniorMember->update(['credit' => 100.0]);

        $tr1 = Training::create([
            'id' => 'tr_partial_1_' . \Illuminate\Support\Str::random(4),
            'parent_id' => null,
            'name' => 'Partial Pay Coaching - Week 1',
            'start_date' => now()->addDays(1),
            'end_date' => now()->addDays(1)->addHours(2),
            'sessions' => 2,
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 40.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);
        $tr1->update(['parent_id' => $tr1->id]);

        $tr2 = Training::create([
            'id' => 'tr_partial_2_' . \Illuminate\Support\Str::random(4),
            'parent_id' => $tr1->id,
            'name' => 'Partial Pay Coaching - Week 2',
            'start_date' => now()->addDays(8),
            'end_date' => now()->addDays(8)->addHours(2),
            'sessions' => 2,
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 40.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);

        // Only Week 1 accepted/paid (€20 of €40 monthly)
        TrainingInvitation::create([
            'id' => 'ti_partial_1_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr1->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
            'accepted_amount' => 20.0,
            'accepted_per_session_fee' => 20.0,
            'accepted_monthly_fee' => 40.0,
            'accepted_repeat_weeks' => 2,
        ]);
        Transaction::create([
            'id' => 't_partial_debit_' . \Illuminate\Support\Str::random(4),
            'member_id' => $this->juniorMember->id,
            'type' => 'debit',
            'amount' => 20.0,
            'description' => 'Training program invitation force accepted for Child User: Partial Pay Coaching - Week 1',
            'date' => now(),
        ]);
        $this->juniorMember->update(['credit' => 80.0]);

        // Unrelated €50 debit that used to be swept in by Training% matcher
        Transaction::create([
            'id' => 't_noise_' . \Illuminate\Support\Str::random(4),
            'member_id' => $this->juniorMember->id,
            'type' => 'debit',
            'amount' => 50.0,
            'description' => 'Training program invitation accepted for Child User: Completely Different Program',
            'date' => now(),
        ]);
        $this->juniorMember->update(['credit' => 30.0]);

        $res = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr1->id}/cancel", [
            'reason' => 'Partial series cancel',
        ]);
        $res->assertOk();

        $this->juniorMember->refresh();
        // 30 + 20 = 50 (must NOT become 30 + 70)
        $this->assertEquals(50.0, $this->juniorMember->credit);

        $this->assertDatabaseHas('transactions', [
            'member_id' => $this->juniorMember->id,
            'type' => 'refund',
            'amount' => 20.0,
        ]);
    }

    public function test_deleting_cancelled_training_does_not_process_duplicate_refund(): void
    {
        $tr = Training::create([
            'id' => 'tr_cancel_del_' . \Illuminate\Support\Str::random(4),
            'parent_id' => 'tr_cancel_del_parent',
            'name' => 'Monday Evening Coaching',
            'start_date' => now()->addDays(4),
            'end_date' => now()->addDays(4)->addHours(2),
            'sessions' => 3,
            'repeat_weeks' => 3,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 50.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);

        TrainingInvitation::create([
            'id' => 'ti_cancel_del_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
        ]);

        Transaction::create([
            'id' => 't_debit_del_' . \Illuminate\Support\Str::random(6),
            'member_id' => $this->juniorMember->id,
            'type' => 'debit',
            'amount' => 50.0,
            'description' => 'Training Program Session — Monday Evening Coaching',
            'date' => now(),
        ]);
        $this->juniorMember->update(['credit' => 300.0]); // Initial balance 350 - 50 = 300

        // Step 1: Admin cancels training -> Member receives $50 refund -> Balance = 350
        $response = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/cancel", [
            'reason' => 'Bad weather',
        ]);
        $response->assertOk();

        $this->juniorMember->refresh();
        $this->assertEquals(350.0, $this->juniorMember->credit);

        // Count refund transactions before delete
        $creditTxnCountBefore = Transaction::where('member_id', $this->juniorMember->id)
            ->whereIn('type', ['credit', 'refund'])
            ->count();

        // Step 2: Admin deletes the cancelled training
        $deleteResponse = $this->actingAs($this->admin)->deleteJson("/api/trainings/{$tr->id}");
        $deleteResponse->assertOk();

        // Step 3: Member wallet balance MUST remain $350 (no duplicate refund)
        $this->juniorMember->refresh();
        $this->assertEquals(350.0, $this->juniorMember->credit);

        // Verify NO new refund transaction was created during delete
        $creditTxnCountAfter = Transaction::where('member_id', $this->juniorMember->id)
            ->whereIn('type', ['credit', 'refund'])
            ->count();
        $this->assertEquals($creditTxnCountBefore, $creditTxnCountAfter);

        // Verify training record was deleted
        $this->assertDatabaseMissing('trainings', ['id' => $tr->id]);
    }

    public function test_deleting_cancelled_recurring_training_does_not_process_duplicate_refund(): void
    {
        // Parent session (Week 1)
        $tr1 = Training::create([
            'id' => 'tr_rec_del_1_' . \Illuminate\Support\Str::random(4),
            'parent_id' => 'tr_rec_del_parent_' . \Illuminate\Support\Str::random(4),
            'name' => 'Weekly Badminton - Week 1',
            'start_date' => now()->addDays(1),
            'end_date' => now()->addDays(1)->addHours(2),
            'sessions' => 2,
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 50.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);
        $tr1->update(['parent_id' => $tr1->id]);

        // Child session (Week 2)
        $tr2 = Training::create([
            'id' => 'tr_rec_del_2_' . \Illuminate\Support\Str::random(4),
            'parent_id' => $tr1->id,
            'name' => 'Weekly Badminton - Week 2',
            'start_date' => now()->addDays(8),
            'end_date' => now()->addDays(8)->addHours(2),
            'sessions' => 2,
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 50.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);

        TrainingInvitation::create([
            'id' => 'ti_rec_1_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr1->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
        ]);
        TrainingInvitation::create([
            'id' => 'ti_rec_2_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr2->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
        ]);

        // Member paid $50 total for training program
        Transaction::create([
            'id' => 't_debit_rec_' . \Illuminate\Support\Str::random(6),
            'member_id' => $this->juniorMember->id,
            'type' => 'debit',
            'amount' => 50.0,
            'description' => 'Training program invitation accepted: Weekly Badminton - Week 1',
            'date' => now(),
        ]);
        $this->juniorMember->update(['credit' => 300.0]); // Initial $350 - $50 = $300

        // Step 1: Admin cancels the monthly program -> refunds the full $50 deducted for both weeks
        $cancelRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr1->id}/cancel", [
            'reason' => 'Court unavailable',
        ]);
        $cancelRes->assertOk();

        $this->juniorMember->refresh();
        $this->assertEquals(350.0, $this->juniorMember->credit);
        $this->assertEquals('cancelled', $tr1->fresh()->status);
        $this->assertEquals('cancelled', $tr2->fresh()->status);

        // Step 2: Admin deletes the cancelled training
        $delRes = $this->actingAs($this->admin)->deleteJson("/api/trainings/{$tr1->id}");
        $delRes->assertOk();

        // Step 3: Member wallet balance MUST remain $350 (no duplicate refund on delete)
        $this->juniorMember->refresh();
        $this->assertEquals(350.0, $this->juniorMember->credit);
    }

    public function test_cancellation_refund_deducts_already_approved_attendance_refund(): void
    {
        $tr1 = Training::create([
            'id' => 'tr_att_rem_1_' . \Illuminate\Support\Str::random(4),
            'parent_id' => 'tr_att_rem_parent_' . \Illuminate\Support\Str::random(4),
            'name' => 'Badminton Coaching - Week 1',
            'start_date' => now()->addDays(1),
            'end_date' => now()->addDays(1)->addHours(2),
            'sessions' => 2,
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 50.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);
        $tr1->update(['parent_id' => $tr1->id]);

        $tr2 = Training::create([
            'id' => 'tr_att_rem_2_' . \Illuminate\Support\Str::random(4),
            'parent_id' => $tr1->id,
            'name' => 'Badminton Coaching - Week 2',
            'start_date' => now()->addDays(8),
            'end_date' => now()->addDays(8)->addHours(2),
            'sessions' => 2,
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 50.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);

        TrainingInvitation::create([
            'id' => 'ti_att_1_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr1->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
        ]);
        TrainingInvitation::create([
            'id' => 'ti_att_2_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr2->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
        ]);

        // Member accepted 2 weeks, total deducted = $50 ($25/week)
        Transaction::create([
            'id' => 't_deb_att_' . \Illuminate\Support\Str::random(6),
            'member_id' => $this->juniorMember->id,
            'type' => 'debit',
            'amount' => 50.0,
            'description' => 'Training program invitation accepted: Badminton Coaching - Week 1, Badminton Coaching - Week 2',
            'date' => now(),
        ]);
        $this->juniorMember->update(['credit' => 100.0]); // Starting balance after $50 deduction

        // Week 2 received a full attendance refund ($25)
        TrainingDate::create([
            'id' => 'td_att_2_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr2->id,
            'member_id' => $this->juniorMember->id,
            'date' => $tr2->start_date,
            'attended' => false,
            'refund_status' => 'full',
            'refund_amount' => 25.0,
        ]);
        Transaction::create([
            'id' => 't_cred_att_' . \Illuminate\Support\Str::random(6),
            'member_id' => $this->juniorMember->id,
            'type' => 'credit',
            'amount' => 25.0,
            'description' => 'Training session absent (Full Refund): Badminton Coaching - Week 2',
            'date' => now(),
        ]);
        $this->juniorMember->update(['credit' => 125.0]); // Wallet after attendance refund = 100 + 25 = 125

        // Admin cancels the training program
        $res = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr1->id}/cancel", [
            'reason' => 'Program cancelled',
        ]);
        $res->assertOk();

        // Formula: Remaining Refund = Total Deducted ($50) - Attendance Refund ($25) = $25
        // Member wallet must become 125 + 25 = 150
        $this->juniorMember->refresh();
        $this->assertEquals(150.0, $this->juniorMember->credit);

        // Assert 1 program cancellation refund for remaining $25
        $this->assertDatabaseHas('transactions', [
            'member_id' => $this->juniorMember->id,
            'type' => 'refund',
            'amount' => 25.0,
            'description' => 'Refund — cancelled training program for Child User: Badminton Coaching',
        ]);
    }

    public function test_cancellation_refund_is_zero_if_all_sessions_already_refunded_via_attendance(): void
    {
        $tr1 = Training::create([
            'id' => 'tr_full_att_1_' . \Illuminate\Support\Str::random(4),
            'parent_id' => 'tr_full_att_parent_' . \Illuminate\Support\Str::random(4),
            'name' => 'Tennis Coaching - Week 1',
            'start_date' => now()->addDays(1),
            'end_date' => now()->addDays(1)->addHours(2),
            'sessions' => 2,
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 50.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);
        $tr1->update(['parent_id' => $tr1->id]);

        $tr2 = Training::create([
            'id' => 'tr_full_att_2_' . \Illuminate\Support\Str::random(4),
            'parent_id' => $tr1->id,
            'name' => 'Tennis Coaching - Week 2',
            'start_date' => now()->addDays(8),
            'end_date' => now()->addDays(8)->addHours(2),
            'sessions' => 2,
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 50.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);

        TrainingInvitation::create([
            'id' => 'ti_full_1_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr1->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
        ]);
        TrainingInvitation::create([
            'id' => 'ti_full_2_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr2->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
        ]);

        // Member accepted 2 weeks, total deducted = $50
        Transaction::create([
            'id' => 't_deb_full_' . \Illuminate\Support\Str::random(6),
            'member_id' => $this->juniorMember->id,
            'type' => 'debit',
            'amount' => 50.0,
            'description' => 'Training program invitation accepted: Tennis Coaching - Week 1',
            'date' => now(),
        ]);
        $this->juniorMember->update(['credit' => 100.0]);

        // Week 1 and Week 2 both received full attendance refunds ($25 each)
        TrainingDate::create([
            'id' => 'td_full_1_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr1->id,
            'member_id' => $this->juniorMember->id,
            'date' => $tr1->start_date,
            'attended' => false,
            'refund_status' => 'full',
            'refund_amount' => 25.0,
        ]);
        TrainingDate::create([
            'id' => 'td_full_2_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr2->id,
            'member_id' => $this->juniorMember->id,
            'date' => $tr2->start_date,
            'attended' => false,
            'refund_status' => 'full',
            'refund_amount' => 25.0,
        ]);
        $this->juniorMember->update(['credit' => 150.0]); // Total wallet after both attendance refunds = 100 + 50 = 150

        $txnCountBefore = Transaction::where('member_id', $this->juniorMember->id)->count();

        // Admin cancels the training program
        $res = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr1->id}/cancel", [
            'reason' => 'Program cancelled',
        ]);
        $res->assertOk();

        // Formula: Remaining Refund = $50 - $50 = $0
        // Wallet balance MUST remain $150 and no new credit transaction created
        $this->juniorMember->refresh();
        $this->assertEquals(150.0, $this->juniorMember->credit);

        $txnCountAfter = Transaction::where('member_id', $this->juniorMember->id)->count();
        $this->assertEquals($txnCountBefore, $txnCountAfter);
    }

    /**
     * Regression: member paid €2.00 total for a 3-week invitation.
     * Cancelling the program must refund the full €2.00 deducted — not €0.67 (one week).
     */
    public function test_cancel_multi_week_program_refunds_exact_total_deducted_not_per_week(): void
    {
        $this->juniorMember->update(['credit' => 10.0]);

        // Keep all three weeks inside the same calendar month so cancel's monthly
        // program scope (same as close/delete) includes every paid session.
        $base = now()->startOfMonth()->addDays(2)->setTime(10, 0);
        $weeks = [];
        for ($i = 1; $i <= 3; $i++) {
            $start = $base->copy()->addDays(($i - 1) * 7);
            $weeks[$i] = Training::create([
                'id' => 'tr_mw_w' . $i . '_' . \Illuminate\Support\Str::random(4),
                'parent_id' => null,
                'name' => "Multi Week Coaching - Week {$i}",
                'start_date' => $start,
                'end_date' => $start->copy()->addHours(2),
                'sessions' => 3,
                'repeat_weeks' => 3,
                'repeat_months' => 1,
                'slots' => 10,
                'duration' => '2 Hours',
                'fees' => 2.0,
                'coach' => 'Coach Smith',
                'location' => 'Main Hall',
                'status' => 'released',
                'target_type' => 'junior',
            ]);
        }
        $weeks[1]->update(['parent_id' => $weeks[1]->id]);
        $weeks[2]->update(['parent_id' => $weeks[1]->id]);
        $weeks[3]->update(['parent_id' => $weeks[1]->id]);

        // Mirror accept-time cent split of a €2.00 lump across 3 weeks: 0.67 + 0.67 + 0.66
        $perSession = [1 => 0.67, 2 => 0.67, 3 => 0.66];
        foreach ($weeks as $i => $tr) {
            TrainingInvitation::create([
                'id' => 'ti_mw_' . $i . '_' . \Illuminate\Support\Str::random(4),
                'training_id' => $tr->id,
                'member_id' => $this->juniorMember->id,
                'status' => 'accepted',
                'accepted_amount' => $perSession[$i],
                'accepted_per_session_fee' => $perSession[$i],
                'accepted_monthly_fee' => 2.0,
                'accepted_repeat_weeks' => 3,
            ]);
        }

        Transaction::create([
            'id' => 't_mw_debit_' . \Illuminate\Support\Str::random(4),
            'member_id' => $this->juniorMember->id,
            'type' => 'debit',
            'amount' => 2.0,
            'description' => 'Training program invitation accepted for Child User: Multi Week Coaching - Week 1, Multi Week Coaching - Week 2, Multi Week Coaching - Week 3',
            'date' => now(),
        ]);
        $this->juniorMember->update(['credit' => 8.0]); // 10 - 2

        $res = $this->actingAs($this->admin)->postJson("/api/trainings/{$weeks[1]->id}/cancel", [
            'reason' => 'Program cancelled — full refund expected',
        ]);
        $res->assertOk();

        foreach ($weeks as $tr) {
            $this->assertEquals('cancelled', $tr->fresh()->status);
        }

        $this->juniorMember->refresh();
        $this->assertEquals(10.0, $this->juniorMember->credit);

        $refundTotal = (float) Transaction::where('member_id', $this->juniorMember->id)
            ->where('type', 'refund')
            ->sum('amount');
        $this->assertEquals(2.0, $refundTotal);

        // Idempotent: second cancel must not refund again
        $again = $this->actingAs($this->admin)->postJson("/api/trainings/{$weeks[1]->id}/cancel", [
            'reason' => 'Already cancelled',
        ]);
        $again->assertOk();
        $this->juniorMember->refresh();
        $this->assertEquals(10.0, $this->juniorMember->credit);
        $this->assertEquals(
            2.0,
            (float) Transaction::where('member_id', $this->juniorMember->id)->where('type', 'refund')->sum('amount')
        );
    }

    /**
     * Regression: single-week training cancellation refunds the exact amount deducted.
     */
    public function test_cancel_single_week_program_refunds_exact_amount_deducted(): void
    {
        $this->juniorMember->update(['credit' => 10.0]);

        $tr = Training::create([
            'id' => 'tr_sw_' . \Illuminate\Support\Str::random(4),
            'parent_id' => null,
            'name' => 'Single Week Coaching',
            'start_date' => now()->addDays(2),
            'end_date' => now()->addDays(2)->addHours(2),
            'sessions' => 1,
            'repeat_weeks' => 1,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 2.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);
        $tr->update(['parent_id' => $tr->id]);

        TrainingInvitation::create([
            'id' => 'ti_sw_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'accepted',
            'accepted_amount' => 2.0,
            'accepted_per_session_fee' => 2.0,
            'accepted_monthly_fee' => 2.0,
            'accepted_repeat_weeks' => 1,
        ]);
        Transaction::create([
            'id' => 't_sw_debit_' . \Illuminate\Support\Str::random(4),
            'member_id' => $this->juniorMember->id,
            'type' => 'debit',
            'amount' => 2.0,
            'description' => 'Training program invitation accepted for Child User: Single Week Coaching',
            'date' => now(),
        ]);
        $this->juniorMember->update(['credit' => 8.0]);

        $res = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/cancel", [
            'reason' => 'Single week cancel',
        ]);
        $res->assertOk();

        $this->juniorMember->refresh();
        $this->assertEquals(10.0, $this->juniorMember->credit);
        $this->assertDatabaseHas('transactions', [
            'member_id' => $this->juniorMember->id,
            'type' => 'refund',
            'amount' => 2.0,
        ]);
    }

    /**
     * Parent-linked junior: cancellation refunds the exact deducted total onto the shared parent wallet.
     */
    public function test_cancel_refunds_parent_linked_junior_wallet_exact_total(): void
    {
        $parentMember = Member::firstOrCreate(
            ['id' => 'm_parent_wallet_cancel'],
            [
                'user_id' => $this->memberUser->id,
                'first_name' => 'Parent',
                'last_name' => 'Adult',
                'email' => 'parent_adult_cancel@test.com',
                'sex' => 'male',
                'dob' => '1985-01-01',
                'member_type' => 'adult',
                'grade' => 'Grade A',
                'status' => 'active',
                'training_eligible' => true,
                'credit' => 20.0,
                'skip_credit_consumption' => false,
            ]
        );

        $linkedJunior = Member::firstOrCreate(
            ['id' => 'm_linked_junior_cancel'],
            [
                'parent_user_id' => $this->memberUser->id,
                'parent_member_id' => $parentMember->id,
                'first_name' => 'Linked',
                'last_name' => 'Junior',
                'email' => 'linked_junior_cancel@test.com',
                'sex' => 'female',
                'dob' => '2016-01-01',
                'member_type' => 'junior',
                'grade' => 'Grade A',
                'status' => 'active',
                'training_eligible' => true,
                'credit' => 0.0,
                'skip_credit_consumption' => false,
            ]
        );

        $tr1 = Training::create([
            'id' => 'tr_plink_1_' . \Illuminate\Support\Str::random(4),
            'parent_id' => null,
            'name' => 'Parent Link Coaching - Week 1',
            'start_date' => now()->addDays(3),
            'end_date' => now()->addDays(3)->addHours(1),
            'sessions' => 2,
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '1 Hour',
            'fees' => 2.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);
        $tr1->update(['parent_id' => $tr1->id]);

        $tr2 = Training::create([
            'id' => 'tr_plink_2_' . \Illuminate\Support\Str::random(4),
            'parent_id' => $tr1->id,
            'name' => 'Parent Link Coaching - Week 2',
            'start_date' => now()->addDays(10),
            'end_date' => now()->addDays(10)->addHours(1),
            'sessions' => 2,
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '1 Hour',
            'fees' => 2.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ]);

        foreach ([[$tr1, 1.0], [$tr2, 1.0]] as [$tr, $amt]) {
            TrainingInvitation::create([
                'id' => 'ti_plink_' . \Illuminate\Support\Str::random(4),
                'training_id' => $tr->id,
                'member_id' => $linkedJunior->id,
                'status' => 'accepted',
                'accepted_amount' => $amt,
                'accepted_per_session_fee' => $amt,
                'accepted_monthly_fee' => 2.0,
                'accepted_repeat_weeks' => 2,
            ]);
        }

        Transaction::create([
            'id' => 't_plink_debit_' . \Illuminate\Support\Str::random(4),
            'member_id' => $parentMember->id,
            'type' => 'debit',
            'amount' => 2.0,
            'description' => 'Training program invitation accepted for Linked Junior: Parent Link Coaching - Week 1, Parent Link Coaching - Week 2',
            'date' => now(),
        ]);
        $parentMember->update(['credit' => 18.0]);

        $res = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr1->id}/cancel", [
            'reason' => 'Parent-link full refund',
        ]);
        $res->assertOk();

        $parentMember->refresh();
        $linkedJunior->refresh();
        $this->assertEquals(20.0, $parentMember->credit);
        $this->assertEquals(0.0, $linkedJunior->credit);
        $this->assertEquals(
            2.0,
            (float) Transaction::where('member_id', $parentMember->id)->where('type', 'refund')->sum('amount')
        );
        $this->assertSame(
            0,
            Transaction::where('member_id', $linkedJunior->id)->where('type', 'refund')->count()
        );
    }

    /**
     * Screenshot regression: two juniors on one parent wallet each force-accepted a €10
     * 3-week Friday program. Cancelling must refund €10 per junior (€20 total to parent),
     * not ~€3.33/€3.34 with siblings stealing from a shared series pool.
     */
    public function test_cancel_refunds_ten_euro_full_amount_per_sibling_on_shared_parent_wallet(): void
    {
        $parent = Member::create([
            'id' => 'm_parent_euro10_' . \Illuminate\Support\Str::random(4),
            'user_id' => $this->memberUser->id,
            'first_name' => 'Member',
            'last_name' => '01',
            'email' => 'parent_euro10@test.com',
            'sex' => 'male',
            'dob' => '1985-01-01',
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
            'training_eligible' => true,
            'credit' => 100.0,
            'skip_credit_consumption' => false,
        ]);

        $junior11 = Member::create([
            'id' => 'm_j11_euro10_' . \Illuminate\Support\Str::random(4),
            'parent_user_id' => $this->memberUser->id,
            'parent_member_id' => $parent->id,
            'first_name' => 'Member',
            'last_name' => '11',
            'email' => 'j11_euro10@test.com',
            'sex' => 'female',
            'dob' => '2015-01-01',
            'member_type' => 'junior',
            'grade' => 'Grade A',
            'status' => 'active',
            'training_eligible' => true,
            'credit' => 0.0,
            'skip_credit_consumption' => false,
        ]);

        $junior111 = Member::create([
            'id' => 'm_j111_euro10_' . \Illuminate\Support\Str::random(4),
            'parent_user_id' => $this->memberUser->id,
            'parent_member_id' => $parent->id,
            'first_name' => 'member',
            'last_name' => '1111',
            'email' => 'j111_euro10@test.com',
            'sex' => 'female',
            'dob' => '2016-01-01',
            'member_type' => 'junior',
            'grade' => 'Grade A',
            'status' => 'active',
            'training_eligible' => true,
            'credit' => 0.0,
            'skip_credit_consumption' => false,
        ]);

        $base = now()->startOfMonth()->addDays(5)->setTime(19, 0);
        $weeks = [];
        for ($i = 1; $i <= 3; $i++) {
            $start = $base->copy()->addDays(($i - 1) * 7);
            $weeks[$i] = Training::create([
                'id' => 'tr_euro10_w' . $i . '_' . \Illuminate\Support\Str::random(4),
                'parent_id' => null,
                'name' => 'Friday · ' . $start->format('M j, Y') . ' · 7:00 PM',
                'start_date' => $start,
                'end_date' => $start->copy()->addHours(2),
                'sessions' => 3,
                'repeat_weeks' => 3,
                'repeat_months' => 1,
                'slots' => 10,
                'duration' => '2 Hours',
                'fees' => 10.0,
                'coach' => 'Coach Smith',
                'location' => 'Main Hall',
                'status' => 'released',
                'target_type' => 'junior',
            ]);
        }
        $weeks[1]->update(['parent_id' => $weeks[1]->id]);
        $weeks[2]->update(['parent_id' => $weeks[1]->id]);
        $weeks[3]->update(['parent_id' => $weeks[1]->id]);

        // Cent split of €10 across 3 weeks: 3.34 + 3.33 + 3.33
        $perSession = [1 => 3.34, 2 => 3.33, 3 => 3.33];

        foreach ([$junior11, $junior111] as $junior) {
            foreach ($weeks as $i => $tr) {
                TrainingInvitation::create([
                    'id' => 'ti_euro10_' . \Illuminate\Support\Str::random(6),
                    'training_id' => $tr->id,
                    'member_id' => $junior->id,
                    'status' => 'accepted',
                    'accepted_amount' => $perSession[$i],
                    'accepted_per_session_fee' => $perSession[$i],
                    'accepted_monthly_fee' => 10.0,
                    'accepted_repeat_weeks' => 3,
                ]);
            }

            Transaction::create([
                'id' => 't_euro10_deb_' . \Illuminate\Support\Str::random(4),
                'member_id' => $parent->id,
                'type' => 'debit',
                'amount' => 10.0,
                'description' => 'Training program invitation force accepted for ' . $junior->name . ': ' . $weeks[1]->name,
                'date' => now(),
            ]);
        }
        $parent->update(['credit' => 80.0]); // 100 - 10 - 10

        $res = $this->actingAs($this->admin)->postJson("/api/trainings/{$weeks[1]->id}/cancel", [
            'reason' => 'Screenshot regression — full €10 per member',
        ]);
        $res->assertOk();

        foreach ($weeks as $tr) {
            $this->assertEquals('cancelled', $tr->fresh()->status);
        }

        $parent->refresh();
        // Both juniors fully refunded onto the shared parent wallet.
        $this->assertEquals(100.0, $parent->credit);

        $refunds = Transaction::where('member_id', $parent->id)
            ->where('type', 'refund')
            ->orderBy('description')
            ->get();

        $this->assertCount(2, $refunds);
        $this->assertEquals(20.0, (float) $refunds->sum('amount'));

        $programLabel = $weeks[1]->name;
        $this->assertDatabaseHas('transactions', [
            'member_id' => $parent->id,
            'type' => 'refund',
            'amount' => 10.0,
            'description' => 'Refund — cancelled training program for Member 11: ' . $programLabel,
        ]);
        $this->assertDatabaseHas('transactions', [
            'member_id' => $parent->id,
            'type' => 'refund',
            'amount' => 10.0,
            'description' => 'Refund — cancelled training program for member 1111: ' . $programLabel,
        ]);

        // No refunds posted on the junior rows themselves.
        $this->assertSame(0, Transaction::whereIn('member_id', [$junior11->id, $junior111->id])->where('type', 'refund')->count());

        // Idempotent re-cancel: no duplicate refunds.
        $again = $this->actingAs($this->admin)->postJson("/api/trainings/{$weeks[1]->id}/cancel", [
            'reason' => 'Already cancelled',
        ]);
        $again->assertOk();
        $parent->refresh();
        $this->assertEquals(100.0, $parent->credit);
        $this->assertSame(2, Transaction::where('member_id', $parent->id)->where('type', 'refund')->count());
    }
}
