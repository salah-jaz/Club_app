<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\User;
use App\Helpers\MailHelper;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::with('adminRole')->where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials do not match our records.'],
            ]);
        }

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

        $user = User::create([
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
        ]);

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

        return response()->json($this->formatUser($user));
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
}
