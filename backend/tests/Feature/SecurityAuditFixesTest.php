<?php

namespace Tests\Feature;

use App\Models\CreditRequest;
use App\Models\Grade;
use App\Models\Member;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class SecurityAuditFixesTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $memberA;
    private User $memberB;
    private Member $adultA;
    private Member $adultB;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'B'], ['type' => 'adult', 'rank' => 1]);

        $this->admin = User::create([
            'id' => 'u_sec_admin',
            'first_name' => 'Admin',
            'last_name' => 'Sec',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'sec_admin@test.com',
            'mobile' => '100',
            'address' => 'Addr',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'status' => 'active',
            'is_super_admin' => true,
        ]);

        $this->memberA = User::create([
            'id' => 'u_sec_a',
            'first_name' => 'Alpha',
            'last_name' => 'Member',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'sec_a@test.com',
            'mobile' => '101',
            'address' => 'Addr',
            'password' => Hash::make('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->memberB = User::create([
            'id' => 'u_sec_b',
            'first_name' => 'Beta',
            'last_name' => 'Member',
            'sex' => 'female',
            'dob' => '1991-01-01',
            'email' => 'sec_b@test.com',
            'mobile' => '102',
            'address' => 'Addr',
            'password' => Hash::make('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->adultA = Member::create([
            'id' => 'm_sec_a',
            'user_id' => $this->memberA->id,
            'first_name' => 'Alpha',
            'last_name' => 'Member',
            'dob' => '1990-01-01',
            'email' => 'sec_a@test.com',
            'mobile' => '101',
            'sex' => 'male',
            'member_type' => 'adult',
            'membership' => true,
            'grade' => 'B',
            'status' => 'active',
            'credit' => 100,
        ]);

        $this->adultB = Member::create([
            'id' => 'm_sec_b',
            'user_id' => $this->memberB->id,
            'first_name' => 'Beta',
            'last_name' => 'Member',
            'dob' => '1991-01-01',
            'email' => 'sec_b@test.com',
            'mobile' => '102',
            'sex' => 'female',
            'member_type' => 'adult',
            'membership' => true,
            'grade' => 'B',
            'status' => 'active',
            'credit' => 50,
        ]);

        Setting::updateOrCreate(['key' => 'mail_password'], ['value' => 'super-secret-smtp']);
        Setting::updateOrCreate(['key' => 'mail_host'], ['value' => 'smtp.example.com']);
        Setting::updateOrCreate(['key' => 'mail_username'], ['value' => 'smtp-user']);
    }

    public function test_public_settings_redacts_smtp_secrets(): void
    {
        $res = $this->getJson('/api/settings');
        $res->assertOk();
        $this->assertArrayNotHasKey('mailPassword', array_filter($res->json(), fn ($v, $k) => $k === 'mailPassword' && $v !== null && $v !== '', ARRAY_FILTER_USE_BOTH));
        $json = $res->json();
        $this->assertTrue(($json['mailPassword'] ?? '') === '' || ($json['mailPassword'] ?? null) === null);
        $this->assertTrue(($json['mailHost'] ?? '') === '' || ($json['mailHost'] ?? null) === null);
    }

    public function test_member_cannot_list_other_members(): void
    {
        $token = $this->memberA->createToken('t')->plainTextToken;
        $res = $this->withHeader('Authorization', 'Bearer ' . $token)->getJson('/api/members');
        $res->assertOk();
        $ids = collect($res->json())->pluck('id')->all();
        $this->assertContains($this->adultA->id, $ids);
        $this->assertNotContains($this->adultB->id, $ids);
    }

    public function test_member_cannot_create_credit_request_for_other_member(): void
    {
        $token = $this->memberA->createToken('t')->plainTextToken;
        $res = $this->withHeader('Authorization', 'Bearer ' . $token)->postJson('/api/credit-requests', [
            'memberId' => $this->adultB->id,
            'amount' => 25,
            'date' => now()->toDateString(),
            'type' => 'credit',
        ]);
        $res->assertStatus(403);
    }

    public function test_member_can_create_credit_request_for_self(): void
    {
        $token = $this->memberA->createToken('t')->plainTextToken;
        $res = $this->withHeader('Authorization', 'Bearer ' . $token)->postJson('/api/credit-requests', [
            'memberId' => $this->adultA->id,
            'amount' => 25,
            'date' => now()->toDateString(),
            'type' => 'credit',
        ]);
        $res->assertCreated();
        $this->assertEquals('created', $res->json('status'));
    }

    public function test_member_cannot_list_all_users(): void
    {
        $token = $this->memberA->createToken('t')->plainTextToken;
        $res = $this->withHeader('Authorization', 'Bearer ' . $token)->getJson('/api/users');
        $res->assertStatus(403);
    }

    public function test_junior_requires_parent_for_admin_create(): void
    {
        $token = $this->admin->createToken('t')->plainTextToken;
        $res = $this->withHeader('Authorization', 'Bearer ' . $token)->postJson('/api/members', [
            'firstName' => 'Kid',
            'lastName' => 'NoParent',
            'dob' => '2015-01-01',
            'email' => 'kid_noparent@test.com',
            'sex' => 'male',
            'memberType' => 'junior',
            'membership' => false,
            'grade' => 'B',
            'status' => 'active',
        ]);
        // Grade B is adult grade — may 422 on grade type; either parent or grade validation is fine
        $this->assertTrue(in_array($res->status(), [422, 201], true));
        if ($res->status() === 201) {
            $this->fail('Junior without parent should not be created');
        }
        $this->assertStringContainsStringIgnoringCase('parent', $res->json('message') ?? json_encode($res->json()));
    }

    public function test_rejected_user_token_is_revoked_on_api_call(): void
    {
        $token = $this->memberA->createToken('t')->plainTextToken;
        $this->memberA->status = 'rejected';
        $this->memberA->save();

        $res = $this->withHeader('Authorization', 'Bearer ' . $token)->getJson('/api/me');
        $res->assertStatus(401);
    }

    public function test_forgot_password_does_not_enumerate_emails(): void
    {
        $known = $this->postJson('/api/forgot-password', ['email' => 'sec_a@test.com']);
        $unknown = $this->postJson('/api/forgot-password', ['email' => 'nobody@example.com']);
        $known->assertOk();
        $unknown->assertOk();
        $this->assertEquals($known->json('message'), $unknown->json('message'));
    }

    public function test_admin_initial_credit_creates_ledger_entry(): void
    {
        Grade::firstOrCreate(['name' => 'Beginner'], ['type' => 'junior', 'rank' => 1]);
        $token = $this->admin->createToken('t')->plainTextToken;
        $res = $this->withHeader('Authorization', 'Bearer ' . $token)->postJson('/api/members', [
            'firstName' => 'Credit',
            'lastName' => 'Seed',
            'dob' => '1992-01-01',
            'email' => 'credit_seed@test.com',
            'sex' => 'male',
            'memberType' => 'adult',
            'membership' => true,
            'grade' => 'B',
            'status' => 'active',
            'userId' => $this->memberA->id,
            'credit' => 75,
            'mobile' => '999',
        ]);
        // userId may conflict with existing adult — create with createLogin instead
        if ($res->status() !== 201) {
            $res = $this->withHeader('Authorization', 'Bearer ' . $token)->postJson('/api/members', [
                'firstName' => 'Credit',
                'lastName' => 'Seed',
                'dob' => '1992-01-01',
                'email' => 'credit_seed2@test.com',
                'sex' => 'male',
                'memberType' => 'adult',
                'membership' => true,
                'grade' => 'B',
                'status' => 'active',
                'createLogin' => true,
                'password' => 'password1',
                'mobile' => '999',
                'address' => 'Addr',
                'credit' => 75,
            ]);
        }
        $res->assertCreated();
        $memberId = $res->json('id');
        $this->assertEquals(75.0, (float) $res->json('credit'));
        $this->assertTrue(
            CreditRequest::where('member_id', $memberId)->where('amount', 75)->where('status', 'approved')->exists()
        );
    }
}
