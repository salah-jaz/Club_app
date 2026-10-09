<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Training extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'parent_id',
        'name',
        'start_date',
        'end_date',
        'repeat_weeks',
        'repeat_months',
        'sessions',
        'slots',
        'duration',
        'fees',
        'coach',
        'location',
        'status',
        'cancel_reason',
        'target_type',
        'is_group_training',
        'league_group_ids',
    ];

    protected $casts = [
        'repeat_weeks' => 'integer',
        'repeat_months' => 'integer',
        'sessions' => 'integer',
        'slots' => 'integer',
        'fees' => 'float',
        'is_group_training' => 'boolean',
        'league_group_ids' => 'array',
    ];

    public function trainingInvitations(): HasMany
    {
        return $this->hasMany(TrainingInvitation::class);
    }

    public function trainingDates(): HasMany
    {
        return $this->hasMany(TrainingDate::class);
    }

    public function trainingUpdateRequests(): HasMany
    {
        return $this->hasMany(TrainingUpdateRequest::class);
    }

    public function getSlotsAttribute($value): int
    {
        if ($this->is_group_training && !empty($this->league_group_ids) && !in_array($this->status, ['closed', 'finished', 'cancelled'])) {
            $phase = \App\Helpers\SessionTimingHelper::trainingSessionPhase($this);
            if ($phase !== \App\Helpers\SessionTimingHelper::PHASE_FINISHED) {
                $groupIds = is_array($this->league_group_ids) ? $this->league_group_ids : (json_decode($this->league_group_ids, true) ?? []);
                if (!empty($groupIds)) {
                    $memberIds = \Illuminate\Support\Facades\DB::table('league_group_member')
                        ->whereIn('league_group_id', $groupIds)
                        ->pluck('member_id')
                        ->unique()
                        ->values()
                        ->all();
                    
                    return \App\Models\Member::where('member_type', $this->target_type ?? 'junior')
                        ->where('status', 'active')
                        ->whereIn('id', $memberIds)
                        ->count();
                }
            }
        }
        return (int) $value;
    }
}
