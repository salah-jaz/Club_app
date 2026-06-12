<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::query();

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        $users = $query->orderBy('created_at', 'desc')->get();

        return response()->json($users->map(fn($u) => $this->formatUser($u)));
    }

    public function approve($id)
    {
        $user = User::findOrFail($id);
        $user->status = 'active';
        $user->save();

        // Automatically create a member profile for the approved user
        \App\Models\Member::create([
            'id' => 'm_' . \Illuminate\Support\Str::random(8),
            'user_id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'dob' => $user->dob,
            'email' => $user->email,
            'sex' => $user->sex,
            'member_type' => 'adult',
            'membership' => true,
            'league' => false,
            'grade' => 'Beginner',
            'status' => 'active',
            'credit' => 0.00,
        ]);

        return response()->json([
            'message' => 'User approved successfully.',
            'user' => $this->formatUser($user)
        ]);
    }

    public function approveAll()
    {
        $users = User::where('status', 'created')->get();
        $approvedUsers = [];

        foreach ($users as $user) {
            $user->status = 'active';
            $user->save();

            // Automatically create a member profile for the approved user
            \App\Models\Member::create([
                'id' => 'm_' . \Illuminate\Support\Str::random(8),
                'user_id' => $user->id,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'dob' => $user->dob,
                'email' => $user->email,
                'sex' => $user->sex,
                'member_type' => 'adult',
                'membership' => true,
                'league' => false,
                'grade' => 'Beginner',
                'status' => 'active',
                'credit' => 0.00,
            ]);

            $approvedUsers[] = $this->formatUser($user);
        }

        return response()->json([
            'message' => 'All pending users approved successfully.',
            'users' => $approvedUsers
        ]);
    }

    public function reject($id)
    {
        $user = User::findOrFail($id);
        $user->status = 'rejected';
        $user->save();

        return response()->json([
            'message' => 'User rejected successfully.',
            'user' => $this->formatUser($user)
        ]);
    }

    public function setRole(Request $request, $id)
    {
        $request->validate([
            'role' => 'required|in:admin,member,volunteer',
        ]);

        $user = User::findOrFail($id);
        $user->role = $request->role;
        $user->save();

        return response()->json([
            'message' => 'User role updated successfully.',
            'user' => $this->formatUser($user)
        ]);
    }

    private function formatUser(User $u)
    {
        return [
            'id' => $u->id,
            'firstName' => $u->first_name,
            'lastName' => $u->last_name,
            'sex' => $u->sex,
            'dob' => $u->dob,
            'email' => $u->email,
            'mobile' => $u->mobile,
            'address' => $u->address,
            'role' => $u->role,
            'status' => $u->status,
            'createdAt' => $u->created_at->toISOString(),
        ];
    }
}
