<?php

namespace App\Helpers;

use App\Models\Member;
use App\Models\Setting;

class FeeHelper
{
    /**
     * Apply member discount settings to a base fee.
     * Uses either percentage or fixed amount based on discount mode — never both.
     * Returns 0 when the member bypasses credit consumption.
     */
    public static function forMember(float $baseFee, ?Member $member, ?bool $applyDiscountOverride = null): float
    {
        if (!$member) {
            return round(max(0, $baseFee), 2);
        }

        if ($member->skip_credit_consumption) {
            return 0.0;
        }

        $shouldApplyDiscount = $applyDiscountOverride !== null ? $applyDiscountOverride : (bool) $member->apply_discount;

        if (!$shouldApplyDiscount) {
            return round(max(0, $baseFee), 2);
        }

        $type = strtolower((string) $member->member_type);
        $percent = (float) (self::settingValue("{$type}_discount_percent") ?? 0);
        $amount = (float) (self::settingValue("{$type}_discount_amount") ?? 0);
        $mode = self::settingValue("{$type}_discount_mode");
        if ($mode === 'off') {
            return round(max(0, $baseFee), 2);
        }
        if ($mode !== 'percent' && $mode !== 'amount') {
            $mode = ($amount > 0 && $percent <= 0) ? 'amount' : 'percent';
        }

        $fee = $baseFee;
        if ($mode === 'percent' && $percent > 0) {
            $fee = $fee * (1 - min($percent, 100) / 100);
        } elseif ($mode === 'amount' && $amount > 0) {
            $fee = $fee - $amount;
        }

        return round(max(0, $fee), 2);
    }

    public static function playSessionFee(float $sessionRate, float $hallRate = 0, int $playerCount = 1, ?Member $member = null): float
    {
        // Billing uses session rate only (hall rate is informational).
        return self::forMember($sessionRate, $member);
    }

    private static function settingValue(string $key): ?string
    {
        $row = Setting::where('key', $key)->first();
        return $row?->value;
    }
}
