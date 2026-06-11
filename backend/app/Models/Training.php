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
        'name',
        'start_date',
        'end_date',
        'sessions',
        'slots',
        'duration',
        'fees',
        'coach',
        'location',
        'status',
    ];

    protected $casts = [
        'sessions' => 'integer',
        'slots' => 'integer',
        'fees' => 'float',
    ];

    public function trainingInvitations(): HasMany
    {
        return $this->hasMany(TrainingInvitation::class);
    }

    public function trainingDates(): HasMany
    {
        return $this->hasMany(TrainingDate::class);
    }
}
