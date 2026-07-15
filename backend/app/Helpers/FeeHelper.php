<?php

namespace App\Helpers;

use App\Models\Member;
use App\Models\Setting;

class FeeHelper
{
    /**
     * Apply member discount settings to a base fee.
     * Percentage is applied first, then a fixed amount is subtracted.
     * Returns 0 when the member bypasses credit consumption.
     */
    public static function forMember(float $baseFee, ?Member $member): float
    {
        if (!$member) {
            return round(max(0, $baseFee), 2);
        }

        if ($member->skip_credit_consumption) {
            return 0.0;
        }

        if (!$member->apply_discount) {
            return round(max(0, $baseFee), 2);
        }

        $type = strtolower((string) $member->member_type);
        $percent = (float) (self::settingValue("{$type}_discount_percent") ?? 0);
        $amount = (float) (self::settingValue("{$type}_discount_amount") ?? 0);

        $fee = $baseFee;
        if ($percent > 0) {
            $fee = $fee * (1 - min($percent, 100) / 100);
        }
        if ($amount > 0) {
            $fee = $fee - $amount;
        }

        return round(max(0, $fee), 2);
    }

    public static function playSessionFee(float $sessionRate, float $hallRate, int $playerCount, ?Member $member): float
    {
        $base = $sessionRate + ($hallRate / max($playerCount, 1));
        return self::forMember($base, $member);
    }

    private static function settingValue(string $key): ?string
    {
        $row = Setting::where('key', $key)->first();
        return $row?->value;
    }
}
