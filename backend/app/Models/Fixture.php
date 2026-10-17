<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $name
 * @property string $date
 * @property string $league_group_id
 * @property string $match_type
 * @property string $venue_type
 * @property string $opposition_club
 * @property string $team_name
 * @property string $grade
 * @property string $status
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 */
class Fixture extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'name',
        'date',
        'league_group_id',
        'match_type',
        'venue_type',
        'opposition_club',
        'team_name',
        'grade',
        'status',
    ];

    public function leagueGroup(): BelongsTo
    {
        return $this->belongsTo(LeagueGroup::class, 'league_group_id');
    }
}
