<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use App\Models\User;
use App\Models\Member;
use App\Models\Grade;
use App\Models\Location;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\Transaction;
use App\Models\Setting;

class TrainingDiscountSnapshotTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $memberUser;
    protected Member $discountedMember;
    protected Member $regularMember;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'junior']);
        Location::firstOrCreate(['name' => 'Court 1']);

        // Set Adult Discount Mode = amount ($10 off $100 monthly fee)
        Setting::updateOrCreate(['key' => 'adult_discount_mode'], ['value' => 'amount']);
        Setting::updateOrCreate(['key' => 'adult_discount_amount'], ['value' => '10']);
        Setting::updateOrCreate(['key' => 'adult_discount_percent'], ['value' => '0']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_snap'],
            [
                'first_name' => 'Admin',
                'last_name' => 'Snap',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_snap@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->memberUser = User::firstOrCreate(
            ['id' => 'u_member_snap'],
            [
                'first_name' => 'MemberUser',
                'last_name' => 'Snap',
                'sex' => 'male',
                'dob' => '1992-02-02',
                'email' => 'member_snap@test.com',
                'mobile' => '+1987654321',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        // Member A: apply_discount = true (Member 11, 12, 13 equivalent)
        $this->discountedMember = Member::create([
            'id' => 'm_disc_snap_a',
            'user_id' => $this->memberUser->id,
            'first_name' => 'MemberA',
            'last_name' => 'Discounted',
            'sex' => 'male',
            'dob' => '1995-01-01',
            'email' => 'member_a@test.com',
            'mobile' => '+1234567891',
            'address' => 'Test Address',
            'gender' => 'male',
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 500.00,
            'apply_discount' => true,
            'training_eligible' => true,
        ]);

        // Member B: apply_discount = false (Member 14, 15, 16 equivalent)
        $this->regularMember = Member::create([
            'id' => 'm_disc_snap_b',
            'user_id' => $this->memberUser->id,
            'first_name' => 'MemberB',
            'last_name' => 'Regular',
            'sex' => 'male',
            'dob' => '1996-02-02',
            'email' => 'member_b@test.com',
            'mobile' => '+1234567892',
            'address' => 'Test Address',
            'gender' => 'male',
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 500.00,
            'apply_discount' => false,
            'training_eligible' => true,
        ]);
    }

    public function test_discount_eligibility_snapshotted_at_training_creation()
    {
        // Admin creates Training P1 ($100 fee, 4 weeks)
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Snapshot Program P1',
            'startDate' => '2026-08-01 10:00:00',
            'endDate' => '2026-08-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Alpha',
            'location' => 'Court 1',
            'targetType' => 'adult',
        ]);
        $res->assertStatus(201);

        $parentP1 = Training::where('name', 'Snapshot Program P1')->firstOrFail();
        $this->actingAs($this->admin)->postJson("/api/trainings/{$parentP1->id}/release");

        // Verify Member A invitation: apply_discount = true, monthly = $90, per session = $22.50
        $invA = TrainingInvitation::where('training_id', $parentP1->id)
            ->where('member_id', $this->discountedMember->id)
            ->firstOrFail();
        $this->assertTrue((bool)$invA->apply_discount);
        $this->assertEquals(90.00, $invA->calculated_monthly_fee);
        $this->assertEquals(22.50, $invA->calculated_per_session_fee);

        // Verify Member B invitation: apply_discount = false, monthly = $100, per session = $25.00
        $invB = TrainingInvitation::where('training_id', $parentP1->id)
            ->where('member_id', $this->regularMember->id)
            ->firstOrFail();
        $this->assertFalse((bool)$invB->apply_discount);
        $this->assertEquals(100.00, $invB->calculated_monthly_fee);
        $this->assertEquals(25.00, $invB->calculated_per_session_fee);
    }

    public function test_editing_member_discount_does_not_affect_existing_training()
    {
        // 1. Create Training P1 when Member B has apply_discount = false
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Snapshot Program P1',
            'startDate' => '2026-08-01 10:00:00',
            'endDate' => '2026-08-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Alpha',
            'location' => 'Court 1',
            'targetType' => 'adult',
        ]);
        $parentP1 = Training::where('name', 'Snapshot Program P1')->firstOrFail();
        $this->actingAs($this->admin)->postJson("/api/trainings/{$parentP1->id}/release");

        $invBBefore = TrainingInvitation::where('training_id', $parentP1->id)
            ->where('member_id', $this->regularMember->id)
            ->firstOrFail();
        $this->assertFalse((bool)$invBBefore->apply_discount);
        $this->assertEquals(100.00, $invBBefore->calculated_monthly_fee);

        // 2. Admin edits Member B and enables apply_discount = true
        $updateRes = $this->actingAs($this->admin)->patchJson("/api/members/{$this->regularMember->id}", [
            'applyDiscount' => true,
        ]);
        $updateRes->assertStatus(200);
        $this->assertTrue((bool)$this->regularMember->fresh()->apply_discount);

        // 3. Existing Training P1 invitation MUST REMAIN $100 ($25/session) for Member B
        $invBAfter = TrainingInvitation::where('training_id', $parentP1->id)
            ->where('member_id', $this->regularMember->id)
            ->firstOrFail();
        $this->assertFalse((bool)$invBAfter->apply_discount);
        $this->assertEquals(100.00, $invBAfter->calculated_monthly_fee);
        $this->assertEquals(25.00, $invBAfter->calculated_per_session_fee);

        // 4. Member B accepts invitation for P1 -> Wallet is debited $25.00 (NOT $22.50)
        $creditBefore = $this->regularMember->fresh()->credit;
        $respondRes = $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$invBAfter->id}/respond", [
            'status' => 'accepted',
        ]);
        $respondRes->assertStatus(200);

        $creditAfter = $this->regularMember->fresh()->credit;
        $this->assertEquals(round($creditBefore - 25.00, 2), $creditAfter);

        $txn = Transaction::where('member_id', $this->regularMember->id)->where('type', 'debit')->firstOrFail();
        $this->assertEquals(25.00, $txn->amount);
    }

    public function test_editing_member_discount_applies_to_future_trainings_only()
    {
        // 1. Admin edits Member B and enables apply_discount = true
        $this->actingAs($this->admin)->patchJson("/api/members/{$this->regularMember->id}", [
            'applyDiscount' => true,
        ]);
        $this->assertTrue((bool)$this->regularMember->fresh()->apply_discount);

        // 2. Admin creates NEW Training P2 ($100 fee, 4 weeks) AFTER member edit
        $resP2 = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Snapshot Program P2',
            'startDate' => '2026-09-01 10:00:00',
            'endDate' => '2026-09-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Alpha',
            'location' => 'Court 1',
            'targetType' => 'adult',
        ]);
        $resP2->assertStatus(201);

        $parentP2 = Training::where('name', 'Snapshot Program P2')->firstOrFail();
        $this->actingAs($this->admin)->postJson("/api/trainings/{$parentP2->id}/release");

        // 3. Member B invitation for P2 NOW receives the discounted fee ($90 monthly, $22.50 per session)
        $invBP2 = TrainingInvitation::where('training_id', $parentP2->id)
            ->where('member_id', $this->regularMember->id)
            ->firstOrFail();
        $this->assertTrue((bool)$invBP2->apply_discount);
        $this->assertEquals(90.00, $invBP2->calculated_monthly_fee);
        $this->assertEquals(22.50, $invBP2->calculated_per_session_fee);

        // 4. Member B accepts invitation for P2 -> Wallet is debited $22.50
        $creditBefore = $this->regularMember->fresh()->credit;
        $respondRes = $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$invBP2->id}/respond", [
            'status' => 'accepted',
        ]);
        $respondRes->assertStatus(200);

        $creditAfter = $this->regularMember->fresh()->credit;
        $this->assertEquals(round($creditBefore - 22.50, 2), $creditAfter);

        $txn = Transaction::where('member_id', $this->regularMember->id)->where('type', 'debit')->firstOrFail();
        $this->assertEquals(22.50, $txn->amount);
    }

    public function test_toggling_member_discount_off_does_not_affect_existing_training()
    {
        // 1. Create Training P1 when Member A has apply_discount = true
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Snapshot Program P1',
            'startDate' => '2026-08-01 10:00:00',
            'endDate' => '2026-08-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Alpha',
            'location' => 'Court 1',
            'targetType' => 'adult',
        ]);
        $parentP1 = Training::where('name', 'Snapshot Program P1')->firstOrFail();
        $this->actingAs($this->admin)->postJson("/api/trainings/{$parentP1->id}/release");

        $invABefore = TrainingInvitation::where('training_id', $parentP1->id)
            ->where('member_id', $this->discountedMember->id)
            ->firstOrFail();
        $this->assertTrue((bool)$invABefore->apply_discount);
        $this->assertEquals(90.00, $invABefore->calculated_monthly_fee);
        $this->assertEquals(22.50, $invABefore->calculated_per_session_fee);

        // 2. Admin edits Member A and disables apply_discount = false
        $this->actingAs($this->admin)->patchJson("/api/members/{$this->discountedMember->id}", [
            'applyDiscount' => false,
        ]);
        $this->assertFalse((bool)$this->discountedMember->fresh()->apply_discount);

        // 3. Existing Training P1 invitation for Member A MUST REMAIN $90 ($22.50/session)
        $invAAfter = TrainingInvitation::where('training_id', $parentP1->id)
            ->where('member_id', $this->discountedMember->id)
            ->firstOrFail();
        $this->assertTrue((bool)$invAAfter->apply_discount);
        $this->assertEquals(90.00, $invAAfter->calculated_monthly_fee);
        $this->assertEquals(22.50, $invAAfter->calculated_per_session_fee);

        // 4. Member A accepts invitation -> Wallet debited snapshotted $22.50
        $creditBefore = $this->discountedMember->fresh()->credit;
        $respondRes = $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$invAAfter->id}/respond", [
            'status' => 'accepted',
        ]);
        $respondRes->assertStatus(200);

        $creditAfter = $this->discountedMember->fresh()->credit;
        $this->assertEquals(round($creditBefore - 22.50, 2), $creditAfter);
    }

    public function test_changing_global_discount_mode_to_off_does_not_affect_existing_training()
    {
        // 1. Create Training P1 when Adult Discount Mode = amount ($10 off $100)
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Snapshot Program P1',
            'startDate' => '2026-08-01 10:00:00',
            'endDate' => '2026-08-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Alpha',
            'location' => 'Court 1',
            'targetType' => 'adult',
        ]);
        $parentP1 = Training::where('name', 'Snapshot Program P1')->firstOrFail();
        $this->actingAs($this->admin)->postJson("/api/trainings/{$parentP1->id}/release");

        $invA = TrainingInvitation::where('training_id', $parentP1->id)
            ->where('member_id', $this->discountedMember->id)
            ->firstOrFail();
        $this->assertEquals(90.00, $invA->calculated_monthly_fee);
        $this->assertEquals(22.50, $invA->calculated_per_session_fee);

        // 2. Admin changes Global Settings: adultDiscountMode = 'off'
        $settingRes = $this->actingAs($this->admin)->postJson('/api/settings', [
            'adultDiscountMode' => 'off',
        ]);
        $settingRes->assertStatus(200);

        // 3. Existing Training P1 invitation for Member A STILL HAS $90 ($22.50/session)
        $invAExisting = TrainingInvitation::where('training_id', $parentP1->id)
            ->where('member_id', $this->discountedMember->id)
            ->firstOrFail();
        $this->assertEquals(90.00, $invAExisting->calculated_monthly_fee);
        $this->assertEquals(22.50, $invAExisting->calculated_per_session_fee);

        // 4. Admin creates NEW Training P2 AFTER setting discount mode to 'off'
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Snapshot Program P2',
            'startDate' => '2026-09-01 10:00:00',
            'endDate' => '2026-09-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Alpha',
            'location' => 'Court 1',
            'targetType' => 'adult',
        ]);
        $parentP2 = Training::where('name', 'Snapshot Program P2')->firstOrFail();
        $this->actingAs($this->admin)->postJson("/api/trainings/{$parentP2->id}/release");

        // 5. Member A invitation for NEW P2 gets full price $100 ($25.00/session)
        $invAP2 = TrainingInvitation::where('training_id', $parentP2->id)
            ->where('member_id', $this->discountedMember->id)
            ->firstOrFail();
        $this->assertEquals(100.00, $invAP2->calculated_monthly_fee);
        $this->assertEquals(25.00, $invAP2->calculated_per_session_fee);
    }

    public function test_attendance_refund_uses_snapshotted_fee_after_discount_settings_change()
    {
        // 1. Create Training P1 when Adult Discount Mode = amount ($10 off $100)
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Snapshot Program P1',
            'startDate' => '2026-08-01 10:00:00',
            'endDate' => '2026-08-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Alpha',
            'location' => 'Court 1',
            'targetType' => 'adult',
        ]);
        $parentP1 = Training::where('name', 'Snapshot Program P1')->firstOrFail();
        $this->actingAs($this->admin)->postJson("/api/trainings/{$parentP1->id}/release");

        $invA = TrainingInvitation::where('training_id', $parentP1->id)
            ->where('member_id', $this->discountedMember->id)
            ->firstOrFail();

        // 2. Member A accepts invitation
        $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$invA->id}/respond", [
            'status' => 'accepted',
        ]);

        $tDate = \App\Models\TrainingDate::where('training_id', $parentP1->id)
            ->where('member_id', $this->discountedMember->id)
            ->firstOrFail();

        // 3. Admin changes Global Settings: adultDiscountMode = 'off' and Member A apply_discount = false
        Setting::where('key', 'adult_discount_mode')->update(['value' => 'off']);
        $this->discountedMember->update(['apply_discount' => false]);

        $tDate->update(['attended' => false]);

        // 4. Admin processes Full Attendance Refund for Member A
        $creditBeforeRefund = $this->discountedMember->fresh()->credit;
        $refundRes = $this->actingAs($this->admin)->postJson("/api/training-dates/{$tDate->id}/process-refund", [
            'memberId' => $this->discountedMember->id,
            'refundType' => 'full',
        ]);
        $refundRes->assertStatus(200);

        // Refund must be $22.50 (snapshotted per-session fee), NOT $25.00
        $creditAfterRefund = $this->discountedMember->fresh()->credit;
        $this->assertEquals(round($creditBeforeRefund + 22.50, 2), $creditAfterRefund);
    }
}
