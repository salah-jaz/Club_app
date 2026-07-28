<?php

namespace Tests\Feature;

use App\Models\CreditRequest;
use App\Models\Grade;
use App\Models\Member;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class WalletTransactionDeleteTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;
    protected Member $member;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_wallet_del_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'Tester',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_wallet_del@test.com',
                'mobile' => '+1234567891',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $memberUser = User::create([
            'id' => 'u_member_wallet_del_test',
            'first_name' => 'John',
            'last_name' => 'Doe',
            'sex' => 'male',
            'dob' => '1995-05-05',
            'email' => 'john_wallet_del@test.com',
            'mobile' => '+1234567892',
            'address' => 'Member Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->member = Member::create([
            'id' => 'm_wallet_del_test',
            'user_id' => $memberUser->id,
            'first_name' => 'John',
            'last_name' => 'Doe',
            'sex' => 'male',
            'dob' => '1995-05-05',
            'grade' => 'Grade A',
            'email' => 'john_wallet_del@test.com',
            'credit' => 0.00,
            'membership' => true,
            'member_type' => 'adult',
            'status' => 'active',
        ]);
    }

    public function test_delete_and_reverse_credit_transaction_from_wallet_history()
    {
        // Member balance = $0. Add credit +$100
        $response = $this->actingAs($this->admin)->postJson('/api/credit-requests', [
            'memberId' => $this->member->id,
            'amount' => 100.00,
            'date' => now()->toDateString(),
            'type' => 'credit',
        ]);

        $response->assertStatus(201);
        $crId = $response->json('id');

        $this->member->refresh();
        $this->assertEquals(100.00, (float) $this->member->credit);
        $this->assertDatabaseHas('credit_requests', ['id' => $crId]);
        $this->assertDatabaseHas('transactions', ['credit_request_id' => $crId, 'amount' => 100.00]);

        // Delete credit request
        $delResponse = $this->actingAs($this->admin)->deleteJson("/api/credit-requests/{$crId}");
        $delResponse->assertStatus(200);

        // Verify balance reversed to $0, and records deleted
        $this->member->refresh();
        $this->assertEquals(0.00, (float) $this->member->credit);
        $this->assertDatabaseMissing('credit_requests', ['id' => $crId]);
        $this->assertDatabaseMissing('transactions', ['credit_request_id' => $crId]);
    }

    public function test_delete_and_reverse_debit_transaction_from_wallet_history()
    {
        // Member starting balance = $100
        $this->member->credit = 100.00;
        $this->member->save();

        // Create debit -$50
        $response = $this->actingAs($this->admin)->postJson('/api/credit-requests', [
            'memberId' => $this->member->id,
            'amount' => 50.00,
            'date' => now()->toDateString(),
            'type' => 'debit',
            'reason' => 'Fine for late cancellation',
        ]);

        $response->assertStatus(201);
        $crId = $response->json('id');

        $this->member->refresh();
        $this->assertEquals(50.00, (float) $this->member->credit);
        $this->assertDatabaseHas('credit_requests', ['id' => $crId]);
        $this->assertDatabaseHas('transactions', ['credit_request_id' => $crId, 'amount' => 50.00]);

        // Delete debit request
        $delResponse = $this->actingAs($this->admin)->deleteJson("/api/credit-requests/{$crId}");
        $delResponse->assertStatus(200);

        // Verify balance reversed back to $100, and records deleted
        $this->member->refresh();
        $this->assertEquals(100.00, (float) $this->member->credit);
        $this->assertDatabaseMissing('credit_requests', ['id' => $crId]);
        $this->assertDatabaseMissing('transactions', ['credit_request_id' => $crId]);
    }

    public function test_delete_and_reverse_transaction_from_transactions_ledger()
    {
        // Member starting balance = $100
        $this->member->credit = 100.00;
        $this->member->save();

        // Create debit -$30
        $response = $this->actingAs($this->admin)->postJson('/api/credit-requests', [
            'memberId' => $this->member->id,
            'amount' => 30.00,
            'date' => now()->toDateString(),
            'type' => 'debit',
            'reason' => 'Equipment damage fee',
        ]);

        $response->assertStatus(201);
        $crId = $response->json('id');
        $txn = Transaction::where('credit_request_id', $crId)->firstOrFail();

        $this->member->refresh();
        $this->assertEquals(70.00, (float) $this->member->credit);

        // Delete via transactions route
        $delResponse = $this->actingAs($this->admin)->deleteJson("/api/transactions/{$txn->id}");
        $delResponse->assertStatus(200);

        // Verify balance reversed back to $100, and both transaction and credit_request deleted
        $this->member->refresh();
        $this->assertEquals(100.00, (float) $this->member->credit);
        $this->assertDatabaseMissing('transactions', ['id' => $txn->id]);
        $this->assertDatabaseMissing('credit_requests', ['id' => $crId]);
    }
}
