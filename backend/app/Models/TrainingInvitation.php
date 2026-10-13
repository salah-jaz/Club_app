<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $training_id
 * @property string $member_id
 * @property string $status
 * @property bool|null $apply_discount
 * @property float|null $calculated_monthly_fee
 * @property float|null $calculated_per_session_fee
 * @property float|null $accepted_monthly_fee
 * @property int|null $accepted_repeat_weeks
 * @property float|null $accepted_per_session_fee
 * @property float|null $accepted_amount
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 */
class TrainingInvitation extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'training_id',
        'member_id',
        'status',
        'apply_discount',
        'calculated_monthly_fee',
        'calculated_per_session_fee',
        'accepted_monthly_fee',
        'accepted_repeat_weeks',
        'accepted_per_session_fee',
        'accepted_amount',
    ];

    protected $casts = [
        'apply_discount' => 'boolean',
        'calculated_monthly_fee' => 'float',
        'calculated_per_session_fee' => 'float',
        'accepted_monthly_fee' => 'float',
        'accepted_repeat_weeks' => 'integer',
        'accepted_per_session_fee' => 'float',
        'accepted_amount' => 'float',
    ];

    public static function getSnapshotData(Training $tr, Member $member): array
    {
        $applyDiscount = (bool) $member->apply_discount;
        $repeatWeeks = max(1, (int) ($tr->repeat_weeks ?? 1));
        $monthlyFee = \App\Helpers\FeeHelper::forMember((float) ($tr->fees ?? 0), $member, $applyDiscount);
        $perSessionFee = round($monthlyFee / $repeatWeeks, 2);

        return [
            'apply_discount' => $applyDiscount,
            'calculated_monthly_fee' => $monthlyFee,
            'calculated_per_session_fee' => $perSessionFee,
        ];
    }

    public function training(): BelongsTo
    {
        return $this->belongsTo(Training::class);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }
}
