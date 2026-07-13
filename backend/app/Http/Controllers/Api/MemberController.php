<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Member;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
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
        $createLogin = $request->boolean('createLogin')
            && $request->user()->role === 'admin';

        $memberRules = [
            'firstName' => 'required|string|max:255',
            'lastName' => 'required|string|max:255',
            'dob' => 'required|date',
            'email' => 'required|email|max:255',
            'sex' => 'required|in:male,female',
            'memberType' => 'required|in:adult,junior',
            'membership' => 'required|boolean',
            'league' => 'required|boolean',
            'trainingEligible' => 'sometimes|boolean',
            'skipCreditConsumption' => 'sometimes|boolean',
            'grade' => [
                'required',
                'string',
                \Illuminate\Validation\Rule::exists('grades', 'name')->where(function ($query) use ($request) {
                    $query->where('type', $request->memberType);
                })
            ],
            'biMemberId' => 'nullable|string',
            'nickname' => 'nullable|string|max:255',
            'status' => 'required|in:active,disabled',
        ];

        if ($createLogin) {
            $request->validate(array_merge($memberRules, [
                'password' => 'required|string|min:6',
                'mobile' => 'required|string|max:20',
                'address' => 'required|string',
                'email' => 'required|email|max:255|unique:users,email',
            ]));

            $member = DB::transaction(function () use ($request) {
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
                    'status' => 'active',
                ]);

                return Member::create([
                    'id' => 'm_' . Str::random(8),
                    'user_id' => $user->id,
                    'first_name' => $request->firstName,
                    'last_name' => $request->lastName,
                    'dob' => $request->dob,
                    'email' => $request->email,
                    'sex' => $request->sex,
                    'member_type' => $request->memberType,
                    'membership' => $request->membership,
                    'league' => $request->league,
                    'training_eligible' => $this->resolveTrainingEligible($request),
                    'grade' => $request->grade,
                    'bi_member_id' => $request->biMemberId,
                    'nickname' => $request->nickname,
                    'status' => $request->status,
                    'credit' => 0.00,
                    'skip_credit_consumption' => $request->boolean('skipCreditConsumption'),
                ]);
            });
        } else {
            $request->validate(array_merge($memberRules, [
                'userId' => 'required|string',
            ]));

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
                'training_eligible' => $this->resolveTrainingEligible($request),
                'grade' => $request->grade,
                'bi_member_id' => $request->biMemberId,
                'nickname' => $request->nickname,
                'status' => $request->status,
                'credit' => 0.00,
                'skip_credit_consumption' => $request->boolean('skipCreditConsumption'),
            ]);
        }

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
        if ($request->has('trainingEligible')) $data['training_eligible'] = $request->trainingEligible;
        if ($request->has('grade')) $data['grade'] = $request->grade;
        if ($request->has('biMemberId')) $data['bi_member_id'] = $request->biMemberId;
        if ($request->has('nickname')) $data['nickname'] = $request->nickname;
        if ($request->has('status')) $data['status'] = $request->status;
        if ($request->has('credit')) $data['credit'] = $request->credit;
        if ($request->has('skipCreditConsumption')) $data['skip_credit_consumption'] = $request->skipCreditConsumption;

        $member->update($data);

        if ($member->user_id) {
            $user = User::find($member->user_id);
            if ($user) {
                $userUpdates = [];
                if ($request->has('firstName')) $userUpdates['first_name'] = $request->firstName;
                if ($request->has('lastName')) $userUpdates['last_name'] = $request->lastName;
                if ($request->has('dob')) $userUpdates['dob'] = $request->dob;
                if ($request->has('email')) $userUpdates['email'] = $request->email;
                if ($request->has('sex')) $userUpdates['sex'] = $request->sex;
                if ($request->has('password') && !empty($request->password)) {
                    $userUpdates['password'] = Hash::make($request->password);
                }
                if (!empty($userUpdates)) {
                    $user->update($userUpdates);
                }
            }
        }

        return response()->json($this->formatMember($member));
    }

    public function destroy($id)
    {
        $member = Member::findOrFail($id);
        $user = auth()->user();
        
        if ($user->role !== 'admin' && $member->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }
        
        $member->delete();

        return response()->json(['message' => 'Member deleted successfully.']);
    }

    public function nextBiMemberId()
    {
        $members = Member::whereNotNull('bi_member_id')->get();
        
        $maxNum = 0;
        $padding = 3;
        
        foreach ($members as $member) {
            if (preg_match('/BI[-\s]?(\d+)/i', $member->bi_member_id, $matches)) {
                $num = (int)$matches[1];
                if ($num > $maxNum) {
                    $maxNum = $num;
                    $padding = max($padding, strlen($matches[1]));
                }
            }
        }
        
        $nextNum = $maxNum + 1;
        $nextId = 'BI' . str_pad($nextNum, $padding, '0', STR_PAD_LEFT);
        
        return response()->json(['nextBiMemberId' => $nextId]);
    }

    public function loginAs(Request $request, $id)
    {
        // Only admin role can impersonate
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $member = Member::findOrFail($id);
        
        if (!$member->user_id) {
            return response()->json(['message' => 'This member does not have a user account.'], 422);
        }

        $user = User::findOrFail($member->user_id);

        if ($user->status !== 'active') {
            return response()->json(['message' => 'User account is not active.'], 422);
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
            'trainingEligible' => (bool)$m->training_eligible,
            'grade' => $m->grade,
            'biMemberId' => $m->bi_member_id ?? "",
            'nickname' => $m->nickname ?? "",
            'status' => $m->status,
            'credit' => (float)$m->credit,
            'skipCreditConsumption' => (bool)$m->skip_credit_consumption,
        ];
    }

    private function resolveTrainingEligible(Request $request): bool
    {
        if ($request->has('trainingEligible')) {
            return $request->boolean('trainingEligible');
        }

        return $request->memberType === 'junior';
    }

    public function bulkUpload(Request $request)
    {
        $request->validate([
            'file' => 'required|file|mimes:csv,txt',
        ]);

        $file = $request->file('file');
        $filePath = $file->getRealPath();

        $rows = [];
        if (($handle = fopen($filePath, 'r')) !== false) {
            $header = null;
            while (($row = fgetcsv($handle, 1000, ',')) !== false) {
                if (!$header) {
                    $header = array_map(fn($h) => strtolower(trim(str_replace(['"', "'"], '', $h))), $row);
                } else {
                    $rows[] = array_combine($header, $row);
                }
            }
            fclose($handle);
        }

        $createdCount = 0;

        DB::transaction(function () use ($rows, &$createdCount) {
            foreach ($rows as $row) {
                $firstName = $row['first_name'] ?? $row['firstname'] ?? null;
                $lastName = $row['last_name'] ?? $row['lastname'] ?? '';
                $email = $row['email'] ?? null;

                if (empty($firstName) || empty($email)) {
                    continue;
                }

                $user = User::where('email', $email)->first();
                if (!$user) {
                    $user = User::create([
                        'id' => 'u_' . Str::random(8),
                        'first_name' => $firstName,
                        'last_name' => $lastName,
                        'email' => $email,
                        'sex' => $row['sex'] ?? 'male',
                        'dob' => $row['dob'] ?? '1990-01-01',
                        'mobile' => $row['mobile'] ?? $row['phone'] ?? '',
                        'address' => $row['address'] ?? '',
                        'password' => Hash::make('password123'),
                        'role' => 'member',
                        'status' => 'active',
                    ]);
                }

                $member = Member::where('email', $email)->first();
                if (!$member) {
                    Member::create([
                        'id' => 'm_' . Str::random(8),
                        'user_id' => $user->id,
                        'first_name' => $firstName,
                        'last_name' => $lastName,
                        'dob' => $row['dob'] ?? '1990-01-01',
                        'email' => $email,
                        'sex' => $row['sex'] ?? 'male',
                        'member_type' => $row['member_type'] ?? $row['membertype'] ?? 'adult',
                        'membership' => filter_var($row['membership'] ?? true, FILTER_VALIDATE_BOOLEAN),
                        'league' => filter_var($row['league'] ?? false, FILTER_VALIDATE_BOOLEAN),
                        'training_eligible' => filter_var($row['training_eligible'] ?? $row['trainingeligible'] ?? false, FILTER_VALIDATE_BOOLEAN),
                        'grade' => $row['grade'] ?? 'Beginner',
                        'bi_member_id' => $row['bi_member_id'] ?? $row['bimemberid'] ?? null,
                        'nickname' => $row['nickname'] ?? $row['alias'] ?? null,
                        'status' => $row['status'] ?? 'active',
                        'credit' => 0.00,
                    ]);
                    $createdCount++;
                }
            }
        });

        return response()->json([
            'message' => "Successfully uploaded and created {$createdCount} members.",
            'createdCount' => $createdCount
        ]);
    }
}
