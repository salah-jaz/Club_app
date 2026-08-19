<?php

namespace App\Helpers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PermissionHelper
{
    public static function userHasPermission(User $user, string $permission): bool
    {
        if ($user->role !== 'admin') {
            return false;
        }

        if ($user->is_super_admin || !$user->admin_role_id) {
            return true;
        }

        return in_array($permission, $user->getPermissionIds(), true);
    }

    public static function userHasModule(User $user, string $module): bool
    {
        if ($user->role !== 'admin') {
            return false;
        }

        if ($user->is_super_admin || !$user->admin_role_id) {
            return true;
        }

        foreach ($user->getPermissionIds() as $id) {
            if (str_starts_with($id, $module . '.')) {
                return true;
            }
        }

        return false;
    }

    public static function authorizeAdmin(Request $request, ?string $permission = null): ?JsonResponse
    {
        $user = $request->user();

        if (!$user || $user->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized. Admin access required.'], 403);
        }

        if ($permission && !self::userHasPermission($user, $permission)) {
            return response()->json(['message' => 'You do not have permission to perform this action.'], 403);
        }

        return null;
    }

    /**
     * Admin-only endpoint: caller must be an admin with the given permission.
     */
    public static function requireAdminPermission(Request $request, string $permission): ?JsonResponse
    {
        return self::authorizeAdmin($request, $permission);
    }

    /**
     * Shared member/admin endpoint: only enforce permission when the caller is an admin.
     */
    public static function denyAdminUnless(Request $request, string $permission): ?JsonResponse
    {
        $user = $request->user();

        if (!$user || $user->role !== 'admin') {
            return null;
        }

        if (!self::userHasPermission($user, $permission)) {
            return response()->json(['message' => 'You do not have permission to perform this action.'], 403);
        }

        return null;
    }
}
