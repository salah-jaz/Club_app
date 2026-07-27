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
        'parent_member_id',
        'first_name',
        'last_name',
        'nickname',
        'dob',
        'email',
        'sex',
        'member_type',
        'membership',
        'training_eligible',
        'play_eligible',
        'grade',
        'bi_member_id',
        'status',
        'credit',
        'skip_credit_consumption',
        'apply_discount',
    ];

    protected $casts = [
        'membership' => 'boolean',
        'training_eligible' => 'boolean',
        'play_eligible' => 'boolean',
        'skip_credit_consumption' => 'boolean',
        'apply_discount' => 'boolean',
        'credit' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function parentMember(): BelongsTo
    {
        return $this->belongsTo(Member::class, 'parent_member_id');
    }

    public function juniorMembers(): HasMany
    {
        return $this->hasMany(Member::class, 'parent_member_id');
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

    public function scopeEligibleForPlay($query)
    {
        return $query->where('member_type', 'adult')
            ->where('status', 'active')
            ->where('membership', true);
    }

    /** Juniors family heads may enroll into play schedules (non-league). */
    public function scopeEligibleForPlayAsJunior($query)
    {
        return $query->where('member_type', 'junior')
            ->where('status', 'active')
            ->where('play_eligible', true);
    }

    public function scopeEligibleForTraining($query, string $targetType = 'junior')
    {
        if (strtolower($targetType) === 'adult') {
            return $query->where('member_type', 'adult')
                ->where('status', 'active');
        }

        return $query->where('member_type', 'junior')
            ->where('status', 'active')
            ->where('training_eligible', true);
    }
}
