<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class MemberController extends Controller
{
    public function index()
    {
        $members = Member::orderBy('first_name')->get();
        return response()->json($members->map(fn($m) => $this->formatMember($m)));
    }

    public function store(Request $request)
    {
        $request->validate([
            'userId' => 'required|string',
            'firstName' => 'required|string|max:255',
            'lastName' => 'required|string|max:255',
            'dob' => 'required|date',
            'email' => 'required|email|max:255',
            'sex' => 'required|in:male,female',
            'memberType' => 'required|in:adult,junior',
            'membership' => 'required|boolean',
            'league' => 'required|boolean',
            'grade' => 'required|string',
            'biMemberId' => 'nullable|string',
            'status' => 'required|in:active,disabled',
        ]);

        $member = Member::create([
            'id' => 'm_' . Str::random(8),
            'user_id' => $request->userId,
            'first_name' => $request->firstName,
            'last_name' => $request->lastName,
            'dob' => $request->dob,
            'email' => $request->email,
            'sex' => $request->sex,
            'member_type' => $request->memberType,
            'membership' => $request->membership,
            'league' => $request->league,
            'grade' => $request->grade,
            'bi_member_id' => $request->biMemberId,
            'status' => $request->status,
            'credit' => 0.00,
        ]);

        return response()->json($this->formatMember($member), 201);
    }

    public function update(Request $request, $id)
    {
        $member = Member::findOrFail($id);

        $data = [];
        if ($request->has('firstName')) $data['first_name'] = $request->firstName;
        if ($request->has('lastName')) $data['last_name'] = $request->lastName;
        if ($request->has('dob')) $data['dob'] = $request->dob;
        if ($request->has('email')) $data['email'] = $request->email;
        if ($request->has('sex')) $data['sex'] = $request->sex;
        if ($request->has('memberType')) $data['member_type'] = $request->memberType;
        if ($request->has('membership')) $data['membership'] = $request->membership;
        if ($request->has('league')) $data['league'] = $request->league;
        if ($request->has('grade')) $data['grade'] = $request->grade;
        if ($request->has('biMemberId')) $data['bi_member_id'] = $request->biMemberId;
        if ($request->has('status')) $data['status'] = $request->status;
        if ($request->has('credit')) $data['credit'] = $request->credit;

        $member->update($data);

        return response()->json($this->formatMember($member));
    }

    public function destroy($id)
    {
        $member = Member::findOrFail($id);
        $member->delete();

        return response()->json(['message' => 'Member deleted successfully.']);
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
            'membership' => (bool)$m->membership,
            'league' => (bool)$m->league,
            'grade' => $m->grade,
            'biMemberId' => $m->bi_member_id ?? "",
            'status' => $m->status,
            'credit' => (float)$m->credit,
        ];
    }
}
