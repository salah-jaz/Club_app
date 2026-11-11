<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\User;
use App\Helpers\MailHelper;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    private const MAX_AUTH_ATTEMPTS = 5;
    private const AUTH_DECAY_SECONDS = 60;
    private const MAX_OTP_FAILURES = 5;
    private const OTP_ATTEMPT_TTL_MINUTES = 15;

    /**
     * Abort with HTTP 429 when the given limiter key has exhausted its attempts.
     */
    private function ensureNotRateLimited(string $key, int $max = self::MAX_AUTH_ATTEMPTS): void
    {
        if (RateLimiter::tooManyAttempts($key, $max)) {
            $seconds = RateLimiter::availableIn($key);
            throw new HttpResponseException(response()->json([
                'message' => 'Too many attempts. Please try again in ' . $seconds . ' seconds.',
                'retry_after' => $seconds,
            ], 429)->header('Retry-After', (string) $seconds));
        }
    }

    private function throttleKey(Request $request, string $scope): string
    {
        return $scope . ':' . Str::lower((string) $request->input('email')) . '|' . $request->ip();
    }

    private function otpAttemptsKey(string $email): string
    {
        return 'pwd_reset_otp_attempts:' . sha1(Str::lower($email));
    }

    private function recordFailedOtp(string $email): void
    {
        $key = $this->otpAttemptsKey($email);
        Cache::add($key, 0, now()->addMinutes(self::OTP_ATTEMPT_TTL_MINUTES));
        $attempts = Cache::increment($key);

        if ($attempts >= self::MAX_OTP_FAILURES) {
            DB::table('password_reset_tokens')->where('email', $email)->delete();
            Cache::forget($key);
        }
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $throttleKey = $this->throttleKey($request, 'login');
        $this->ensureNotRateLimited($throttleKey);

        $user = User::with('adminRole')->where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            RateLimiter::hit($throttleKey, self::AUTH_DECAY_SECONDS);
            throw ValidationException::withMessages([
                'email' => ['The provided credentials do not match our records.'],
            ]);
        }

        RateLimiter::clear($throttleKey);

        if ($user->status === 'rejected') {
            throw ValidationException::withMessages([
                'email' => ['Your account registration request has been declined. Please contact the administrator.'],
            ]);
        }

        if ($user->status === 'created') {
            throw ValidationException::withMessages([
                'email' => ['Your registration request is pending admin approval. You will receive an email once approved.'],
            ]);
        }

        if (Hash::needsRehash($user->password)) {
            $user->password = Hash::make($request->password);
            $user->save();
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => $this->formatUser($user),
        ]);
    }

    public function register(Request $request)
    {
        // Reclaim emails left behind by permanently deleted members (orphaned logins)
        if ($request->filled('email')) {
            User::releaseOrphanedMemberEmail((string) $request->email);
            if (Member::where('email', $request->email)->where('status', 'active')->exists()) {
                throw ValidationException::withMessages([
                    'email' => ['An active member with this email already exists.'],
                ]);
            }
        }

        $request->validate([
            'firstName' => 'required|string|max:255',
            'lastName' => 'required|string|max:255',
            'nickname' => 'nullable|string|max:255',
            'sex' => 'required|in:male,female',
            'dob' => 'required|date',
            'email' => 'required|string|email|max:255|unique:users,email',
            'mobile' => 'required|string|max:20',
            'address' => 'required|string',
            'password' => 'required|string|min:6',
        ]);

        $privacyAccepted = $request->boolean('agreedToPrivacy')
            || $request->boolean('privacy_policy_accepted')
            || $request->boolean('agreed_to_privacy')
            || $request->input('agreedToPrivacy') === true
            || $request->input('agreedToPrivacy') === '1'
            || $request->input('agreedToPrivacy') === 1;

        if (!$privacyAccepted) {
            throw ValidationException::withMessages([
                'agreedToPrivacy' => ['You must agree to the Club Privacy Policy to continue.'],
            ]);
        }

        $attributes = [
            'id' => 'u_' . Str::random(8),
            'first_name' => $request->firstName,
            'last_name' => $request->lastName,
            'nickname' => $request->nickname,
            'sex' => $request->sex,
            'dob' => $request->dob,
            'email' => $request->email,
            'mobile' => $request->mobile,
            'address' => $request->address,
            'password' => Hash::make($request->password),
            'role' => 'member',
            'status' => 'created', // needs admin approval
        ];

        if (Schema::hasColumn('users', 'privacy_accepted_at')) {
            $attributes['privacy_accepted_at'] = now();
        }

        $user = User::create($attributes);

        try {
            MailHelper::sendRegistrationEmail($user);
        } catch (\Exception $e) {
            logger()->error("Registration email failed: " . $e->getMessage());
        }

        return response()->json([
            'message' => 'Registration submitted. Awaiting admin approval.',
            'user_id' => $user->id
        ], 201);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json([
            'message' => 'Logged out successfully.'
        ]);
    }

    public function me(Request $request)
    {
        $user = $request->user()->load('adminRole');

        if (in_array($user->status, ['rejected', 'created'], true)) {
            $user->currentAccessToken()?->delete();
            return response()->json([
                'message' => $user->status === 'rejected'
                    ? 'Your account has been declined. Please contact the administrator.'
                    : 'Your registration is still pending admin approval.',
            ], 401);
        }

        return response()->json($this->formatUser($user));
    }

    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'firstName' => 'required|string|max:255',
            'lastName' => 'required|string|max:255',
            'nickname' => 'nullable|string|max:255',
            'sex' => 'required|in:male,female',
            'dob' => 'required|date',
            'email' => 'required|string|email|max:255|unique:users,email,' . $user->id,
            'mobile' => 'required|string|max:20',
            'address' => 'required|string',
            'password' => 'nullable|string|min:6',
        ]);

        $user->first_name = $request->firstName;
        $user->last_name = $request->lastName;
        if ($request->has('nickname')) {
            $user->nickname = $request->nickname;
        }
        $user->sex = $request->sex;
        $user->dob = $request->dob;
        $user->email = $request->email;
        $user->mobile = $request->mobile;
        $user->address = $request->address;

        $passwordChanged = $request->filled('password');
        if ($passwordChanged) {
            $user->password = Hash::make($request->password);
        }

        $user->save();

        if ($passwordChanged) {
            // Revoke every other session/token; keep the one making this request.
            $current = $user->currentAccessToken();
            if ($current instanceof PersonalAccessToken) {
                $user->tokens()->where('id', '!=', $current->id)->delete();
            } else {
                $user->tokens()->delete();
            }
        }

        // Synchronize member profile if exists
        $member = Member::where('user_id', $user->id)
            ->where(function ($q) {
                $q->where('member_type', 'adult')
                  ->orWhereNull('parent_member_id');
            })
            ->first();

        if ($member) {
            $memberUpdates = [
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'mobile' => $user->mobile,
                'dob' => $user->dob,
                'sex' => $user->sex,
            ];
            if ($request->has('nickname')) {
                $memberUpdates['nickname'] = $user->nickname;
            }
            $member->update($memberUpdates);
        }

        return response()->json([
            'message' => 'Credentials updated successfully.',
            'user' => $this->formatUser($user->fresh()->load('adminRole')),
        ]);
    }

    private function formatUser(User $user): array
    {
        $member = Member::where('user_id', $user->id)
            ->orderByRaw("CASE WHEN member_type = 'adult' THEN 0 WHEN parent_member_id IS NULL THEN 1 ELSE 2 END")
            ->orderBy('created_at')
            ->first();

        $firstName = $user->first_name;
        $lastName = $user->last_name;

        if ($member && ($member->member_type === 'adult' || is_null($member->parent_member_id))) {
            $firstName = $member->first_name ?: $user->first_name;
            $lastName = $member->last_name ?: $user->last_name;

            if (($user->first_name !== $firstName || $user->last_name !== $lastName) && !empty($firstName)) {
                $user->first_name = $firstName;
                $user->last_name = $lastName;
                $user->save();
            }
        }

        return [
            'id' => $user->id,
            'firstName' => $firstName,
            'lastName' => $lastName,
            'nickname' => $member?->nickname ?? $user->nickname,
            'sex' => $member?->sex ?? $user->sex,
            'dob' => $member?->dob ?? $user->dob,
            'email' => $user->email,
            'mobile' => $member?->mobile ?? $user->mobile,
            'address' => $user->address,
            'role' => $user->role,
            'status' => $user->status,
            'adminRoleId' => $user->role === 'admin' ? $user->admin_role_id : null,
            'adminRoleName' => $user->role === 'admin' ? $user->adminRole?->name : null,
            'isSuperAdmin' => $user->role === 'admin' ? (bool) $user->is_super_admin : false,
            'permissions' => $user->getPermissionIds(),
            'createdAt' => $user->created_at->toISOString(),
        ];
    }

    public function forgotPassword(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $throttleKey = $this->throttleKey($request, 'forgot-password');
        $this->ensureNotRateLimited($throttleKey);
        RateLimiter::hit($throttleKey, self::AUTH_DECAY_SECONDS);

        $maskedEmail = $this->maskEmail($request->email);

        // Always respond with the same message body (no status/body branching on existence).
        $genericResponse = response()->json([
            'message' => 'If an account exists for that email address, a password reset OTP has been sent.',
            'maskedEmail' => $maskedEmail,
        ]);

        $user = User::where('email', $request->email)->first();

        if (!$user || $user->status === 'rejected') {
            return $genericResponse;
        }

        // Generate 6-digit OTP code
        $otp = sprintf("%06d", random_int(0, 999999));

        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $request->email],
            [
                'token' => Hash::make($otp),
                'created_at' => now(),
            ]
        );
        Cache::forget($this->otpAttemptsKey($request->email));

        try {
            MailHelper::sendPasswordResetOtpEmail($user, $otp);
        } catch (\Exception $e) {
            // Logged only; the response must not reveal that the account exists or SMTP details.
            logger()->error("Password reset OTP email failed: " . $e->getMessage());
        }

        return $genericResponse;
    }

    public function verifyResetOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'otp' => 'required|string|size:6',
        ]);

        $throttleKey = $this->throttleKey($request, 'verify-reset-otp');
        $this->ensureNotRateLimited($throttleKey);
        RateLimiter::hit($throttleKey, self::AUTH_DECAY_SECONDS);

        $record = DB::table('password_reset_tokens')->where('email', $request->email)->first();

        if (!$record) {
            throw ValidationException::withMessages([
                'otp' => ['No password reset request found for this email address.'],
            ]);
        }

        // Check 15-minute expiration
        if (\Carbon\Carbon::parse($record->created_at)->addMinutes(15)->isPast()) {
            DB::table('password_reset_tokens')->where('email', $request->email)->delete();
            Cache::forget($this->otpAttemptsKey($request->email));
            throw ValidationException::withMessages([
                'otp' => ['This OTP has expired. Please request a new OTP.'],
            ]);
        }

        if (!Hash::check($request->otp, $record->token)) {
            $this->recordFailedOtp($request->email);
            throw ValidationException::withMessages([
                'otp' => ['The OTP entered is incorrect. Please try again.'],
            ]);
        }

        RateLimiter::clear($throttleKey);

        return response()->json([
            'message' => 'OTP verified successfully.',
            'verified' => true,
        ]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'otp' => 'required|string|size:6',
            'password' => 'required|string|min:6|confirmed',
        ]);

        $throttleKey = $this->throttleKey($request, 'reset-password');
        $this->ensureNotRateLimited($throttleKey);
        RateLimiter::hit($throttleKey, self::AUTH_DECAY_SECONDS);

        $record = DB::table('password_reset_tokens')->where('email', $request->email)->first();

        if (!$record) {
            throw ValidationException::withMessages([
                'otp' => ['No password reset request found. Please request a new OTP.'],
            ]);
        }

        if (\Carbon\Carbon::parse($record->created_at)->addMinutes(15)->isPast()) {
            DB::table('password_reset_tokens')->where('email', $request->email)->delete();
            Cache::forget($this->otpAttemptsKey($request->email));
            throw ValidationException::withMessages([
                'otp' => ['This OTP has expired. Please request a new OTP.'],
            ]);
        }

        if (!Hash::check($request->otp, $record->token)) {
            $this->recordFailedOtp($request->email);
            throw ValidationException::withMessages([
                'otp' => ['The OTP entered is incorrect. Please try again.'],
            ]);
        }

        $user = User::where('email', $request->email)->first();
        if (!$user) {
            throw ValidationException::withMessages([
                'email' => ['User account not found.'],
            ]);
        }

        $user->password = Hash::make($request->password);
        $user->save();

        // Invalidate every existing session for this account.
        $user->tokens()->delete();

        // Delete used token record
        DB::table('password_reset_tokens')->where('email', $request->email)->delete();
        Cache::forget($this->otpAttemptsKey($request->email));
        RateLimiter::clear($throttleKey);

        try {
            MailHelper::sendPasswordResetSuccessEmail($user);
        } catch (\Exception $e) {
            logger()->error("Password reset success email failed: " . $e->getMessage());
        }

        return response()->json([
            'message' => 'Password reset successfully. You can now sign in with your new password.',
        ]);
    }

    private function maskEmail(string $email): string
    {
        $parts = explode('@', $email);
        if (count($parts) !== 2) {
            return $email;
        }

        $name = $parts[0];
        $domain = $parts[1];
        $length = strlen($name);

        if ($length <= 2) {
            $maskedName = str_repeat('*', $length);
        } elseif ($length <= 4) {
            $maskedName = substr($name, 0, 1) . str_repeat('*', $length - 1);
        } else {
            $keepFirst = 1;
            $keepLast = min(2, max(1, $length - 3));
            $stars = str_repeat('*', max(3, $length - $keepFirst - $keepLast));
            $maskedName = substr($name, 0, $keepFirst) . $stars . substr($name, -$keepLast);
        }

        return $maskedName . '@' . $domain;
    }
}

