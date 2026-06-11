<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
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

        $user = User::where('email', $request->email)->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Invalid credentials or pending approval.'],
            ]);
        }

        if ($user->status !== 'active') {
            throw ValidationException::withMessages([
                'email' => ['Your account is pending approval or has been rejected.'],
            ]);
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user' => [
                'id' => $user->id,
                'firstName' => $user->first_name,
                'lastName' => $user->last_name,
                'sex' => $user->sex,
                'dob' => $user->dob,
                'email' => $user->email,
                'mobile' => $user->mobile,
                'address' => $user->address,
                'role' => $user->role,
                'status' => $user->status,
                'createdAt' => $user->created_at->toISOString(),
            ]
        ]);
    }

    public function register(Request $request)
    {
        $request->validate([
            'firstName' => 'required|string|max:255',
            'lastName' => 'required|string|max:255',
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
            'sex' => $request->sex,
            'dob' => $request->dob,
            'email' => $request->email,
            'mobile' => $request->mobile,
            'address' => $request->address,
            'password' => Hash::make($request->password),
            'role' => 'member',
            'status' => 'created', // needs admin approval
        ]);

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
        $user = $request->user();
        return response()->json([
            'id' => $user->id,
            'firstName' => $user->first_name,
            'lastName' => $user->last_name,
            'sex' => $user->sex,
            'dob' => $user->dob,
            'email' => $user->email,
            'mobile' => $user->mobile,
            'address' => $user->address,
            'role' => $user->role,
            'status' => $user->status,
            'createdAt' => $user->created_at->toISOString(),
        ]);
    }
}
