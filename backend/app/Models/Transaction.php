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
        'type',
        'amount',
        'description',
        'date',
    ];

    protected $casts = [
        'amount' => 'float',
    ];

    protected static function booted()
    {
        static::created(function ($transaction) {
            try {
                $member = $transaction->member;
                if ($member && !empty($member->email)) {
                    \App\Helpers\MailHelper::sendTransactionEmail($member, $transaction);
                }
            } catch (\Exception $e) {
                \Log::error("Failed to send transaction email: " . $e->getMessage());
            }
        });
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }
}
