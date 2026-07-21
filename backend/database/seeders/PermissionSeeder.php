<?php

namespace Database\Seeders;

use App\Models\AdminRole;
use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    private const PERMISSIONS = [
        'dashboard.view' => 'View dashboard',
        'members.view' => 'View members',
        'members.create' => 'Create members',
        'members.edit' => 'Edit members',
        'members.delete' => 'Delete members',
        'members.bulk_upload' => 'Bulk upload members',
        'members.login_as' => 'Login as member',
        'members.approve_junior' => 'Approve junior members',
        'credits.view' => 'View credits',
        'credits.create' => 'Create credits',
        'credits.approve' => 'Approve credits',
        'credits.reject' => 'Reject credits',
        'transactions.view' => 'View transactions',
        'transactions.export' => 'Export transactions',
        'schedules.view' => 'View schedules',
        'schedules.create' => 'Create schedules',
        'schedules.edit' => 'Edit schedules',
        'schedules.delete' => 'Delete schedules',
        'schedules.release' => 'Release schedules',
        'schedules.generate_rotation' => 'Generate rotation',
        'schedules.publish' => 'Publish schedules',
        'schedules.close' => 'Close schedules',
        'schedules.revert_rotation' => 'Revert rotation',
        'trainings.view' => 'View trainings',
        'trainings.create' => 'Create trainings',
        'trainings.edit' => 'Edit trainings',
        'trainings.delete' => 'Delete trainings',
        'trainings.manage_attendance' => 'Manage attendance',
        'league_groups.view' => 'View league groups',
        'league_groups.create' => 'Create league groups',
        'league_groups.edit' => 'Edit league groups',
        'league_groups.delete' => 'Delete league groups',
        'approvals.view' => 'View approvals',
        'approvals.approve_user' => 'Approve user',
        'approvals.reject_user' => 'Reject user',
        'approvals.approve_credit' => 'Approve credit',
        'approvals.reject_credit' => 'Reject credit',
        'settings.view' => 'View settings',
        'settings.edit' => 'Edit settings',
        'settings.smtp' => 'SMTP settings',
        'settings.branding' => 'Branding settings',
        'email_templates.view' => 'View email templates',
        'email_templates.edit' => 'Edit email templates',
        'admin_management.view' => 'View admin management',
        'admin_management.create' => 'Create admin users',
        'admin_management.edit' => 'Edit admin users',
        'admin_management.delete' => 'Delete admin users',
        'admin_management.assign_role' => 'Assign admin role',
        'roles.view' => 'View roles',
        'roles.create' => 'Create roles',
        'roles.edit' => 'Edit roles',
        'roles.delete' => 'Delete roles',
    ];

    public function run(): void
    {
        $now = now();

        foreach (self::PERMISSIONS as $id => $label) {
            [$module, $action] = explode('.', $id, 2);

            Permission::updateOrCreate(
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

        $allPermissionIds = array_keys(self::PERMISSIONS);

        $roles = [
            [
                'id' => 'ar_super',
                'name' => 'Super Admin',
                'description' => 'Full system access with all permissions.',
                'is_super' => true,
                'is_system' => true,
                'permissions' => $allPermissionIds,
            ],
            [
                'id' => 'ar_manager',
                'name' => 'Club Manager',
                'description' => 'Manages club operations excluding admin and role management.',
                'is_super' => false,
                'is_system' => true,
                'permissions' => $this->filterPermissions($allPermissionIds, [
                    'exclude_modules' => ['admin_management', 'roles'],
                ]),
            ],
            [
                'id' => 'ar_coordinator',
                'name' => 'Schedule Coordinator',
                'description' => 'Manages schedules, league groups, and related member visibility.',
                'is_super' => false,
                'is_system' => true,
                'permissions' => $this->filterPermissions($allPermissionIds, [
                    'include' => [
                        'dashboard.view',
                        'members.view',
                        'schedules.*',
                        'league_groups.*',
                        'trainings.view',
                    ],
                ]),
            ],
            [
                'id' => 'ar_finance',
                'name' => 'Finance Admin',
                'description' => 'Manages credits, transactions, and credit approvals.',
                'is_super' => false,
                'is_system' => true,
                'permissions' => $this->filterPermissions($allPermissionIds, [
                    'include' => [
                        'dashboard.view',
                        'credits.*',
                        'transactions.*',
                        'approvals.view',
                        'approvals.approve_credit',
                        'approvals.reject_credit',
                    ],
                ]),
            ],
        ];

        foreach ($roles as $roleData) {
            $permissionIds = $roleData['permissions'];
            unset($roleData['permissions']);

            $role = AdminRole::updateOrCreate(
                ['id' => $roleData['id']],
                array_merge($roleData, ['updated_at' => $now, 'created_at' => $now])
            );

            $role->permissions()->sync($permissionIds);
        }
    }

    private function filterPermissions(array $allPermissionIds, array $rules): array
    {
        if (isset($rules['exclude_modules'])) {
            return array_values(array_filter(
                $allPermissionIds,
                fn (string $id) => !in_array(explode('.', $id, 2)[0], $rules['exclude_modules'], true)
            ));
        }

        if (isset($rules['include'])) {
            $matched = [];

            foreach ($rules['include'] as $pattern) {
                if (str_ends_with($pattern, '.*')) {
                    $prefix = substr($pattern, 0, -2);
                    foreach ($allPermissionIds as $id) {
                        if (str_starts_with($id, $prefix . '.')) {
                            $matched[] = $id;
                        }
                    }
                } elseif (in_array($pattern, $allPermissionIds, true)) {
                    $matched[] = $pattern;
                }
            }

            return array_values(array_unique($matched));
        }

        return $allPermissionIds;
    }
}
