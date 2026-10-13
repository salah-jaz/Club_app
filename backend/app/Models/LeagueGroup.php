<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * @property string $id
 * @property string $name
 * @property string|null $description
 * @property string|null $group_type
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 */
class LeagueGroup extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'name',
        'description',
        'group_type',
    ];

    public function members(): BelongsToMany
    {
        return $this->belongsToMany(Member::class, 'league_group_member', 'league_group_id', 'member_id')
            ->withPivot('position')
            ->withTimestamps();
    }
}
