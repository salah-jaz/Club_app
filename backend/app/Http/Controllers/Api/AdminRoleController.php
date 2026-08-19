<?php

namespace App\Http\Controllers\Api;

use App\Helpers\PermissionHelper;
use App\Http\Controllers\Controller;
use App\Models\AdminRole;
use App\Models\Permission;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminRoleController extends Controller
{
    public function index(Request $request)
    {
        if ($response = PermissionHelper::authorizeAdmin($request, 'admin_management.view')) {
            return $response;
        }

        $roles = AdminRole::with('permissions')->orderBy('name')->get();

        return response()->json($roles->map(fn (AdminRole $role) => $this->formatRole($role)));
    }

    public function show(Request $request, $id)
    {
        if ($response = PermissionHelper::authorizeAdmin($request, 'admin_management.view')) {
            return $response;
        }

        $role = AdminRole::with('permissions')->findOrFail($id);

        return response()->json($this->formatRole($role));
    }

    public function store(Request $request)
    {
        if ($response = PermissionHelper::authorizeAdmin($request, 'admin_management.create')) {
            return $response;
        }

        $request->validate([
            'name' => 'required|string|max:255|unique:admin_roles,name',
            'description' => 'nullable|string',
            'permissionIds' => 'sometimes|array',
            'permissionIds.*' => 'string|exists:permissions,id',
        ]);

        $role = AdminRole::create([
            'id' => 'ar_' . Str::random(8),
            'name' => $request->name,
            'description' => $request->description,
            'is_super' => false,
            'is_system' => false,
        ]);

        if ($request->has('permissionIds')) {
            $role->permissions()->sync($request->permissionIds);
        }

        return response()->json($this->formatRole($role->load('permissions')), 201);
    }

    public function update(Request $request, $id)
    {
        if ($response = PermissionHelper::authorizeAdmin($request, 'admin_management.edit')) {
            return $response;
        }

        $role = AdminRole::with('permissions')->findOrFail($id);

        if ($role->is_super) {
            return response()->json(['message' => 'Super Admin role cannot be modified.'], 403);
        }

        $rules = [
            'description' => 'nullable|string',
            'permissionIds' => 'sometimes|array',
            'permissionIds.*' => 'string|exists:permissions,id',
        ];

        if (!$role->is_system) {
            $rules['name'] = [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('admin_roles', 'name')->ignore($role->id),
            ];
        }

        $request->validate($rules);

        if (!$role->is_system && $request->has('name')) {
            $role->name = $request->name;
        }

        if ($request->has('description')) {
            $role->description = $request->description;
        }

        $role->save();

        if ($request->has('permissionIds')) {
            $role->permissions()->sync($request->permissionIds);
        }

        return response()->json($this->formatRole($role->fresh('permissions')));
    }

    public function destroy(Request $request, $id)
    {
        if ($response = PermissionHelper::authorizeAdmin($request, 'admin_management.delete')) {
            return $response;
        }

        $role = AdminRole::withCount('users')->findOrFail($id);

        if ($role->is_system) {
            return response()->json(['message' => 'System roles cannot be deleted.'], 403);
        }

        if ($role->users_count > 0) {
            return response()->json(['message' => 'Cannot delete a role that has users assigned.'], 422);
        }

        $role->delete();

        return response()->json(['message' => 'Role deleted successfully.']);
    }

    public function permissions(Request $request)
    {
        if ($response = PermissionHelper::authorizeAdmin($request, 'admin_management.view')) {
            return $response;
        }

        $permissions = Permission::orderBy('module')->orderBy('action')->get();

        $grouped = $permissions->groupBy('module')->map(function ($items, $module) {
            return $items->map(fn (Permission $p) => [
                'id' => $p->id,
                'action' => $p->action,
                'label' => $p->label,
            ])->values();
        });

        return response()->json($grouped);
    }

    private function formatRole(AdminRole $role): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'description' => $role->description,
            'isSuper' => (bool) $role->is_super,
            'isSystem' => (bool) $role->is_system,
            'permissionIds' => $role->permissions->pluck('id')->values()->all(),
            'userCount' => $role->users_count ?? $role->users()->count(),
            'createdAt' => $role->created_at?->toISOString(),
            'updatedAt' => $role->updated_at?->toISOString(),
        ];
    }
}
