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
}
