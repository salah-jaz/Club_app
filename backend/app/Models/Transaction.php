<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Transaction extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'member_id',
        'credit_request_id',
        'type',
        'amount',
        'description',
        'reason',
        'date',
    ];

    protected $casts = [
        'amount' => 'float',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }

    /** Types that increase wallet balance. */
    public static function inflowTypes(): array
    {
        return ['credit', 'refund'];
    }

    /**
     * Type shown in transaction history.
     * Historical refunds were stored as `credit`; infer those from the description.
     */
    public function resolvedType(): string
    {
        if ($this->type === 'debit' || $this->type === 'refund') {
            return $this->type;
        }
        if (is_string($this->description) && stripos($this->description, 'refund') !== false) {
            return 'refund';
        }
        return $this->type ?: 'credit';
    }
}
