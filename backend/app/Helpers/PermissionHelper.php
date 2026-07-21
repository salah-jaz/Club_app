<?php

namespace App\Helpers;

use App\Models\User;
use Illuminate\Http\Request;

class PermissionHelper
{
    public static function userHasPermission(User $user, string $permission): bool
    {
        if ($user->is_super_admin) {
            return true;
        }

        if ($user->role !== 'admin') {
            return false;
        }

        return in_array($permission, $user->getPermissionIds(), true);
    }

    public static function authorizeAdmin(Request $request, ?string $permission = null): ?\Illuminate\Http\JsonResponse
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
}
