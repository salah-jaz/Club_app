<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'first_name',
        'last_name',
        'nickname',
        'sex',
        'dob',
        'email',
        'mobile',
        'address',
        'password',
        'role',
        'admin_role_id',
        'is_super_admin',
        'created_by',
        'status',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_super_admin' => 'boolean',
        ];
    }

    public function adminRole(): BelongsTo
    {
        return $this->belongsTo(AdminRole::class, 'admin_role_id');
    }

    public function getPermissionIds(): array
    {
        if ($this->role !== 'admin') {
            return [];
        }

        if ($this->is_super_admin || !$this->admin_role_id) {
            return Permission::pluck('id')->all();
        }

        $role = $this->relationLoaded('adminRole') ? $this->adminRole : $this->adminRole()->first();

        if (!$role) {
            return [];
        }

        if ($role->is_super) {
            return Permission::pluck('id')->all();
        }

        return $role->permissions()->pluck('permissions.id')->all();
    }

    public function members(): HasMany
    {
        return $this->hasMany(Member::class);
    }
}
