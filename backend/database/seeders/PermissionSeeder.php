<?php

namespace Database\Seeders;

use App\Models\AdminRole;
use App\Models\Permission;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    private const ACTIONS = [
        'view' => 'View',
        'create' => 'Add',
        'edit' => 'Edit',
        'delete' => 'Delete',
    ];

    private const MODULES = [
        'dashboard' => ['view'],
        'members' => ['view', 'create', 'edit', 'delete'],
        'credits' => ['view', 'create', 'edit', 'delete'],
        'transactions' => ['view', 'create', 'edit', 'delete'],
        'schedules' => ['view', 'create', 'edit', 'delete'],
        'trainings' => ['view', 'create', 'edit', 'delete'],
        'league_groups' => ['view', 'create', 'edit', 'delete'],
        'approvals' => ['view', 'create', 'edit', 'delete'],
        'settings' => ['view', 'create', 'edit', 'delete'],
        'email_templates' => ['view', 'create', 'edit', 'delete'],
        'admin_management' => ['view', 'create', 'edit', 'delete'],
    ];

    public function run(): void
    {
        $now = now();
        $allPermissionIds = [];

        foreach (self::MODULES as $module => $actions) {
            foreach ($actions as $action) {
                $id = $module . '.' . $action;
                $allPermissionIds[] = $id;
                $verb = self::ACTIONS[$action];
                $label = $module === 'dashboard'
                    ? 'View dashboard'
                    : $verb . ' ' . str_replace('_', ' ', $module);

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
        }

        Permission::whereNotIn('id', $allPermissionIds)->delete();

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
                    'exclude_modules' => ['admin_management'],
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
                        'approvals.edit',
                        'approvals.delete',
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
