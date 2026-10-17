<?php

namespace Tests\Feature;

use App\Helpers\SessionTimingHelper;
use App\Models\CreditRequest;
use App\Models\Grade;
use App\Models\Member;
use App\Models\Setting;
use App\Models\Transaction;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminWalletTransactionTimestampTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Member $member;

    protected function setUp(): void
    {
        parent::setUp();

        Setting::updateOrCreate(['key' => 'timezone'], ['value' => 'Asia/Kolkata']);
        SessionTimingHelper::applyClubTimezone();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_wallet_ts_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'Wallet',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_wallet_ts@test.com',
                'mobile' => '+1234567890',
                'address' => 'Admin HQ',
                'password' => bcrypt('secret'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $memberUser = User::create([
            'id' => 'u_member_wallet_ts_test',
            'first_name' => 'Alice',
            'last_name' => 'Smith',
            'sex' => 'female',
            'dob' => '1995-05-15',
            'email' => 'alice_wallet_ts@test.com',
            'mobile' => '+1987654321',
            'address' => 'Player St',
            'password' => bcrypt('secret'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->member = Member::create([
            'id' => 'm_wallet_ts_test',
            'user_id' => $memberUser->id,
            'first_name' => 'Alice',
            'last_name' => 'Smith',
            'dob' => '1995-05-15',
            'email' => 'alice_wallet_ts@test.com',
            'sex' => 'female',
            'credit' => 100.00,
            'membership' => true,
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
        ]);
    }

    public function test_credit_debit_and_refund_record_actual_times_and_keep_selected_date()
    {
        $tz = 'Asia/Kolkata';

        // 1. CREATE CREDIT at 10:15:30 with selected date 2026-10-15
        Carbon::setTestNow(Carbon::parse('2026-10-17 10:15:30', $tz));

        $creditResp = $this->actingAs($this->admin)->postJson('/api/credit-requests', [
            'memberId' => $this->member->id,
            'amount' => 50.00,
            'date' => '2026-10-15',
            'type' => 'credit',
        ]);

        $creditResp->assertStatus(201);
        $creditCrId = $creditResp->json('id');
        $this->assertEquals('2026-10-15', $creditResp->json('date'));
        $this->assertNotNull($creditResp->json('createdAt'));
        $this->assertStringContainsString('10:15:30', $creditResp->json('createdAt'));

        // Check CreditRequest DB record
        $crCredit = CreditRequest::find($creditCrId);
        $this->assertEquals('2026-10-15', $crCredit->date);

        // Check Transaction DB record - NOT 00:00:00!
        $txnCredit = Transaction::where('credit_request_id', $creditCrId)->first();
        $this->assertNotNull($txnCredit);
        $this->assertStringContainsString('2026-10-15', (string)$txnCredit->date);
        $this->assertStringContainsString('10:15:30', (string)$txnCredit->date);
        $this->assertStringNotContainsString('00:00:00', (string)$txnCredit->date);

        // Wallet balance increased: 100 + 50 = 150
        $this->member->refresh();
        $this->assertEquals(150.00, (float) $this->member->credit);

        // 2. CREATE DEBIT at 14:45:10 with selected date 2026-10-16
        Carbon::setTestNow(Carbon::parse('2026-10-17 14:45:10', $tz));

        $debitResp = $this->actingAs($this->admin)->postJson('/api/credit-requests', [
            'memberId' => $this->member->id,
            'amount' => 30.00,
            'date' => '2026-10-16',
            'type' => 'debit',
            'reason' => 'Late cancellation fine',
        ]);

        $debitResp->assertStatus(201);
        $debitCrId = $debitResp->json('id');
        $this->assertEquals('2026-10-16', $debitResp->json('date'));
        $this->assertNotNull($debitResp->json('createdAt'));
        $this->assertStringContainsString('14:45:10', $debitResp->json('createdAt'));

        // Check CreditRequest DB record
        $crDebit = CreditRequest::find($debitCrId);
        $this->assertEquals('2026-10-16', $crDebit->date);

        // Check Transaction DB record - NOT 00:00:00!
        $txnDebit = Transaction::where('credit_request_id', $debitCrId)->first();
        $this->assertNotNull($txnDebit);
        $this->assertStringContainsString('2026-10-16', (string)$txnDebit->date);
        $this->assertStringContainsString('14:45:10', (string)$txnDebit->date);
        $this->assertStringNotContainsString('00:00:00', (string)$txnDebit->date);

        // Wallet balance decreased: 150 - 30 = 120
        $this->member->refresh();
        $this->assertEquals(120.00, (float) $this->member->credit);

        // 3. CREATE REFUND at 18:20:45 with selected date 2026-10-17
        Carbon::setTestNow(Carbon::parse('2026-10-17 18:20:45', $tz));

        $refundResp = $this->actingAs($this->admin)->postJson('/api/credit-requests', [
            'memberId' => $this->member->id,
            'amount' => 15.00,
            'date' => '2026-10-17',
            'type' => 'refund',
        ]);

        $refundResp->assertStatus(201);
        $refundCrId = $refundResp->json('id');
        $this->assertEquals('2026-10-17', $refundResp->json('date'));
        $this->assertNotNull($refundResp->json('createdAt'));
        $this->assertStringContainsString('18:20:45', $refundResp->json('createdAt'));

        // Check CreditRequest DB record
        $crRefund = CreditRequest::find($refundCrId);
        $this->assertEquals('2026-10-17', $crRefund->date);

        // Check Transaction DB record - NOT 00:00:00!
        $txnRefund = Transaction::where('credit_request_id', $refundCrId)->first();
        $this->assertNotNull($txnRefund);
        $this->assertStringContainsString('2026-10-17', (string)$txnRefund->date);
        $this->assertStringContainsString('18:20:45', (string)$txnRefund->date);
        $this->assertStringNotContainsString('00:00:00', (string)$txnRefund->date);

        // Wallet balance increased: 120 + 15 = 135
        $this->member->refresh();
        $this->assertEquals(135.00, (float) $this->member->credit);

        // 4. Verify /api/credit-requests lists all 3 with real timestamps
        $crListResp = $this->actingAs($this->admin)->getJson('/api/credit-requests');
        $crListResp->assertStatus(200);

        $crRefundJson = collect($crListResp->json())->firstWhere('id', $refundCrId);
        $this->assertNotNull($crRefundJson);
        $this->assertEquals('2026-10-17', $crRefundJson['date']);
        $this->assertStringContainsString('18:20:45', $crRefundJson['createdAt']);

        $crDebitJson = collect($crListResp->json())->firstWhere('id', $debitCrId);
        $this->assertNotNull($crDebitJson);
        $this->assertEquals('2026-10-16', $crDebitJson['date']);
        $this->assertStringContainsString('14:45:10', $crDebitJson['createdAt']);

        $crCreditJson = collect($crListResp->json())->firstWhere('id', $creditCrId);
        $this->assertNotNull($crCreditJson);
        $this->assertEquals('2026-10-15', $crCreditJson['date']);
        $this->assertStringContainsString('10:15:30', $crCreditJson['createdAt']);

        // 5. Verify /api/transactions lists all 3 with real times (not midnight)
        $txListResp = $this->actingAs($this->admin)->getJson('/api/transactions');
        $txListResp->assertStatus(200);

        $txRefundJson = collect($txListResp->json())->firstWhere('id', $txnRefund->id);
        $this->assertNotNull($txRefundJson);
        $this->assertStringContainsString('18:20:45', $txRefundJson['date']);

        $txDebitJson = collect($txListResp->json())->firstWhere('id', $txnDebit->id);
        $this->assertNotNull($txDebitJson);
        $this->assertStringContainsString('14:45:10', $txDebitJson['date']);

        $txCreditJson = collect($txListResp->json())->firstWhere('id', $txnCredit->id);
        $this->assertNotNull($txCreditJson);
        $this->assertStringContainsString('10:15:30', $txCreditJson['date']);

        Carbon::setTestNow();
    }
}
