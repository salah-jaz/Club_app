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
use App\Models\TrainingDate;
use App\Models\Transaction;
use App\Models\Setting;

class TrainingMemberDiscountTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $memberUser;
    protected Member $adultMember;
    protected Member $juniorMember;
    protected Member $noDiscountMember;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'junior']);
        Location::firstOrCreate(['name' => 'Court 1']);

        // Seed settings defaults
        Setting::updateOrCreate(['key' => 'adult_discount_mode'], ['value' => 'amount']);
        Setting::updateOrCreate(['key' => 'adult_discount_amount'], ['value' => '10']);
        Setting::updateOrCreate(['key' => 'adult_discount_percent'], ['value' => '20']);

        Setting::updateOrCreate(['key' => 'junior_discount_mode'], ['value' => 'amount']);
        Setting::updateOrCreate(['key' => 'junior_discount_amount'], ['value' => '15']);
        Setting::updateOrCreate(['key' => 'junior_discount_percent'], ['value' => '25']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_disc_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'Disc',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_disc@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->memberUser = User::firstOrCreate(
            ['id' => 'u_member_disc_test'],
            [
                'first_name' => 'Member',
                'last_name' => 'Disc',
                'sex' => 'female',
                'dob' => '1992-02-02',
                'email' => 'member_disc@test.com',
                'mobile' => '+1987654321',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->adultMember = Member::create([
            'id' => 'm_adult_disc',
            'user_id' => $this->memberUser->id,
            'first_name' => 'Adult',
            'last_name' => 'Discounted',
            'sex' => 'male',
            'dob' => '1995-01-01',
            'email' => 'adult_disc@test.com',
            'mobile' => '+1234567892',
            'address' => 'Test Address',
            'gender' => 'male',
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 500.00,
            'apply_discount' => true,
            'training_eligible' => true,
        ]);

        $this->juniorMember = Member::create([
            'id' => 'm_junior_disc',
            'user_id' => $this->memberUser->id,
            'first_name' => 'Junior',
            'last_name' => 'Discounted',
            'sex' => 'female',
            'dob' => '2010-05-05',
            'email' => 'junior_disc@test.com',
            'mobile' => '+1234567893',
            'address' => 'Test Address',
            'gender' => 'female',
            'member_type' => 'junior',
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 500.00,
            'apply_discount' => true,
            'training_eligible' => true,
        ]);

        $this->noDiscountMember = Member::create([
            'id' => 'm_nodisc',
            'user_id' => $this->memberUser->id,
            'first_name' => 'NoDiscount',
            'last_name' => 'Member',
            'sex' => 'male',
            'dob' => '1994-04-04',
            'email' => 'nodisc@test.com',
            'mobile' => '+1234567894',
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

    public function test_fixed_amount_discount_applied_for_adult_member()
    {
        // Set Adult Discount Mode = amount ($10 off)
        Setting::where('key', 'adult_discount_mode')->update(['value' => 'amount']);
        Setting::where('key', 'adult_discount_amount')->update(['value' => '10']);

        // Create Training: $100 monthly fee, repeat_weeks = 4 ($25 base/week)
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Adult Fixed Discount Program',
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

        $parent = Training::where('name', 'Adult Fixed Discount Program')->firstOrFail();
        $sessions = Training::where('parent_id', $parent->id)->orWhere('id', $parent->id)->get();
        $this->assertCount(4, $sessions);

        // Release first session to adultMember
        $firstSession = $sessions->first();
        $this->actingAs($this->admin)->postJson("/api/trainings/{$firstSession->id}/release", [
            'memberIds' => [$this->adultMember->id],
        ]);

        $inv = TrainingInvitation::where('training_id', $firstSession->id)
            ->where('member_id', $this->adultMember->id)
            ->firstOrFail();

        // Member responds 'accepted'
        // Monthly fee $100 - $10 discount = $90 discounted monthly fee.
        // Per session fee = $90 / 4 = $22.50.
        $initialCredit = $this->adultMember->fresh()->credit;
        $response = $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$inv->id}/respond", [
            'status' => 'accepted',
        ]);
        $response->assertStatus(200);

        $freshMember = $this->adultMember->fresh();
        $expectedDeducted = 22.50;
        $this->assertEquals(round($initialCredit - $expectedDeducted, 2), $freshMember->credit);

        // Verify transaction history records Original Fee, Discount, Amount Debited
        $txn = Transaction::where('member_id', $this->adultMember->id)->where('type', 'debit')->firstOrFail();
        $this->assertEquals(22.50, $txn->amount);
        $this->assertStringContainsString('Training Fee: $25.00', $txn->description);
        $this->assertStringContainsString('Discount: $2.50', $txn->description);
        $this->assertStringContainsString('Amount Debited: $22.50', $txn->description);
    }

    public function test_percentage_discount_applied_for_adult_member()
    {
        // Set Adult Discount Mode = percent (20% off)
        Setting::where('key', 'adult_discount_mode')->update(['value' => 'percent']);
        Setting::where('key', 'adult_discount_percent')->update(['value' => '20']);

        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Adult Percent Discount Program',
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

        $parent = Training::where('name', 'Adult Percent Discount Program')->firstOrFail();
        $firstSession = Training::where('parent_id', $parent->id)->orWhere('id', $parent->id)->firstOrFail();

        $this->actingAs($this->admin)->postJson("/api/trainings/{$firstSession->id}/release", [
            'memberIds' => [$this->adultMember->id],
        ]);

        $inv = TrainingInvitation::where('training_id', $firstSession->id)
            ->where('member_id', $this->adultMember->id)
            ->firstOrFail();

        // 20% off $100 monthly fee = $80 discounted monthly fee -> $20 per session.
        $initialCredit = $this->adultMember->fresh()->credit;
        $response = $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$inv->id}/respond", [
            'status' => 'accepted',
        ]);
        $response->assertStatus(200);

        $freshMember = $this->adultMember->fresh();
        $this->assertEquals(round($initialCredit - 20.00, 2), $freshMember->credit);

        $txn = Transaction::where('member_id', $this->adultMember->id)->where('type', 'debit')->firstOrFail();
        $this->assertEquals(20.00, $txn->amount);
        $this->assertStringContainsString('Training Fee: $25.00', $txn->description);
        $this->assertStringContainsString('Discount: $5.00', $txn->description);
        $this->assertStringContainsString('Amount Debited: $20.00', $txn->description);
    }

    public function test_adult_and_junior_discounts_applied_separately()
    {
        // Adult $10 fixed discount, Junior 25% percentage discount
        Setting::where('key', 'adult_discount_mode')->update(['value' => 'amount']);
        Setting::where('key', 'adult_discount_amount')->update(['value' => '10']);
        Setting::where('key', 'junior_discount_mode')->update(['value' => 'percent']);
        Setting::where('key', 'junior_discount_percent')->update(['value' => '25']);

        // Junior training program $100 fee, 4 weeks
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Separate Discount Program',
            'startDate' => '2026-08-01 10:00:00',
            'endDate' => '2026-08-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Alpha',
            'location' => 'Court 1',
            'targetType' => 'junior',
        ]);
        $res->assertStatus(201);

        $parent = Training::where('name', 'Junior Separate Discount Program')->firstOrFail();
        $firstSession = Training::where('parent_id', $parent->id)->orWhere('id', $parent->id)->firstOrFail();

        $this->actingAs($this->admin)->postJson("/api/trainings/{$firstSession->id}/release", [
            'memberIds' => [$this->juniorMember->id],
        ]);

        $inv = TrainingInvitation::where('training_id', $firstSession->id)
            ->where('member_id', $this->juniorMember->id)
            ->firstOrFail();

        // Junior 25% discount off $100 = $75 monthly -> $18.75 per session
        $initialCredit = $this->juniorMember->fresh()->credit;
        $response = $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$inv->id}/respond", [
            'status' => 'accepted',
        ]);
        $response->assertStatus(200);

        $freshMember = $this->juniorMember->fresh();
        $this->assertEquals(round($initialCredit - 18.75, 2), $freshMember->credit);
    }

    public function test_member_without_apply_discount_pays_full_amount()
    {
        Setting::where('key', 'adult_discount_mode')->update(['value' => 'amount']);
        Setting::where('key', 'adult_discount_amount')->update(['value' => '10']);

        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'No Discount Program',
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

        $parent = Training::where('name', 'No Discount Program')->firstOrFail();
        $firstSession = Training::where('parent_id', $parent->id)->orWhere('id', $parent->id)->firstOrFail();

        $this->actingAs($this->admin)->postJson("/api/trainings/{$firstSession->id}/release", [
            'memberIds' => [$this->noDiscountMember->id],
        ]);

        $inv = TrainingInvitation::where('training_id', $firstSession->id)
            ->where('member_id', $this->noDiscountMember->id)
            ->firstOrFail();

        // Apply discount is OFF -> pays full base per week fee $25
        $initialCredit = $this->noDiscountMember->fresh()->credit;
        $response = $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$inv->id}/respond", [
            'status' => 'accepted',
        ]);
        $response->assertStatus(200);

        $freshMember = $this->noDiscountMember->fresh();
        $this->assertEquals(round($initialCredit - 25.00, 2), $freshMember->credit);

        $txn = Transaction::where('member_id', $this->noDiscountMember->id)->where('type', 'debit')->firstOrFail();
        $this->assertEquals(25.00, $txn->amount);
    }

    public function test_refund_uses_discounted_per_session_fee()
    {
        Setting::where('key', 'adult_discount_mode')->update(['value' => 'amount']);
        Setting::where('key', 'adult_discount_amount')->update(['value' => '10']);

        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Refund Test Program',
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

        $parent = Training::where('name', 'Refund Test Program')->firstOrFail();
        $firstSession = Training::where('parent_id', $parent->id)->orWhere('id', $parent->id)->firstOrFail();

        $this->actingAs($this->admin)->postJson("/api/trainings/{$firstSession->id}/release", [
            'memberIds' => [$this->adultMember->id],
        ]);

        $inv = TrainingInvitation::where('training_id', $firstSession->id)
            ->where('member_id', $this->adultMember->id)
            ->firstOrFail();

        $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$inv->id}/respond", [
            'status' => 'accepted',
        ]);

        $tDate = TrainingDate::where('training_id', $firstSession->id)
            ->where('member_id', $this->adultMember->id)
            ->firstOrFail();

        // Mark absent
        $this->actingAs($this->admin)->patchJson("/api/training-dates/{$tDate->id}/attendance", [
            'attended' => false,
        ]);

        // Process full refund
        // Member paid $22.50 per session -> Full refund should be $22.50 (NOT $25.00)
        $creditBeforeRefund = $this->adultMember->fresh()->credit;
        $refundRes = $this->actingAs($this->admin)->postJson("/api/training-dates/{$tDate->id}/process-refund", [
            'refundType' => 'full',
        ]);
        $refundRes->assertStatus(200);

        $creditAfterRefund = $this->adultMember->fresh()->credit;
        $this->assertEquals(round($creditBeforeRefund + 22.50, 2), $creditAfterRefund);

        $tDateFresh = $tDate->fresh();
        $this->assertEquals('full', $tDateFresh->refund_status);
        $this->assertEquals(22.50, $tDateFresh->refund_amount);
    }

    public function test_partial_invited_weeks_calculation_with_discount()
    {
        // Monthly Fee: $100, Discount: $10 off, repeatWeeks: 4 -> Discounted Monthly: $90, Per Week: $22.50
        Setting::where('key', 'adult_discount_mode')->update(['value' => 'amount']);
        Setting::where('key', 'adult_discount_amount')->update(['value' => '10']);

        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Partial Weeks Program',
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

        $parent = Training::where('name', 'Partial Weeks Program')->firstOrFail();
        $sessions = Training::where('parent_id', $parent->id)->orWhere('id', $parent->id)->orderBy('start_date', 'asc')->get();
        $this->assertCount(4, $sessions);

        // Admin invites member for only 3 weeks out of 4
        $threeSessionIds = $sessions->take(3)->pluck('id')->all();
        $updateInvRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$parent->id}/update-member-invitation", [
            'memberId' => $this->adultMember->id,
            'sessionIds' => $threeSessionIds,
        ]);
        $updateInvRes->assertStatus(200);

        // Fetch the 3 invitations created for the member
        $memberInvs = TrainingInvitation::whereIn('training_id', $threeSessionIds)
            ->where('member_id', $this->adultMember->id)
            ->get();
        $this->assertCount(3, $memberInvs);

        // Member accepts bulk invitations for the 3 weeks
        $initialCredit = $this->adultMember->fresh()->credit;
        $respondRes = $this->actingAs($this->memberUser)->postJson('/api/training-invitations/respond-bulk', [
            'inviteIds' => $memberInvs->pluck('id')->all(),
            'status' => 'accepted',
        ]);
        $respondRes->assertStatus(200);

        // Discounted Monthly = $90, Per Week = $22.50, 3 Weeks = $67.50
        $freshMember = $this->adultMember->fresh();
        $this->assertEquals(round($initialCredit - 67.50, 2), $freshMember->credit);

        $txn = Transaction::where('member_id', $this->adultMember->id)->where('type', 'debit')->firstOrFail();
        $this->assertEquals(67.50, $txn->amount);
        $this->assertStringContainsString('Training Fee: $75.00', $txn->description);
        $this->assertStringContainsString('Discount: $7.50', $txn->description);
        $this->assertStringContainsString('Amount Debited: $67.50', $txn->description);
    }
}
