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

    public function getNameAttribute(): string
    {
        $name = trim(($this->first_name ?? '') . ' ' . ($this->last_name ?? ''));
        return $name ?: ($this->email ?? 'User');
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

    /**
     * Permanently remove a member login account that no longer has any member profiles,
     * freeing its email for re-registration. Pending/rejected signups keep the email.
     */
    public function releaseIfOrphanedMemberAccount(): void
    {
        if ($this->role !== 'member') {
            return;
        }

        if ($this->members()->exists()) {
            return;
        }

        // Registration requests (awaiting approval or rejected) still occupy the email
        // until an admin handles them separately.
        if (in_array($this->status, ['created', 'rejected'], true)) {
            return;
        }

        $this->tokens()->delete();
        $this->delete();
    }

    /**
     * Free an email held only by an orphaned member login (no remaining member rows).
     * Safe to call before unique-email validation on sign-up / member create.
     */
    public static function releaseOrphanedMemberEmail(string $email): void
    {
        $user = static::where('email', $email)->where('role', 'member')->first();
        $user?->releaseIfOrphanedMemberAccount();
    }
}
