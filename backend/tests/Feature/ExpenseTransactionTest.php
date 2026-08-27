<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Member;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExpenseTransactionTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Member $member;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_expense_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1980-01-01',
                'email' => 'admin.expense@test.com',
                'mobile' => '+1234567890',
                'address' => 'Admin Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);

        $this->member = Member::firstOrCreate(
            ['id' => 'm_member_expense_test'],
            [
                'user_id' => $this->admin->id,
                'member_type' => 'adult',
                'status' => 'active',
                'membership' => true,
                'credit' => 100.00,
                'first_name' => 'Sample',
                'last_name' => 'Member',
                'email' => 'sample.member@test.com',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'grade' => 'Grade A',
            ]
        );
    }

    public function test_add_expense_does_not_deduct_member_balance_and_records_transaction(): void
    {
        $initialCredit = $this->member->credit;

        $response = $this->actingAs($this->admin)->postJson('/api/credit-requests', [
            'amount' => 50.00,
            'date' => '2026-08-25',
            'type' => 'expense',
            'reason' => '[Equipment] Purchased 2 new badminton nets',
        ]);

        $response->assertStatus(201);

        // 1. Member balance remains untouched (no credit deduction)
        $this->member->refresh();
        $this->assertEquals($initialCredit, $this->member->credit);

        // 2. Expense recorded in credit_requests and transactions
        $this->assertDatabaseHas('credit_requests', [
            'type' => 'expense',
            'amount' => 50.00,
            'reason' => '[Equipment] Purchased 2 new badminton nets',
            'status' => 'approved',
        ]);

        $this->assertDatabaseHas('transactions', [
            'type' => 'expense',
            'amount' => 50.00,
            'description' => '[Equipment] Purchased 2 new badminton nets',
        ]);

        // 3. Appears in transactions endpoint list
        $txnsResponse = $this->actingAs($this->admin)->getJson('/api/transactions');
        $txnsResponse->assertStatus(200);
        $txnsResponse->assertJsonFragment([
            'type' => 'expense',
            'amount' => 50.00,
            'description' => '[Equipment] Purchased 2 new badminton nets',
        ]);
    }
}
