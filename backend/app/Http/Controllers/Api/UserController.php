<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use App\Helpers\MailHelper;

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

    public function approve(Request $request, $id)
    {
        $request->validate([
            'memberType' => 'sometimes|in:adult,junior',
            'grade' => 'sometimes|string',
            'league' => 'sometimes|boolean',
            'trainingEligible' => 'sometimes|boolean',
        ]);

        $user = User::findOrFail($id);
        $user->status = 'active';
        $user->save();

        $memberType = $request->input('memberType', 'adult');
        $trainingEligible = $request->has('trainingEligible')
            ? $request->boolean('trainingEligible')
            : ($memberType === 'junior');

        $member = Member::create([
            'id' => 'm_' . Str::random(8),
            'user_id' => $user->id,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'dob' => $user->dob,
            'email' => $user->email,
            'sex' => $user->sex,
            'member_type' => $memberType,
            'membership' => true,
            'league' => $request->boolean('league'),
            'training_eligible' => $trainingEligible,
            'grade' => $request->input('grade', 'Beginner'),
            'status' => 'active',
            'credit' => 0.00,
        ]);

        try {
            MailHelper::sendApprovalEmail($user);
        } catch (\Exception $e) {
            logger()->error("Approval email failed: " . $e->getMessage());
        }

        return response()->json([
            'message' => 'User approved successfully.',
            'user' => $this->formatUser($user),
            'member' => $this->formatMember($member),
        ]);
    }

    public function reject($id)
    {
        $user = User::findOrFail($id);
        $user->status = 'rejected';
        $user->save();

        try {
            MailHelper::sendRejectionEmail($user);
        } catch (\Exception $e) {
            logger()->error("Rejection email failed: " . $e->getMessage());
        }

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

    private function formatMember(Member $m)
    {
        return [
            'id' => $m->id,
            'userId' => $m->user_id,
            'firstName' => $m->first_name,
            'lastName' => $m->last_name,
            'dob' => $m->dob,
            'email' => $m->email,
            'sex' => $m->sex,
            'memberType' => $m->member_type,
            'membership' => (bool) $m->membership,
            'league' => (bool) $m->league,
            'trainingEligible' => (bool) $m->training_eligible,
            'grade' => $m->grade,
            'biMemberId' => $m->bi_member_id ?? '',
            'status' => $m->status,
            'credit' => (float) $m->credit,
        ];
    }
}
