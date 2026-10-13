<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $schedule_id
 * @property string $member_id
 * @property string $status
 * @property \Illuminate\Support\Carbon|null $accepted_at
 * @property bool $debited
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 */
class PlayInvitation extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'schedule_id',
        'member_id',
        'status',
        'accepted_at',
        'debited',
    ];

    protected $casts = [
        'debited' => 'boolean',
        'accepted_at' => 'datetime',
    ];

    public function playSchedule(): BelongsTo
    {
        return $this->belongsTo(PlaySchedule::class, 'schedule_id');
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(Member::class);
    }
}
