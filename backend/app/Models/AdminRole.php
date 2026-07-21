<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AdminRole extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'name',
        'description',
        'is_super',
        'is_system',
    ];

    protected function casts(): array
    {
        return [
            'is_super' => 'boolean',
            'is_system' => 'boolean',
        ];
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(
            Permission::class,
            'admin_role_permissions',
            'admin_role_id',
            'permission_id'
        );
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'admin_role_id');
    }
}
