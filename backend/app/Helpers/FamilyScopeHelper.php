<?php

namespace App\Helpers;

use App\Models\Member;
use Illuminate\Http\JsonResponse;

/**
 * Resolves which members a logged-in user "owns": their own member rows
 * plus junior members linked to one of their adult member rows.
 */
class FamilyScopeHelper
{
    /**
     * @param  \App\Models\User|null  $user
     * @return array<int, string>
     */
    public static function familyMemberIds($user): array
    {
        if (!$user) {
            return [];
        }

        $adultMemberIds = Member::where('user_id', $user->id)
            ->where(function ($q) {
                $q->where('member_type', 'adult')
                  ->orWhereNull('parent_member_id');
            })
            ->pluck('id')
            ->all();

        return Member::where(function ($q) use ($user, $adultMemberIds) {
                $q->where('user_id', $user->id);
                if (!empty($adultMemberIds)) {
                    $q->orWhereIn('parent_member_id', $adultMemberIds);
                }
            })
            ->pluck('id')
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @param  \App\Models\User|null  $user
     */
    public static function ownsMember($user, string $memberId): bool
    {
        if (!$user || $memberId === '') {
            return false;
        }

        return in_array($memberId, self::familyMemberIds($user), true);
    }

    /**
     * Returns null when access is allowed, otherwise a 403 response.
     * Users with role "admin" always pass; everyone else must own the member.
     *
     * @param  \App\Models\User|null  $user
     */
    public static function assertOwnsMemberOrAdmin($user, string $memberId): ?JsonResponse
    {
        if ($user && $user->role === 'admin') {
            return null;
        }

        if (self::ownsMember($user, $memberId)) {
            return null;
        }

        return response()->json(['message' => 'You do not have access to this member.'], 403);
    }
}
