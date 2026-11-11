<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * PermissionHelper no longer treats an admin with a null admin_role_id as having
 * every permission (fail-open). To avoid locking out the club when upgrading, make
 * sure at least one legacy admin ends up as a super admin:
 *   - the seeded main admin (u_admin) if it has no role, otherwise
 *   - the oldest role-less admin, but only if no super admin exists at all.
 * All other role-less admins must be assigned a role by a super admin.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('admin_roles') || !Schema::hasColumn('users', 'admin_role_id')) {
            return;
        }

        $superRoleId = DB::table('admin_roles')->where('id', 'ar_super')->value('id')
            ?? DB::table('admin_roles')->where('is_super', true)->value('id');

        if (!$superRoleId) {
            return;
        }

        $promote = function (string $userId) use ($superRoleId) {
            DB::table('users')->where('id', $userId)->update([
                'admin_role_id' => $superRoleId,
                'is_super_admin' => true,
            ]);
        };

        $mainAdmin = DB::table('users')
            ->where('id', 'u_admin')
            ->where('role', 'admin')
            ->whereNull('admin_role_id')
            ->where('is_super_admin', false)
            ->exists();

        if ($mainAdmin) {
            $promote('u_admin');
        }

        $hasSuperAdmin = DB::table('users')->where('role', 'admin')->where('is_super_admin', true)->exists();

        if (!$hasSuperAdmin) {
            $legacyId = DB::table('users')
                ->where('role', 'admin')
                ->whereNull('admin_role_id')
                ->orderBy('created_at')
                ->value('id');

            if ($legacyId) {
                $promote($legacyId);
            }
        }
    }

    public function down(): void
    {
        // Data backfill; intentionally not reversed.
    }
};
