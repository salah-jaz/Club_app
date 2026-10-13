<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $schedule_id
 * @property array|null $rounds
 * @property bool $show_member_grades
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 */
class Rotation extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'schedule_id',
        'rounds',
        'show_member_grades',
    ];

    protected $casts = [
        'rounds' => 'array',
        'show_member_grades' => 'boolean',
    ];

    public function playSchedule(): BelongsTo
    {
        return $this->belongsTo(PlaySchedule::class, 'schedule_id');
    }
}
