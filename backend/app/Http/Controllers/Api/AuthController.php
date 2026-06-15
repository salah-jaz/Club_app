<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Mail;
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

        if (!$user->email_verified_at && $user->role !== 'admin') {
            throw ValidationException::withMessages([
                'email' => ['Please verify your email before logging in.'],
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

        $otp = rand(100000, 999999);
        $user->otp_code = $otp;
        $user->otp_expires_at = now()->addMinutes(15);
        $user->save();

        Mail::raw("Your ClubConnect verification OTP is: $otp", function($message) use ($user) {
            $message->to($user->email)->subject('Email Verification OTP');
        });

        return response()->json([
            'message' => 'OTP sent to your email. Please verify.',
            'email' => $user->email,
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

    public function updateProfile(Request $request)
    {
        $user = $request->user();

        $request->validate([
            'firstName' => 'required|string|max:255',
            'lastName' => 'required|string|max:255',
            'sex' => 'required|in:male,female',
            'dob' => 'required|date',
            'email' => 'required|string|email|max:255|unique:users,email,' . $user->id,
            'mobile' => 'required|string|max:20',
            'address' => 'required|string',
            'password' => 'nullable|string|min:6',
        ]);

        $user->first_name = $request->firstName;
        $user->last_name = $request->lastName;
        $user->sex = $request->sex;
        $user->dob = $request->dob;
        $user->email = $request->email;
        $user->mobile = $request->mobile;
        $user->address = $request->address;

        if ($request->filled('password')) {
            $user->password = Hash::make($request->password);
        }

        $user->save();

        // Synchronize member profile if exists
        $member = \App\Models\Member::where('user_id', $user->id)->first();
        if ($member) {
            $member->update([
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'dob' => $user->dob,
                'sex' => $user->sex,
            ]);
        }

        return response()->json([
            'message' => 'Credentials updated successfully.',
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

    public function verifyOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'otp' => 'required|string|size:6',
        ]);

        $user = User::where('email', $request->email)->firstOrFail();

        if (!$user->otp_code || $user->otp_code !== $request->otp || now()->greaterThan($user->otp_expires_at)) {
            throw ValidationException::withMessages([
                'otp' => ['Invalid or expired OTP.'],
            ]);
        }

        $user->email_verified_at = now();
        $user->otp_code = null;
        $user->otp_expires_at = null;
        $user->save();

        return response()->json([
            'message' => 'Email verified successfully. Awaiting admin approval.',
        ]);
    }

    public function resendOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $user = User::where('email', $request->email)->first();
        if (!$user) {
            return response()->json(['message' => 'User not found.'], 404);
        }

        if ($user->email_verified_at) {
            return response()->json(['message' => 'Email is already verified.'], 400);
        }

        $otp = rand(100000, 999999);
        $user->otp_code = $otp;
        $user->otp_expires_at = now()->addMinutes(15);
        $user->save();

        Mail::raw("Your ClubConnect verification OTP is: $otp", function($message) use ($request) {
            $message->to($request->email)->subject('Email Verification OTP');
        });

        return response()->json([
            'message' => 'OTP resent successfully.',
        ]);
    }
}
