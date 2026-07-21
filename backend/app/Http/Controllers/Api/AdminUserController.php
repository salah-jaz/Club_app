<?php

namespace App\Http\Controllers\Api;

use App\Helpers\PermissionHelper;
use App\Http\Controllers\Controller;
use App\Models\AdminRole;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminUserController extends Controller
{
    public function index(Request $request)
    {
        if ($response = PermissionHelper::authorizeAdmin($request, 'admin_management.view')) {
            return $response;
        }

        $users = User::with('adminRole')
            ->where('role', 'admin')
            ->orderBy('created_at', 'desc')
            ->get();

        return response()->json($users->map(fn (User $user) => $this->formatAdminUser($user)));
    }

    public function store(Request $request)
    {
        if ($response = PermissionHelper::authorizeAdmin($request, 'admin_management.create')) {
            return $response;
        }

        $request->validate([
            'firstName' => 'required|string|max:255',
            'lastName' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users,email',
            'password' => 'required|string|min:6',
            'mobile' => 'nullable|string|max:20',
            'adminRoleId' => 'required|string|exists:admin_roles,id',
        ]);

        if ($response = $this->authorizeRoleAssignment($request, $request->adminRoleId)) {
            return $response;
        }

        if (!PermissionHelper::userHasPermission($request->user(), 'admin_management.assign_role')) {
            return response()->json(['message' => 'You do not have permission to assign admin roles.'], 403);
        }

        $role = AdminRole::findOrFail($request->adminRoleId);

        $user = User::create([
            'id' => 'u_' . Str::random(8),
            'first_name' => $request->firstName,
            'last_name' => $request->lastName,
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => $request->email,
            'mobile' => $request->mobile ?? '',
            'address' => '',
            'password' => Hash::make($request->password),
            'role' => 'admin',
            'admin_role_id' => $role->id,
            'is_super_admin' => $role->is_super,
            'created_by' => $request->user()->id,
            'status' => 'active',
        ]);

        return response()->json($this->formatAdminUser($user->load('adminRole')), 201);
    }

    public function update(Request $request, $id)
    {
        if ($response = PermissionHelper::authorizeAdmin($request, 'admin_management.edit')) {
            return $response;
        }

        $user = User::with('adminRole')->findOrFail($id);

        if ($user->role !== 'admin') {
            return response()->json(['message' => 'User is not an admin.'], 404);
        }

        $request->validate([
            'firstName' => 'sometimes|required|string|max:255',
            'lastName' => 'sometimes|required|string|max:255',
            'email' => [
                'sometimes',
                'required',
                'string',
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($user->id),
            ],
            'mobile' => 'nullable|string|max:20',
            'adminRoleId' => 'sometimes|required|string|exists:admin_roles,id',
        ]);

        $caller = $request->user();

        if ($request->has('adminRoleId')) {
            if (!PermissionHelper::userHasPermission($caller, 'admin_management.assign_role')) {
                return response()->json(['message' => 'You do not have permission to assign admin roles.'], 403);
            }

            if ($response = $this->authorizeRoleChange($caller, $user, $request->adminRoleId)) {
                return $response;
            }
        }

        if ($request->has('firstName')) {
            $user->first_name = $request->firstName;
        }
        if ($request->has('lastName')) {
            $user->last_name = $request->lastName;
        }
        if ($request->has('email')) {
            $user->email = $request->email;
        }
        if ($request->has('mobile')) {
            $user->mobile = $request->mobile ?? '';
        }
        if ($request->has('adminRoleId')) {
            $role = AdminRole::findOrFail($request->adminRoleId);
            $user->admin_role_id = $role->id;
            $user->is_super_admin = $role->is_super;
        }

        $user->save();

        return response()->json($this->formatAdminUser($user->fresh('adminRole')));
    }

    public function destroy(Request $request, $id)
    {
        if ($response = PermissionHelper::authorizeAdmin($request, 'admin_management.delete')) {
            return $response;
        }

        $caller = $request->user();
        $user = User::findOrFail($id);

        if ($user->role !== 'admin') {
            return response()->json(['message' => 'User is not an admin.'], 404);
        }

        if ($user->id === $caller->id) {
            return response()->json(['message' => 'You cannot delete your own account.'], 403);
        }

        if ($user->is_super_admin) {
            return response()->json(['message' => 'Super admin accounts cannot be deleted.'], 403);
        }

        if ($this->remainingSuperAdminCount($user) < 1) {
            return response()->json(['message' => 'At least one super admin must remain.'], 422);
        }

        $user->delete();

        return response()->json(['message' => 'Admin user deleted successfully.']);
    }

    public function resetPassword(Request $request, $id)
    {
        if ($response = PermissionHelper::authorizeAdmin($request, 'admin_management.edit')) {
            return $response;
        }

        $request->validate([
            'password' => 'required|string|min:6',
        ]);

        $user = User::findOrFail($id);

        if ($user->role !== 'admin') {
            return response()->json(['message' => 'User is not an admin.'], 404);
        }

        $user->password = Hash::make($request->password);
        $user->save();

        return response()->json(['message' => 'Password reset successfully.']);
    }

    private function authorizeRoleAssignment(Request $request, string $adminRoleId): ?\Illuminate\Http\JsonResponse
    {
        $role = AdminRole::findOrFail($adminRoleId);

        if ($role->is_super && !$request->user()->is_super_admin) {
            return response()->json(['message' => 'Only super admins can assign the Super Admin role.'], 403);
        }

        return null;
    }

    private function authorizeRoleChange(User $caller, User $target, string $newRoleId): ?\Illuminate\Http\JsonResponse
    {
        $newRole = AdminRole::findOrFail($newRoleId);

        if ($target->id === $caller->id && $newRoleId !== $target->admin_role_id) {
            return response()->json(['message' => 'You cannot change your own admin role.'], 403);
        }

        if ($target->is_super_admin && !$caller->is_super_admin) {
            return response()->json(['message' => 'Only super admins can modify super admin accounts.'], 403);
        }

        if ($newRole->is_super && !$caller->is_super_admin) {
            return response()->json(['message' => 'Only super admins can assign the Super Admin role.'], 403);
        }

        if ($target->is_super_admin && $newRoleId !== $target->admin_role_id) {
            if ($this->remainingSuperAdminCount($target) < 1) {
                return response()->json(['message' => 'At least one super admin must remain.'], 422);
            }
        }

        return null;
    }

    private function remainingSuperAdminCount(?User $excluding = null): int
    {
        $query = User::where('role', 'admin')->where('is_super_admin', true);

        if ($excluding) {
            $query->where('id', '!=', $excluding->id);
        }

        return $query->count();
    }

    private function formatAdminUser(User $user): array
    {
        return [
            'id' => $user->id,
            'firstName' => $user->first_name,
            'lastName' => $user->last_name,
            'nickname' => $user->nickname,
            'sex' => $user->sex,
            'dob' => $user->dob,
            'email' => $user->email,
            'mobile' => $user->mobile,
            'address' => $user->address,
            'role' => $user->role,
            'status' => $user->status,
            'adminRoleId' => $user->admin_role_id,
            'adminRoleName' => $user->adminRole?->name,
            'isSuperAdmin' => (bool) $user->is_super_admin,
            'permissions' => $user->getPermissionIds(),
            'createdAt' => $user->created_at?->toISOString(),
        ];
    }
}
