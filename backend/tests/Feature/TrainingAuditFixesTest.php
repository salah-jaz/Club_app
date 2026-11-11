<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Location;
use App\Models\Member;
use App\Models\Training;
use App\Models\TrainingDate;
use App\Models\TrainingInvitation;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Regression tests for the Training module audit fixes
 * (SEC-04, SEC-05, FIN-01..08, TRN-01, TRN-04, WAL-01, SYNC-01).
 */
class TrainingAuditFixesTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $parentUser;
    protected User $otherUser;
    protected Member $junior;
    protected Member $otherJunior;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'junior']);

        $this->admin = $this->makeUser('u_admin_audit', 'admin', true);
        $this->parentUser = $this->makeUser('u_parent_audit', 'member');
        $this->otherUser = $this->makeUser('u_other_audit', 'member');

        $this->junior = $this->makeJunior('m_junior_audit', $this->parentUser);
        $this->otherJunior = $this->makeJunior('m_junior_other_audit', $this->otherUser);
    }

    private function makeUser(string $id, string $role, bool $super = false): User
    {
        return User::create([
            'id' => $id,
            'first_name' => ucfirst($role),
            'last_name' => $id,
            'sex' => 'male',
            'dob' => '1985-01-01',
            'email' => $id . '@test.com',
            'mobile' => '+1' . random_int(1000000000, 9999999999),
            'address' => 'Test Address',
            'password' => bcrypt('password'),
            'role' => $role,
            'is_super_admin' => $super,
            'status' => 'active',
        ]);
    }

    private function makeJunior(string $id, User $owner, float $credit = 100.0): Member
    {
        return Member::create([
            'id' => $id,
            'user_id' => $owner->id,
            'first_name' => 'Junior',
            'last_name' => $id,
            'email' => $id . '@test.com',
            'sex' => 'female',
            'dob' => '2015-01-01',
            'member_type' => 'junior',
            'grade' => 'Grade A',
            'status' => 'active',
            'training_eligible' => true,
            'credit' => $credit,
            'skip_credit_consumption' => false,
        ]);
    }

    private function makeTraining(array $overrides = []): Training
    {
        $id = $overrides['id'] ?? 'tr_audit_' . Str::random(6);
        $tr = Training::create(array_merge([
            'id' => $id,
            'parent_id' => null,
            'name' => 'Audit Coaching ' . Str::random(4),
            'start_date' => now()->addDays(3),
            'end_date' => now()->addDays(3)->addHours(1),
            'sessions' => 3,
            'repeat_weeks' => 3,
            'repeat_months' => 1,
            'slots' => 10,
            'duration' => '1 Hour',
            'fees' => 60.0,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'released',
            'target_type' => 'junior',
        ], $overrides));

        if (empty($tr->parent_id)) {
            $tr->update(['parent_id' => $tr->id]);
        }

        return $tr->fresh();
    }

    private function acceptedInvite(Training $tr, Member $member, ?float $amount): TrainingInvitation
    {
        return TrainingInvitation::create([
            'id' => 'ti_audit_' . Str::random(6),
            'training_id' => $tr->id,
            'member_id' => $member->id,
            'status' => 'accepted',
            'accepted_amount' => $amount,
            'accepted_per_session_fee' => $amount,
            'accepted_monthly_fee' => (float) $tr->fees,
            'accepted_repeat_weeks' => (int) $tr->repeat_weeks,
        ]);
    }

    private function absentDate(Training $tr, Member $member): TrainingDate
    {
        return TrainingDate::create([
            'id' => 'td_audit_' . Str::random(6),
            'training_id' => $tr->id,
            'member_id' => $member->id,
            'date' => $tr->start_date,
            'attended' => false,
        ]);
    }

    public function test_member_cannot_process_refund(): void
    {
        $tr = $this->makeTraining();
        $this->acceptedInvite($tr, $this->junior, 20.0);
        $date = $this->absentDate($tr, $this->junior);

        $response = $this->actingAs($this->parentUser)->postJson("/api/training-dates/{$date->id}/process-refund", [
            'refundType' => 'full',
        ]);

        $response->assertStatus(403);
        $this->assertNull($date->fresh()->refund_status);
        $this->assertEquals(100.0, (float) $this->junior->fresh()->credit);
        $this->assertSame(0, Transaction::where('type', 'refund')->count());
    }

    public function test_process_refund_for_unpaid_session_is_rejected(): void
    {
        $tr = $this->makeTraining();
        // Accepted but nothing was paid (accepted_amount = 0)
        $this->acceptedInvite($tr, $this->junior, 0.0);
        $date = $this->absentDate($tr, $this->junior);

        $response = $this->actingAs($this->admin)->postJson("/api/training-dates/{$date->id}/process-refund", [
            'refundType' => 'full',
        ]);

        $response->assertStatus(422);
        $this->assertNull($date->fresh()->refund_status);
        $this->assertEquals(100.0, (float) $this->junior->fresh()->credit);
        $this->assertSame(0, Transaction::where('type', 'refund')->count());
    }

    public function test_process_refund_without_any_invitation_is_rejected(): void
    {
        $tr = $this->makeTraining();
        $date = $this->absentDate($tr, $this->junior);

        $this->actingAs($this->admin)->postJson("/api/training-dates/{$date->id}/process-refund", [
            'refundType' => 'half',
        ])->assertStatus(422);

        $this->assertEquals(100.0, (float) $this->junior->fresh()->credit);
    }

    public function test_process_refund_uses_accepted_amount_snapshot_and_cannot_be_repeated(): void
    {
        // Live fee would be 60 / 3 = 20, but the member actually paid 12 (snapshot).
        $tr = $this->makeTraining();
        $this->acceptedInvite($tr, $this->junior, 12.0);
        $date = $this->absentDate($tr, $this->junior);

        $first = $this->actingAs($this->admin)->postJson("/api/training-dates/{$date->id}/process-refund", [
            'refundType' => 'half',
        ]);
        $first->assertOk();

        $this->assertEquals(106.0, (float) $this->junior->fresh()->credit);
        $this->assertEquals(6.0, (float) $date->fresh()->refund_amount);

        $second = $this->actingAs($this->admin)->postJson("/api/training-dates/{$date->id}/process-refund", [
            'refundType' => 'full',
        ]);
        $second->assertStatus(422);
        $this->assertEquals(106.0, (float) $this->junior->fresh()->credit);
        $this->assertSame(1, Transaction::where('type', 'refund')->count());
    }

    public function test_process_refund_skipped_when_wallet_owner_skips_credit_consumption(): void
    {
        $parentMember = $this->makeJunior('m_wallet_parent_audit', $this->parentUser, 50.0);
        $parentMember->update(['member_type' => 'adult', 'skip_credit_consumption' => true]);
        $child = $this->makeJunior('m_wallet_child_audit', $this->parentUser, 0.0);
        $child->update(['parent_member_id' => $parentMember->id]);

        $tr = $this->makeTraining();
        $this->acceptedInvite($tr, $child, 20.0);
        $date = $this->absentDate($tr, $child);

        $this->actingAs($this->admin)->postJson("/api/training-dates/{$date->id}/process-refund", [
            'refundType' => 'full',
        ])->assertOk();

        $this->assertEquals(50.0, (float) $parentMember->fresh()->credit);
        $this->assertSame(0, Transaction::where('type', 'refund')->count());
    }

    public function test_enroll_debits_wallet_exactly_once(): void
    {
        // Monthly 60 / 3 weeks = 20 per session
        $tr = $this->makeTraining();

        $response = $this->actingAs($this->parentUser)->postJson("/api/trainings/{$tr->id}/enroll", [
            'memberIds' => [$this->junior->id],
        ]);

        $response->assertOk();
        $this->assertEquals(80.0, (float) $this->junior->fresh()->credit);
        $this->assertSame(1, Transaction::where('member_id', $this->junior->id)->where('type', 'debit')->count());
        $this->assertEquals(20.0, (float) Transaction::where('member_id', $this->junior->id)->where('type', 'debit')->value('amount'));

        $invite = TrainingInvitation::where('training_id', $tr->id)->where('member_id', $this->junior->id)->first();
        $this->assertEquals('accepted', $invite->status);
        $this->assertEquals(20.0, (float) $invite->accepted_amount);
    }

    public function test_enroll_with_insufficient_balance_is_rejected_without_debit(): void
    {
        $this->junior->update(['credit' => 5.0]);
        $tr = $this->makeTraining();

        $this->actingAs($this->parentUser)->postJson("/api/trainings/{$tr->id}/enroll", [
            'memberIds' => [$this->junior->id],
        ])->assertStatus(422);

        $this->assertEquals(5.0, (float) $this->junior->fresh()->credit);
        $this->assertSame(0, Transaction::where('type', 'debit')->count());
        $this->assertSame(0, TrainingInvitation::where('training_id', $tr->id)->count());
    }

    public function test_member_cannot_enroll_someone_elses_member_but_admin_can(): void
    {
        $tr = $this->makeTraining();

        $this->actingAs($this->parentUser)->postJson("/api/trainings/{$tr->id}/enroll", [
            'memberIds' => [$this->otherJunior->id],
        ])->assertStatus(422);
        $this->assertSame(0, TrainingInvitation::where('training_id', $tr->id)->count());

        $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/enroll", [
            'memberIds' => [$this->otherJunior->id],
        ])->assertOk();

        $this->assertEquals(80.0, (float) $this->otherJunior->fresh()->credit);
        $this->assertSame(1, Transaction::where('member_id', $this->otherJunior->id)->where('type', 'debit')->count());
    }

    public function test_invitation_respond_idor_returns_403(): void
    {
        $tr = $this->makeTraining();
        $invite = TrainingInvitation::create([
            'id' => 'ti_idor_' . Str::random(6),
            'training_id' => $tr->id,
            'member_id' => $this->otherJunior->id,
            'status' => 'open',
        ]);

        $single = $this->actingAs($this->parentUser)->postJson("/api/training-invitations/{$invite->id}/respond", [
            'status' => 'accepted',
        ]);
        $single->assertStatus(403);

        $bulk = $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$invite->id],
            'status' => 'accepted',
        ]);
        $bulk->assertStatus(403);

        $bulkDecline = $this->actingAs($this->parentUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => [$invite->id],
            'status' => 'declined',
        ]);
        $bulkDecline->assertStatus(403);

        $this->assertEquals('open', $invite->fresh()->status);
        $this->assertEquals(100.0, (float) $this->otherJunior->fresh()->credit);
    }

    public function test_owner_can_respond_to_own_invitation(): void
    {
        $tr = $this->makeTraining();
        $invite = TrainingInvitation::create([
            'id' => 'ti_own_' . Str::random(6),
            'training_id' => $tr->id,
            'member_id' => $this->junior->id,
            'status' => 'open',
        ]);

        $this->actingAs($this->parentUser)->postJson("/api/training-invitations/{$invite->id}/respond", [
            'status' => 'accepted',
        ])->assertOk();

        $this->assertEquals('accepted', $invite->fresh()->status);
        $this->assertEquals(80.0, (float) $this->junior->fresh()->credit);
    }

    public function test_pending_invitation_cannot_be_accepted_by_member(): void
    {
        $tr = $this->makeTraining();
        $invite = TrainingInvitation::create([
            'id' => 'ti_pend_' . Str::random(6),
            'training_id' => $tr->id,
            'member_id' => $this->junior->id,
            'status' => 'pending',
        ]);

        $this->actingAs($this->parentUser)->postJson("/api/training-invitations/{$invite->id}/respond", [
            'status' => 'accepted',
        ])->assertStatus(422);

        $this->assertEquals('pending', $invite->fresh()->status);
        $this->assertEquals(100.0, (float) $this->junior->fresh()->credit);
    }

    public function test_cancelled_training_cannot_be_accepted(): void
    {
        $tr = $this->makeTraining(['status' => 'cancelled']);
        $invite = TrainingInvitation::create([
            'id' => 'ti_canc_' . Str::random(6),
            'training_id' => $tr->id,
            'member_id' => $this->junior->id,
            'status' => 'open',
        ]);

        $this->actingAs($this->parentUser)->postJson("/api/training-invitations/{$invite->id}/respond", [
            'status' => 'accepted',
        ])->assertStatus(422);

        $this->assertEquals(100.0, (float) $this->junior->fresh()->credit);
    }

    public function test_member_cannot_cancel_training(): void
    {
        $tr = $this->makeTraining();
        $this->acceptedInvite($tr, $this->junior, 20.0);

        $response = $this->actingAs($this->parentUser)->postJson("/api/trainings/{$tr->id}/cancel", [
            'reason' => 'I want my money back',
        ]);

        $response->assertStatus(403);
        $this->assertEquals('released', $tr->fresh()->status);
        $this->assertEquals(100.0, (float) $this->junior->fresh()->credit);
        $this->assertSame(0, Transaction::where('type', 'refund')->count());
    }

    public function test_member_cannot_use_other_admin_only_training_endpoints(): void
    {
        $tr = $this->makeTraining();

        $this->actingAs($this->parentUser)->postJson("/api/trainings/{$tr->id}/close")->assertStatus(403);
        $this->actingAs($this->parentUser)->deleteJson("/api/trainings/{$tr->id}")->assertStatus(403);
        $this->actingAs($this->parentUser)->patchJson("/api/trainings/{$tr->id}", ['name' => 'Hacked'])->assertStatus(403);
        $this->actingAs($this->parentUser)->postJson("/api/trainings/{$tr->id}/release", [])->assertStatus(403);
        $this->actingAs($this->parentUser)->postJson("/api/trainings/{$tr->id}/process-overpayment-refund", [
            'memberId' => $this->junior->id,
            'amount' => 10,
        ])->assertStatus(403);
        $this->actingAs($this->parentUser)->postJson("/api/trainings/{$tr->id}/update-member-invitation", [
            'memberId' => $this->junior->id,
            'sessionIds' => [$tr->id],
            'forceAccept' => true,
        ])->assertStatus(403);

        $this->assertEquals('released', $tr->fresh()->status);
        $this->assertEquals(100.0, (float) $this->junior->fresh()->credit);
    }

    public function test_admin_without_permission_cannot_cancel_training(): void
    {
        $limitedAdmin = $this->makeUser('u_limited_admin_audit', 'admin', false);
        $tr = $this->makeTraining();

        $this->actingAs($limitedAdmin)->postJson("/api/trainings/{$tr->id}/cancel", [
            'reason' => 'No permission',
        ])->assertStatus(403);

        $this->assertEquals('released', $tr->fresh()->status);
    }

    public function test_update_cannot_set_cancelled_status(): void
    {
        $tr = $this->makeTraining();

        $this->actingAs($this->admin)->patchJson("/api/trainings/{$tr->id}", [
            'status' => 'cancelled',
        ])->assertStatus(422);

        $this->actingAs($this->admin)->patchJson("/api/trainings/{$tr->id}", [
            'status' => 'closed',
        ])->assertStatus(422);

        $this->assertEquals('released', $tr->fresh()->status);
    }

    public function test_overpayment_refund_is_capped_and_requires_accepted_invites(): void
    {
        $tr = $this->makeTraining();

        // No accepted invite -> rejected
        $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/process-overpayment-refund", [
            'memberId' => $this->junior->id,
            'amount' => 10,
        ])->assertStatus(422);
        $this->assertEquals(100.0, (float) $this->junior->fresh()->credit);

        // Paid 20 -> requesting 500 is capped to 20
        $this->acceptedInvite($tr, $this->junior, 20.0);
        $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/process-overpayment-refund", [
            'memberId' => $this->junior->id,
            'amount' => 500,
        ])->assertOk();

        $this->assertEquals(120.0, (float) $this->junior->fresh()->credit);

        // Nothing left to refund now
        $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/process-overpayment-refund", [
            'memberId' => $this->junior->id,
            'amount' => 5,
        ])->assertStatus(422);
        $this->assertEquals(120.0, (float) $this->junior->fresh()->credit);
    }

    public function test_cancelling_one_session_refunds_only_that_session(): void
    {
        $week1 = $this->makeTraining([
            'id' => 'tr_audit_w1_' . Str::random(4),
            'name' => 'Series Audit - Week 1',
            'start_date' => now()->addDays(3),
            'end_date' => now()->addDays(3)->addHour(),
        ]);
        $week2 = $this->makeTraining([
            'id' => 'tr_audit_w2_' . Str::random(4),
            'parent_id' => $week1->id,
            'name' => 'Series Audit - Week 2',
            'start_date' => now()->addDays(10),
            'end_date' => now()->addDays(10)->addHour(),
        ]);

        $this->acceptedInvite($week1, $this->junior, 20.0);
        $this->acceptedInvite($week2, $this->junior, 20.0);
        $this->junior->update(['credit' => 60.0]); // 100 - 40 paid

        $this->actingAs($this->admin)->postJson("/api/trainings/{$week1->id}/cancel", [
            'reason' => 'Coach sick',
        ])->assertOk();

        // Only week 1 (20) is refunded; week 2 payment is untouched.
        $this->assertEquals(80.0, (float) $this->junior->fresh()->credit);
        $this->assertSame(1, Transaction::where('member_id', $this->junior->id)->where('type', 'refund')->count());

        // Second cancel call is idempotent.
        $this->actingAs($this->admin)->postJson("/api/trainings/{$week1->id}/cancel", [
            'reason' => 'Coach sick again',
        ])->assertOk();
        $this->assertEquals(80.0, (float) $this->junior->fresh()->credit);

        // Week 2 is still accepted/paid.
        $this->assertEquals('accepted', TrainingInvitation::where('training_id', $week2->id)->where('member_id', $this->junior->id)->value('status'));
    }

    public function test_declining_after_paid_acceptance_refunds_once(): void
    {
        $tr = $this->makeTraining();
        $invite = $this->acceptedInvite($tr, $this->junior, 20.0);
        $this->absentDate($tr, $this->junior)->update(['attended' => null]);
        $this->junior->update(['credit' => 80.0]);

        $this->actingAs($this->parentUser)->postJson("/api/training-invitations/{$invite->id}/respond", [
            'status' => 'declined',
        ])->assertOk();

        $this->assertEquals(100.0, (float) $this->junior->fresh()->credit);
        $this->assertEquals('declined', $invite->fresh()->status);
        $this->assertEquals(0.0, (float) $invite->fresh()->accepted_amount);
        $this->assertSame(0, TrainingDate::where('training_id', $tr->id)->where('member_id', $this->junior->id)->count());

        // Declining again must not refund again, and a later cancel must not refund this session.
        $this->actingAs($this->parentUser)->postJson("/api/training-invitations/{$invite->id}/respond", [
            'status' => 'declined',
        ])->assertOk();
        $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/cancel", [
            'reason' => 'Cancelled after decline',
        ])->assertOk();

        $this->assertEquals(100.0, (float) $this->junior->fresh()->credit);
        $this->assertSame(1, Transaction::where('member_id', $this->junior->id)->where('type', 'refund')->count());
    }

    public function test_admin_list_invitations_get_does_not_mutate_data(): void
    {
        $tr = $this->makeTraining();
        $this->acceptedInvite($tr, $this->junior, 20.0);
        // Query-builder update bypasses the Member observer; the GET itself must not run the sync/refund.
        Member::where('id', $this->junior->id)->update(['training_eligible' => false]);

        $this->actingAs($this->admin)->getJson('/api/training-invitations')->assertOk();

        $this->assertSame(1, TrainingInvitation::where('training_id', $tr->id)->where('status', 'accepted')->count());
        $this->assertSame(0, Transaction::where('type', 'refund')->count());
    }
}
