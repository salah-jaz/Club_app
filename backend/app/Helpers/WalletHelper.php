<?php

namespace App\Helpers;

use App\Models\Member;

class WalletHelper
{
    /**
     * Juniors share their parent adult's wallet.
     * Returns the parent when the member has a known parent, otherwise the member themselves.
     */
    public static function resolveMember(Member $member): Member
    {
        if ($member->parent_member_id) {
            $parent = Member::find($member->parent_member_id);
            if ($parent) {
                return $parent;
            }
        }

        return $member;
    }
}
