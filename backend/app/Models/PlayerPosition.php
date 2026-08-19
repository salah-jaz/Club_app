<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PlayerPosition extends Model
{
    protected $table = 'player_positions';

    protected $fillable = ['name', 'skip_league_fee'];

    protected $casts = [
        'skip_league_fee' => 'boolean',
    ];
}
