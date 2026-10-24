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
 * @property string|null $club_location
 * @property string|null $home_captain_email
 * @property string|null $opposition_captain_email
 * @property bool $email_sent
 * @property \Illuminate\Support\Carbon|null $email_sent_at
 * @property string|null $result
 * @property string|null $home_team_name
 * @property int|null $home_total_matches
 * @property int|null $home_total_games
 * @property int|null $home_total_points
 * @property string|null $visiting_team_name
 * @property int|null $visiting_total_matches
 * @property int|null $visiting_total_games
 * @property int|null $visiting_total_points
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
        'club_location',
        'home_captain_email',
        'opposition_captain_email',
        'email_sent',
        'email_sent_at',
        'grade',
        'status',
        'result',
        'home_team_name',
        'home_total_matches',
        'home_total_games',
        'home_total_points',
        'visiting_team_name',
        'visiting_total_matches',
        'visiting_total_games',
        'visiting_total_points',
    ];

    protected $casts = [
        'email_sent' => 'boolean',
        'email_sent_at' => 'datetime',
    ];

    public function leagueGroup(): BelongsTo
    {
        return $this->belongsTo(LeagueGroup::class, 'league_group_id');
    }
}
