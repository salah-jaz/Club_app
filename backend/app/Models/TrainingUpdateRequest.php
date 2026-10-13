<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $training_id
 * @property string $member_id
 * @property array|null $existing_session_ids
 * @property array|null $new_session_ids
 * @property float|null $previously_paid_amount
 * @property float|null $updated_monthly_fee
 * @property float|null $new_per_session_fee
 * @property float|null $additional_amount
 * @property string $status
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 */
class TrainingUpdateRequest extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'training_id',
        'member_id',
        'existing_session_ids',
        'new_session_ids',
        'previously_paid_amount',
        'updated_monthly_fee',
        'new_per_session_fee',
        'additional_amount',
        'status',
    ];

    protected $casts = [
        'existing_session_ids' => 'array',
        'new_session_ids' => 'array',
        'previously_paid_amount' => 'float',
        'updated_monthly_fee' => 'float',
        'new_per_session_fee' => 'float',
        'additional_amount' => 'float',
    ];

    public function training(): BelongsTo
    {
        return $this->belongsTo(Training::class);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }
}
