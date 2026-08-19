<?php

namespace Tests\Feature;

use App\Models\AdminRole;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class AdminCrudPermissionTest extends TestCase
{
    use DatabaseTransactions;

    private function makeRole(array $permissionIds): AdminRole
    {
        $role = AdminRole::create([
            'id' => 'ar_test_' . Str::random(8),
            'name' => 'Test Role ' . Str::random(5),
            'description' => 'Permission test role',
            'is_super' => false,
            'is_system' => false,
        ]);
        $role->permissions()->sync($permissionIds);

        return $role;
    }

    private function makeAdmin(AdminRole $role): User
    {
        return User::create([
            'id' => 'u_perm_' . Str::random(8),
            'first_name' => 'Perm',
            'last_name' => 'Tester',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'perm_' . Str::random(8) . '@test.com',
            'mobile' => '0000000000',
            'address' => 'Test',
            'password' => Hash::make('password'),
            'role' => 'admin',
            'admin_role_id' => $role->id,
            'is_super_admin' => false,
            'status' => 'active',
        ]);
    }

    public function test_permission_catalog_only_has_view_add_edit_delete(): void
    {
        $actions = Permission::query()->pluck('action')->unique()->sort()->values()->all();
        $this->assertEquals(['create', 'delete', 'edit', 'view'], $actions);

        $this->assertDatabaseMissing('permissions', ['id' => 'members.bulk_upload']);
        $this->assertDatabaseMissing('permissions', ['id' => 'roles.view']);
        $this->assertDatabaseMissing('permissions', ['id' => 'schedules.publish']);
    }

    public function test_restricted_admin_cannot_access_other_modules(): void
    {
        $role = $this->makeRole(['schedules.view', 'schedules.edit']);
        $admin = $this->makeAdmin($role);

        $this->actingAs($admin)
            ->postJson('/api/schedules')
            ->assertStatus(403);

        $this->actingAs($admin)
            ->postJson('/api/league-groups', ['name' => 'Nope'])
            ->assertStatus(403);

        $this->actingAs($admin)
            ->getJson('/api/admin-roles')
            ->assertStatus(403);

        $this->actingAs($admin)
            ->postJson('/api/settings', ['appName' => 'Hacked'])
            ->assertStatus(403);

        $me = $this->actingAs($admin)->getJson('/api/me')->assertOk()->json();
        $this->assertEqualsCanonicalizing(['schedules.view', 'schedules.edit'], $me['permissions']);
    }

    public function test_admin_with_create_can_create_league_group(): void
    {
        $role = $this->makeRole(['league_groups.view', 'league_groups.create']);
        $admin = $this->makeAdmin($role);

        $this->actingAs($admin)
            ->postJson('/api/league-groups', ['name' => 'Permitted Group'])
            ->assertStatus(201)
            ->assertJsonPath('name', 'Permitted Group');
    }

    public function test_admin_without_delete_cannot_delete_league_group(): void
    {
        $role = $this->makeRole(['league_groups.view', 'league_groups.create']);
        $admin = $this->makeAdmin($role);

        $created = $this->actingAs($admin)
            ->postJson('/api/league-groups', ['name' => 'Keep Me'])
            ->assertStatus(201)
            ->json();

        $this->actingAs($admin)
            ->deleteJson('/api/league-groups/' . $created['id'])
            ->assertStatus(403);
    }

    public function test_finance_style_role_cannot_manage_admins(): void
    {
        $role = $this->makeRole([
            'dashboard.view',
            'credits.view',
            'credits.create',
            'credits.edit',
            'credits.delete',
            'transactions.view',
        ]);
        $admin = $this->makeAdmin($role);

        $this->actingAs($admin)
            ->getJson('/api/admin-users')
            ->assertStatus(403);

        $this->actingAs($admin)
            ->postJson('/api/admin-roles', ['name' => 'Should Fail'])
            ->assertStatus(403);
    }
}
