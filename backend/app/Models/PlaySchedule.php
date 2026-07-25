<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class PlaySchedule extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'parent_id',
        'repeat_weeks',
        'name',
        'date',
        'courts',
        'players',
        'slot_hours',
        'slot_duration',
        'session_rate',
        'hall_rate',
        'location',
        'status',
        'is_league_match',
        'league_group_ids',
    ];

    protected $casts = [
        'courts' => 'integer',
        'players' => 'integer',
        'slot_hours' => 'float',
        'session_rate' => 'float',
        'hall_rate' => 'float',
        'is_league_match' => 'boolean',
        'league_group_ids' => 'array',
        'repeat_weeks' => 'integer',
    ];

    public function playInvitations(): HasMany
    {
        return $this->hasMany(PlayInvitation::class, 'schedule_id');
    }

    public function rotation(): HasOne
    {
        return $this->hasOne(Rotation::class, 'schedule_id');
    }
}
