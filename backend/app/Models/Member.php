<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Member extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'user_id',
        'first_name',
        'last_name',
        'dob',
        'email',
        'sex',
        'member_type',
        'membership',
        'league',
        'grade',
        'bi_member_id',
        'status',
        'credit',
    ];

    protected $casts = [
        'membership' => 'boolean',
        'league' => 'boolean',
        'credit' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function creditRequests(): HasMany
    {
        return $this->hasMany(CreditRequest::class);
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class);
    }

    public function playInvitations(): HasMany
    {
        return $this->hasMany(PlayInvitation::class);
    }

    public function trainingInvitations(): HasMany
    {
        return $this->hasMany(TrainingInvitation::class);
    }

    public function trainingDates(): HasMany
    {
        return $this->hasMany(TrainingDate::class);
    }
}
