<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('permissions') || !Schema::hasTable('admin_role_permissions')) {
            return;
        }

        $now = now();
        $crud = ['view', 'create', 'edit', 'delete'];
        $modules = [
            'dashboard' => ['view'],
            'members' => $crud,
            'credits' => $crud,
            'transactions' => $crud,
            'schedules' => $crud,
            'trainings' => $crud,
            'league_groups' => $crud,
            'approvals' => $crud,
            'settings' => $crud,
            'email_templates' => $crud,
            'admin_management' => $crud,
        ];

        $allowed = [];
        foreach ($modules as $module => $actions) {
            foreach ($actions as $action) {
                $id = $module . '.' . $action;
                $allowed[] = $id;
                $verb = $action === 'create' ? 'Add' : ucfirst($action);
                $label = $module === 'dashboard' ? 'View dashboard' : $verb . ' ' . str_replace('_', ' ', $module);
                DB::table('permissions')->updateOrInsert(
                    ['id' => $id],
                    [
                        'module' => $module,
                        'action' => $action,
                        'label' => $label,
                        'updated_at' => $now,
                        'created_at' => $now,
                    ]
                );
            }
        }

        $aliases = [
            'members.bulk_upload' => 'members.create',
            'members.login_as' => 'members.edit',
            'members.approve_junior' => 'members.edit',
            'credits.approve' => 'credits.edit',
            'credits.reject' => 'credits.edit',
            'transactions.export' => 'transactions.view',
            'schedules.release' => 'schedules.edit',
            'schedules.generate_rotation' => 'schedules.edit',
            'schedules.publish' => 'schedules.edit',
            'schedules.close' => 'schedules.edit',
            'schedules.revert_rotation' => 'schedules.edit',
            'trainings.manage_attendance' => 'trainings.edit',
            'approvals.approve_user' => 'approvals.edit',
            'approvals.reject_user' => 'approvals.delete',
            'approvals.approve_credit' => 'approvals.edit',
            'approvals.reject_credit' => 'approvals.delete',
            'settings.smtp' => 'settings.edit',
            'settings.branding' => 'settings.edit',
            'admin_management.assign_role' => 'admin_management.edit',
            'roles.view' => 'admin_management.view',
            'roles.create' => 'admin_management.create',
            'roles.edit' => 'admin_management.edit',
            'roles.delete' => 'admin_management.delete',
        ];

        foreach ($aliases as $old => $new) {
            $rows = DB::table('admin_role_permissions')->where('permission_id', $old)->get();
            foreach ($rows as $row) {
                DB::table('admin_role_permissions')->insertOrIgnore([
                    'admin_role_id' => $row->admin_role_id,
                    'permission_id' => $new,
                ]);
            }
            DB::table('admin_role_permissions')->where('permission_id', $old)->delete();
        }

        DB::table('admin_role_permissions')->whereNotIn('permission_id', $allowed)->delete();
        DB::table('permissions')->whereNotIn('id', $allowed)->delete();
    }

    public function down(): void
    {
        // Irreversible simplification of the permission catalog.
    }
};
