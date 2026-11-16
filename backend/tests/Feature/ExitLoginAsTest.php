<?php

namespace Tests\Feature;

use App\Models\AdminRole;
use App\Models\Grade;
use App\Models\Member;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class ExitLoginAsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(
            ['name' => 'A'],
            ['id' => 'g_a', 'type' => 'adult']
        );
    }

    private function createAdmin(): array
    {
        $role = AdminRole::create([
            'id' => 'ar_impers_' . Str::random(8),
            'name' => 'Admin Role ' . Str::random(5),
            'description' => 'Test admin role',
            'is_super' => true,
            'is_system' => false,
        ]);

        $admin = User::create([
            'id' => 'u_adm_' . Str::random(8),
            'first_name' => 'Admin',
            'last_name' => 'Tester',
            'sex' => 'male',
            'dob' => '1985-05-15',
            'email' => 'admin_' . Str::random(8) . '@example.com',
            'mobile' => '1234567890',
            'address' => '123 Admin Way',
            'password' => Hash::make('secret123'),
            'role' => 'admin',
            'admin_role_id' => $role->id,
            'is_super_admin' => true,
            'status' => 'active',
        ]);

        $adminToken = $admin->createToken('auth_token')->plainTextToken;

        return [$admin, $adminToken];
    }

    private function createMember(): array
    {
        $user = User::create([
            'id' => 'u_mem_' . Str::random(8),
            'first_name' => 'John',
            'last_name' => 'Member',
            'sex' => 'male',
            'dob' => '1995-08-20',
            'email' => 'member_' . Str::random(8) . '@example.com',
            'mobile' => '9876543210',
            'address' => '456 Member Lane',
            'password' => Hash::make('secret123'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $member = Member::create([
            'id' => 'm_' . Str::random(8),
            'user_id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'dob' => $user->dob,
            'email' => $user->email,
            'mobile' => $user->mobile,
            'sex' => $user->sex,
            'member_type' => 'adult',
            'membership' => true,
            'training_eligible' => true,
            'play_eligible' => true,
            'skip_credit_consumption' => false,
            'apply_discount' => false,
            'grade' => 'A',
            'bi_member_id' => 'BI' . rand(1000, 9999),
            'status' => 'active',
            'credit' => 100,
        ]);

        return [$user, $member];
    }

    public function test_admin_can_login_as_member_and_receive_impersonation_token_and_metadata(): void
    {
        [$admin, $adminToken] = $this->createAdmin();
        [$memberUser, $member] = $this->createMember();

        $response = $this->withHeader('Authorization', 'Bearer ' . $adminToken)
            ->postJson("/api/members/{$member->id}/login-as");

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'token',
            'user' => ['id', 'firstName', 'lastName', 'email', 'role'],
            'impersonation' => ['isImpersonating', 'adminId', 'adminName', 'adminEmail'],
        ]);

        $this->assertTrue($response->json('impersonation.isImpersonating'));
        $this->assertEquals($admin->id, $response->json('impersonation.adminId'));
        $this->assertEquals($memberUser->id, $response->json('user.id'));

        // Check token name in database
        $memberTokenStr = $response->json('token');
        [$tokenId] = explode('|', $memberTokenStr);
        $tokenRecord = PersonalAccessToken::find($tokenId);
        $this->assertNotNull($tokenRecord);
        $this->assertEquals('impersonation:' . $admin->id, $tokenRecord->name);

        // Admin original token must still be active
        [$adminTokenId] = explode('|', $adminToken);
        $this->assertNotNull(PersonalAccessToken::find($adminTokenId));
    }

    public function test_me_endpoint_identifies_impersonation_session(): void
    {
        [$admin, $adminToken] = $this->createAdmin();
        [$memberUser, $member] = $this->createMember();

        // 1. Admin /me returns impersonation: null
        $adminMe = $this->withHeader('Authorization', 'Bearer ' . $adminToken)
            ->getJson('/api/me');
        $adminMe->assertStatus(200);
        $this->assertNull($adminMe->json('impersonation'));

        $this->app['auth']->forgetGuards();

        // 2. Start impersonation
        $loginAsRes = $this->withHeader('Authorization', 'Bearer ' . $adminToken)
            ->postJson("/api/members/{$member->id}/login-as");
        $memberToken = $loginAsRes->json('token');

        $this->app['auth']->forgetGuards();

        // 3. Member /me with impersonation token returns impersonation info
        $memberMe = $this->withHeader('Authorization', 'Bearer ' . $memberToken)
            ->getJson('/api/me');
        $memberMe->assertStatus(200);
        $this->assertTrue($memberMe->json('impersonation.isImpersonating'));
        $this->assertEquals($admin->id, $memberMe->json('impersonation.adminId'));
    }

    public function test_exit_login_as_revokes_impersonation_token_and_preserves_admin(): void
    {
        [$admin, $adminToken] = $this->createAdmin();
        [$memberUser, $member] = $this->createMember();

        // Admin initiates Login As
        $loginAsRes = $this->withHeader('Authorization', 'Bearer ' . $adminToken)
            ->postJson("/api/members/{$member->id}/login-as");
        $memberToken = $loginAsRes->json('token');
        [$memberTokenId] = explode('|', $memberToken);

        $this->app['auth']->forgetGuards();

        // Call exit-login-as using the member's impersonation token
        $exitRes = $this->withHeader('Authorization', 'Bearer ' . $memberToken)
            ->postJson('/api/exit-login-as');

        $exitRes->assertStatus(200);
        $exitRes->assertJson([
            'message' => 'Impersonation session ended successfully.',
            'adminActive' => true,
            'admin' => [
                'id' => $admin->id,
            ],
        ]);

        // Verify member impersonation token was deleted
        $this->assertNull(PersonalAccessToken::find($memberTokenId));

        $this->app['auth']->forgetGuards();

        // Subsequent call with revoked member token must fail with 401
        $this->withHeader('Authorization', 'Bearer ' . $memberToken)
            ->getJson('/api/me')
            ->assertStatus(401);

        // Admin's original token is still active and valid!
        [$adminTokenId] = explode('|', $adminToken);
        $this->assertNotNull(PersonalAccessToken::find($adminTokenId));

        $this->app['auth']->forgetGuards();

        $adminMe = $this->withHeader('Authorization', 'Bearer ' . $adminToken)
            ->getJson('/api/me');
        $adminMe->assertStatus(200);
        $this->assertEquals('admin', $adminMe->json('role'));
        $this->assertNull($adminMe->json('impersonation'));
    }

    public function test_normal_member_login_is_unaffected_and_cannot_exit_login_as(): void
    {
        [$memberUser] = $this->createMember();

        // Normal member logs in
        $loginRes = $this->postJson('/api/login', [
            'email' => $memberUser->email,
            'password' => 'secret123',
        ]);
        $loginRes->assertStatus(200);
        $token = $loginRes->json('token');

        // /me has no impersonation info
        $meRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/me');
        $meRes->assertStatus(200);
        $this->assertNull($meRes->json('impersonation'));

        // Normal member calling exit-login-as gets 403 Forbidden
        $exitRes = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/exit-login-as');
        $exitRes->assertStatus(403);
        $exitRes->assertJson(['message' => 'No active impersonation session found.']);

        // Member token is still active
        [$tokenId] = explode('|', $token);
        $this->assertNotNull(PersonalAccessToken::find($tokenId));
    }

    public function test_cannot_impersonate_another_admin(): void
    {
        [$admin1, $admin1Token] = $this->createAdmin();
        [$admin2] = $this->createAdmin();

        $member2 = Member::create([
            'id' => 'm_adm2_' . Str::random(8),
            'user_id' => $admin2->id,
            'first_name' => $admin2->first_name,
            'last_name' => $admin2->last_name,
            'dob' => $admin2->dob,
            'email' => $admin2->email,
            'mobile' => $admin2->mobile,
            'sex' => $admin2->sex,
            'member_type' => 'adult',
            'membership' => true,
            'training_eligible' => true,
            'play_eligible' => true,
            'skip_credit_consumption' => false,
            'apply_discount' => false,
            'grade' => 'A',
            'bi_member_id' => 'BI' . rand(1000, 9999),
            'status' => 'active',
            'credit' => 100,
        ]);

        $response = $this->withHeader('Authorization', 'Bearer ' . $admin1Token)
            ->postJson("/api/members/{$member2->id}/login-as");

        $response->assertStatus(403);
        $response->assertJson(['message' => 'Cannot log in as an admin account.']);
    }

    public function test_exit_login_as_handles_deactivated_admin(): void
    {
        [$admin, $adminToken] = $this->createAdmin();
        [$memberUser, $member] = $this->createMember();

        $loginAsRes = $this->withHeader('Authorization', 'Bearer ' . $adminToken)
            ->postJson("/api/members/{$member->id}/login-as");
        $memberToken = $loginAsRes->json('token');
        [$memberTokenId] = explode('|', $memberToken);

        // Deactivate admin account
        $admin->update(['status' => 'rejected']);

        $this->app['auth']->forgetGuards();

        $exitRes = $this->withHeader('Authorization', 'Bearer ' . $memberToken)
            ->postJson('/api/exit-login-as');

        $exitRes->assertStatus(403);
        $exitRes->assertJson(['adminActive' => false]);

        // Impersonation token must still be revoked
        $this->assertNull(PersonalAccessToken::find($memberTokenId));
    }
}
