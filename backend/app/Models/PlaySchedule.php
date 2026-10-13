<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property string $id
 * @property string|null $parent_id
 * @property int|null $repeat_weeks
 * @property string $name
 * @property string $date
 * @property int $courts
 * @property int $players
 * @property float|null $slot_hours
 * @property int|null $slot_duration
 * @property float|null $session_rate
 * @property float|null $hall_rate
 * @property string|null $location
 * @property string $status
 * @property string|null $cancel_reason
 * @property bool $is_league_match
 * @property array|null $league_group_ids
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 */
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
        'cancel_reason',
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
