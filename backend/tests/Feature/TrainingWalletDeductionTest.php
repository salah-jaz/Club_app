<?php

namespace Tests\Feature;

use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\User;
use App\Models\Member;
use App\Models\Transaction;
use App\Models\Location;
use App\Models\Grade;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class TrainingWalletDeductionTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;
    protected User $memberUser;
    protected Member $juniorMember;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        $grade = Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'junior']);
        Training::query()->delete();

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_wallet_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_wallet@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->memberUser = User::firstOrCreate(
            ['id' => 'u_parent_wallet_test'],
            [
                'first_name' => 'Parent',
                'last_name' => 'User',
                'sex' => 'female',
                'dob' => '1988-05-05',
                'email' => 'parent_wallet@test.com',
                'mobile' => '+1987654321',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->juniorMember = Member::firstOrCreate(
            ['id' => 'm_child_wallet_test'],
            [
                'user_id' => $this->memberUser->id,
                'first_name' => 'Junior',
                'last_name' => 'Player',
                'sex' => 'male',
                'dob' => '2015-01-01',
                'email' => 'junior_wallet@test.com',
                'mobile' => '+1234567891',
                'address' => 'Test Address',
                'member_type' => 'junior',
                'grade' => $grade->name,
                'credit' => 100.0,
                'training_eligible' => true,
                'status' => 'active',
                'skip_credit_consumption' => false,
            ]
        );
    }

    public function test_accept_training_invitation_deducts_per_week_fee_and_creates_transaction()
    {
        // Monthly Fee = $120, Repeat Weeks = 4 => Per week fee = $30
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Elite Junior Training',
            'startDate' => '2026-07-01 10:00:00',
            'endDate' => '2026-07-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $sessions = Training::orderBy('start_date', 'asc')->get();
        $jul1 = $sessions[0];
        $jul8 = $sessions[1];

        // Release invitations for Jul 1 and Jul 8
        $this->actingAs($this->admin)->postJson("/api/trainings/{$jul1->id}/release", [
            'memberIds' => [$this->juniorMember->id],
        ]);
        $this->actingAs($this->admin)->postJson("/api/trainings/{$jul8->id}/release", [
            'memberIds' => [$this->juniorMember->id],
        ]);

        $invJul1 = TrainingInvitation::where('training_id', $jul1->id)->where('member_id', $this->juniorMember->id)->firstOrFail();
        $invJul8 = TrainingInvitation::where('training_id', $jul8->id)->where('member_id', $this->juniorMember->id)->firstOrFail();

        $initialBalance = $this->juniorMember->credit; // 100.00

        // Member accepts Jul 1 invitation
        $res1 = $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$invJul1->id}/respond", [
            'status' => 'accepted',
        ]);
        $res1->assertStatus(200);
        $res1->assertJson(['status' => 'accepted']);

        $this->juniorMember->refresh();
        $this->assertEquals(70.0, $this->juniorMember->credit); // 100 - 30 = 70

        $txn1 = Transaction::where('member_id', $this->juniorMember->id)->where('type', 'debit')->get();
        $this->assertCount(1, $txn1);
        $this->assertEquals(30.0, $txn1[0]->amount);

        // Member accepts Jul 8 invitation
        $res2 = $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$invJul8->id}/respond", [
            'status' => 'accepted',
        ]);
        $res2->assertStatus(200);

        $this->juniorMember->refresh();
        $this->assertEquals(40.0, $this->juniorMember->credit); // 70 - 30 = 40 (Total deducted $60)

        $txns = Transaction::where('member_id', $this->juniorMember->id)->where('type', 'debit')->get();
        $this->assertCount(2, $txns);
    }

    public function test_insufficient_wallet_balance_blocks_acceptance()
    {
        $this->juniorMember->update(['credit' => 20.0]); // Less than $30

        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Elite Junior Training',
            'startDate' => '2026-07-01 10:00:00',
            'endDate' => '2026-07-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 120, // Per week fee = $30
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $jul1 = Training::orderBy('start_date', 'asc')->first();

        $this->actingAs($this->admin)->postJson("/api/trainings/{$jul1->id}/release", [
            'memberIds' => [$this->juniorMember->id],
        ]);

        $inv = TrainingInvitation::where('training_id', $jul1->id)->where('member_id', $this->juniorMember->id)->firstOrFail();

        $res = $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$inv->id}/respond", [
            'status' => 'accepted',
        ]);

        $res->assertStatus(422);
        $res->assertJsonFragment(['message' => 'Insufficient wallet balance. Please add funds before accepting this training invitation.']);

        $inv->refresh();
        $this->assertEquals('open', $inv->status);

        $this->juniorMember->refresh();
        $this->assertEquals(20.0, $this->juniorMember->credit);

        $txn = Transaction::where('member_id', $this->juniorMember->id)->count();
        $this->assertEquals(0, $txn);
    }

    public function test_prevents_duplicate_deduction_on_re_accept()
    {
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Elite Junior Training',
            'startDate' => '2026-07-01 10:00:00',
            'endDate' => '2026-07-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $jul1 = Training::orderBy('start_date', 'asc')->first();

        $this->actingAs($this->admin)->postJson("/api/trainings/{$jul1->id}/release", [
            'memberIds' => [$this->juniorMember->id],
        ]);

        $inv = TrainingInvitation::where('training_id', $jul1->id)->where('member_id', $this->juniorMember->id)->firstOrFail();

        // First accept
        $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$inv->id}/respond", [
            'status' => 'accepted',
        ])->assertStatus(200);

        $this->juniorMember->refresh();
        $this->assertEquals(70.0, $this->juniorMember->credit);

        // Second accept attempt
        $res2 = $this->actingAs($this->memberUser)->postJson("/api/training-invitations/{$inv->id}/respond", [
            'status' => 'accepted',
        ]);
        $res2->assertStatus(200);

        // Balance must remain 70.0, transactions count must remain 1
        $this->juniorMember->refresh();
        $this->assertEquals(70.0, $this->juniorMember->credit);

        $txn = Transaction::where('member_id', $this->juniorMember->id)->count();
        $this->assertEquals(1, $txn);
    }
}
