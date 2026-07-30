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
    public function index(Request $request)
    {
        $query = Member::query();

        if ($search = trim((string) $request->query('search', ''))) {
            $like = '%' . $search . '%';
            $query->where(function ($q) use ($like) {
                $q->where('first_name', 'like', $like)
                    ->orWhere('last_name', 'like', $like)
                    ->orWhereRaw("CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')) LIKE ?", [$like])
                    ->orWhere('bi_member_id', 'like', $like)
                    ->orWhere('nickname', 'like', $like);
            });
        }

        // Non-zero balances first, then name (numeric-aware via natural DB order on first/last)
        $query->orderByRaw('CASE WHEN credit != 0 THEN 0 ELSE 1 END')
            ->orderBy('first_name')
            ->orderBy('last_name');

        if ($request->filled('limit')) {
            $query->limit(max(1, min((int) $request->query('limit'), 100)));
        }

        $members = $query->get();

        return response()->json($members->map(fn($m) => $this->formatMember($m)));
    }

    public function store(Request $request)
    {
        $user = $request->user();
        $isAdmin = $user && $user->role === 'admin';
        $createLogin = $request->boolean('createLogin') && $isAdmin;

        $memberRules = [
            'firstName' => 'required|string|max:255',
            'lastName' => 'required|string|max:255',
            'dob' => 'required|date',
            'email' => 'required|email|max:255',
            'sex' => 'required|in:male,female',
            'memberType' => 'required|in:adult,junior',
            'membership' => $isAdmin ? 'required|boolean' : 'sometimes|boolean',
            'trainingEligible' => 'sometimes|boolean',
            'playEligible' => 'sometimes|boolean',
            'skipCreditConsumption' => 'sometimes|boolean',
            'applyDiscount' => 'sometimes|boolean',
            'grade' => [
                'required',
                'string',
                \Illuminate\Validation\Rule::exists('grades', 'name')->where(function ($query) use ($request) {
                    $query->where('type', $request->memberType);
                })
            ],
            'biMemberId' => 'nullable|string',
            'nickname' => 'nullable|string|max:255',
            'status' => $isAdmin
                ? 'required|in:active,disabled,pending,rejected'
                : 'sometimes|in:active,disabled,pending,rejected',
            'parentMemberId' => 'nullable|string|exists:members,id',
        ];

        if ($createLogin) {
            $request->validate(array_merge($memberRules, [
                'password' => 'required|string|min:6',
                'mobile' => 'required|string|max:20',
                'address' => 'required|string',
                'email' => 'required|email|max:255|unique:users,email',
            ]));

            $member = DB::transaction(function () use ($request) {
                $parentId = $request->input('parentMemberId');
                $parent = $parentId ? Member::find($parentId) : null;
                if ($request->memberType === 'junior' && $parent && $parent->member_type !== 'adult') {
                    abort(response()->json(['message' => 'Parent must be an adult member.'], 422));
                }

                // Juniors with a parent share the parent's login account (no separate login)
                if ($request->memberType === 'junior' && $parent && $parent->user_id) {
                    return Member::create([
                        'id' => 'm_' . Str::random(8),
                        'user_id' => $parent->user_id,
                        'parent_member_id' => $parent->id,
                        'first_name' => $request->firstName,
                        'last_name' => $request->lastName,
                        'dob' => $request->dob,
                        'email' => $request->email,
                        'sex' => $request->sex,
                        'member_type' => 'junior',
                        'membership' => $request->membership,
                        'training_eligible' => $this->resolveTrainingEligible($request),
                        'play_eligible' => $this->resolvePlayEligible($request),
                        'grade' => $request->grade,
                        'bi_member_id' => $request->biMemberId,
                        'nickname' => $request->nickname,
                        'status' => $request->status,
                        'credit' => 0.00,
                        'skip_credit_consumption' => $request->has('skipCreditConsumption') ? $request->boolean('skipCreditConsumption') : false,
                        'apply_discount' => $request->has('applyDiscount') ? $request->boolean('applyDiscount') : false,
                    ]);
                }

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
                    'parent_member_id' => $request->memberType === 'junior' ? $parentId : null,
                    'first_name' => $request->firstName,
                    'last_name' => $request->lastName,
                    'dob' => $request->dob,
                    'email' => $request->email,
                    'sex' => $request->sex,
                    'member_type' => $request->memberType,
                    'membership' => $request->has('membership') ? $request->boolean('membership') : ($request->memberType === 'adult'),
                    'training_eligible' => $this->resolveTrainingEligible($request),
                    'play_eligible' => $this->resolvePlayEligible($request),
                    'grade' => $request->grade,
                    'bi_member_id' => $request->biMemberId,
                    'nickname' => $request->nickname,
                    'status' => $request->status,
                    'credit' => 0.00,
                    'skip_credit_consumption' => $request->has('skipCreditConsumption') ? $request->boolean('skipCreditConsumption') : false,
                    'apply_discount' => $request->has('applyDiscount') ? $request->boolean('applyDiscount') : false,
                ]);
            });
        } else {
            $request->validate(array_merge($memberRules, [
                'userId' => ($isAdmin && $request->memberType !== 'junior') ? 'required|string' : 'nullable|string',
            ]));

            $biMemberId = $request->biMemberId;
            if (empty($biMemberId)) {
                $biMemberId = $this->nextBiMemberId()->getData()->nextBiMemberId ?? null;
            }

            // Members may only add juniors under their own account (pending approval).
            if (!$isAdmin) {
                if ($request->memberType !== 'junior') {
                    return response()->json([
                        'message' => 'Members can only register junior family members.',
                    ], 422);
                }

                $dobFormatted = \Carbon\Carbon::parse($request->dob)->format('Y-m-d');
                $firstNameTrimmed = mb_strtolower(trim($request->firstName));
                $lastNameTrimmed = mb_strtolower(trim($request->lastName));

                $duplicateExists = Member::where('member_type', 'junior')
                    ->whereRaw('LOWER(TRIM(first_name)) = ?', [$firstNameTrimmed])
                    ->whereRaw('LOWER(TRIM(last_name)) = ?', [$lastNameTrimmed])
                    ->whereDate('dob', $dobFormatted)
                    ->exists();

                if ($duplicateExists) {
                    return response()->json([
                        'message' => 'This junior is already registered under another member. Duplicate registration is not allowed.',
                    ], 422);
                }

                $parent = Member::where('user_id', $user->id)
                    ->where('member_type', 'adult')
                    ->orderBy('created_at')
                    ->first();

                $member = Member::create([
                    'id' => 'm_' . Str::random(8),
                    'user_id' => $user->id,
                    'parent_member_id' => $parent?->id,
                    'first_name' => $request->firstName,
                    'last_name' => $request->lastName,
                    'dob' => $request->dob,
                    'email' => $request->email ?: ($user->email ?? ''),
                    'sex' => $request->sex,
                    'member_type' => 'junior',
                    'membership' => false,
                    'training_eligible' => false,
                    'play_eligible' => false,
                    'grade' => $request->grade,
                    'bi_member_id' => $biMemberId,
                    'nickname' => $request->nickname,
                    'status' => 'pending',
                    'credit' => 0.00,
                    'skip_credit_consumption' => false,
                    'apply_discount' => false,
                ]);

                return response()->json($this->formatMember($member), 201);
            }

            $parentId = $request->input('parentMemberId');
            $parent = $parentId ? Member::find($parentId) : null;
            $userId = $request->userId;
            if ($request->memberType === 'junior' && $parent && $parent->user_id) {
                $userId = $parent->user_id;
            }

            $member = Member::create([
                'id' => 'm_' . Str::random(8),
                'user_id' => $userId,
                'parent_member_id' => $request->memberType === 'junior' ? ($parentId ?: null) : null,
                'first_name' => $request->firstName,
                'last_name' => $request->lastName,
                'dob' => $request->dob,
                'email' => $request->email,
                'sex' => $request->sex,
                'member_type' => $request->memberType,
                'membership' => $request->has('membership') ? $request->boolean('membership') : ($request->memberType === 'adult'),
                'training_eligible' => $this->resolveTrainingEligible($request),
                'play_eligible' => $this->resolvePlayEligible($request),
                'grade' => $request->grade,
                'bi_member_id' => $biMemberId,
                'nickname' => $request->nickname,
                'status' => $request->status,
                'credit' => 0.00,
                'skip_credit_consumption' => $request->has('skipCreditConsumption') ? $request->boolean('skipCreditConsumption') : false,
                'apply_discount' => $request->has('applyDiscount') ? $request->boolean('applyDiscount') : false,
            ]);
        }

        return response()->json($this->formatMember($member), 201);
    }

    public function update(Request $request, $id)
    {
        $member = Member::findOrFail($id);
        $user = $request->user();
        $isAdmin = $user && $user->role === 'admin';

        if (!$isAdmin && $member->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $data = [];
        if ($request->has('firstName')) $data['first_name'] = $request->firstName;
        if ($request->has('lastName')) $data['last_name'] = $request->lastName;
        if ($request->has('dob')) $data['dob'] = $request->dob;
        if ($request->has('email')) $data['email'] = $request->email;
        if ($request->has('sex')) $data['sex'] = $request->sex;
        if ($request->has('grade')) $data['grade'] = $request->grade;
        if ($request->has('biMemberId')) $data['bi_member_id'] = $request->biMemberId;
        if ($request->has('nickname')) $data['nickname'] = $request->nickname;

        if ($isAdmin) {
            if ($request->has('membership')) $data['membership'] = $request->boolean('membership');
            if ($request->has('trainingEligible')) $data['training_eligible'] = $request->boolean('trainingEligible');
            if ($request->has('playEligible')) $data['play_eligible'] = $request->boolean('playEligible');
            if ($request->has('status')) {
                if (!in_array($request->status, ['active', 'disabled', 'pending', 'rejected'], true)) {
                    return response()->json(['message' => 'Invalid status.'], 422);
                }
                $data['status'] = $request->status;
            }
            if ($request->has('credit')) $data['credit'] = $request->credit;
            if ($request->has('skipCreditConsumption')) $data['skip_credit_consumption'] = $request->boolean('skipCreditConsumption');
            if ($request->has('applyDiscount')) $data['apply_discount'] = $request->boolean('applyDiscount');
            if ($request->has('parentMemberId')) {
                $parentId = $request->input('parentMemberId') ?: null;
                if ($parentId) {
                    $parent = Member::find($parentId);
                    if (!$parent || $parent->member_type !== 'adult') {
                        return response()->json(['message' => 'Parent must be an adult member.'], 422);
                    }
                    if ($parent->id === $member->id) {
                        return response()->json(['message' => 'A member cannot be their own parent.'], 422);
                    }
                    $data['parent_member_id'] = $parent->id;
                    if ($parent->user_id) {
                        $data['user_id'] = $parent->user_id;
                    }
                } else {
                    $data['parent_member_id'] = null;
                }
            }
        }

        $member->update($data);

        if ($isAdmin && $member->user_id) {
            $account = User::find($member->user_id);
            if ($account) {
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
                    $account->update($userUpdates);
                }
            }
        }

        return response()->json($this->formatMember($member->fresh()));
    }

    /**
     * Admin: approve a pending junior (activate + optional membership/training/grade).
     */
    public function approve(Request $request, $id)
    {
        if ($request->user()?->role !== 'admin') {
            return response()->json(['message' => 'Only admins can approve juniors.'], 403);
        }

        $member = Member::findOrFail($id);
        if ($member->member_type !== 'junior' || $member->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending juniors can be approved.',
            ], 422);
        }

        $request->validate([
            'membership' => 'sometimes|boolean',
            'trainingEligible' => 'sometimes|boolean',
            'playEligible' => 'sometimes|boolean',
            'grade' => [
                'sometimes',
                'string',
                \Illuminate\Validation\Rule::exists('grades', 'name')->where('type', 'junior'),
            ],
        ]);

        $member->status = 'active';
        if ($request->has('membership')) {
            $member->membership = $request->boolean('membership');
        }
        if ($request->has('trainingEligible')) {
            $member->training_eligible = $request->boolean('trainingEligible');
        }
        if ($request->has('playEligible')) {
            $member->play_eligible = $request->boolean('playEligible');
        }
        if ($request->filled('grade')) {
            $member->grade = $request->grade;
        }
        $member->save();

        return response()->json([
            'message' => 'Junior approved successfully.',
            'member' => $this->formatMember($member),
        ]);
    }

    /**
     * Admin: reject a pending junior.
     */
    public function reject(Request $request, $id)
    {
        if ($request->user()?->role !== 'admin') {
            return response()->json(['message' => 'Only admins can reject juniors.'], 403);
        }

        $member = Member::findOrFail($id);
        if ($member->member_type !== 'junior' || $member->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending juniors can be rejected.',
            ], 422);
        }

        $member->status = 'rejected';
        $member->membership = false;
        $member->training_eligible = false;
        $member->play_eligible = false;
        $member->save();

        return response()->json([
            'message' => 'Junior rejected.',
            'member' => $this->formatMember($member),
        ]);
    }

    public function destroy($id)
    {
        $member = Member::findOrFail($id);
        $user = auth()->user();

        // Only admins may delete junior members
        if (strtolower((string) $member->member_type) === 'junior' && (!$user || $user->role !== 'admin')) {
            return response()->json(['message' => 'Only admins can delete junior members.'], 403);
        }

        if ($user->role !== 'admin' && $member->user_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $member->delete();

        return response()->json(['message' => 'Member deleted successfully.']);
    }

    public function bulkDelete(Request $request)
    {
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized.'], 403);
        }

        $data = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'required|string',
        ]);

        $ids = array_values(array_unique($data['ids']));
        $deleted = 0;

        DB::transaction(function () use ($ids, &$deleted) {
            $members = Member::whereIn('id', $ids)->get();
            foreach ($members as $member) {
                $member->delete();
                $deleted++;
            }
        });

        return response()->json([
            'message' => "Successfully deleted {$deleted} member(s).",
            'deletedCount' => $deleted,
        ]);
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

    private function formatMember(Member|\stdClass $m)
    {
        return [
            'id' => $m->id,
            'userId' => $m->user_id,
            'parentMemberId' => $m->parent_member_id,
            'firstName' => $m->first_name,
            'lastName' => $m->last_name,
            'dob' => $m->dob,
            'email' => $m->email,
            'sex' => $m->sex,
            'memberType' => $m->member_type,
            'membership' => (bool)$m->membership,
            'trainingEligible' => (bool)$m->training_eligible,
            'playEligible' => (bool)$m->play_eligible,
            'grade' => $m->grade,
            'biMemberId' => $m->bi_member_id ?? "",
            'nickname' => $m->nickname ?? "",
            'status' => $m->status,
            'credit' => (float)$m->credit,
            'skipCreditConsumption' => (bool)($m->skip_credit_consumption ?? false),
            'applyDiscount' => (bool)($m->apply_discount ?? false),
        ];
    }

    private function resolveTrainingEligible(Request $request): bool
    {
        if ($request->has('trainingEligible')) {
            return $request->boolean('trainingEligible');
        }

        return $request->memberType === 'junior';
    }

    private function resolvePlayEligible(Request $request): bool
    {
        if ($request->has('playEligible')) {
            return $request->boolean('playEligible');
        }

        return false;
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
        $allowExamples = filter_var($request->input('allow_examples', false), FILTER_VALIDATE_BOOLEAN);

        DB::transaction(function () use ($rows, &$createdCount, $allowExamples) {
            foreach ($rows as $row) {
                $firstName = trim((string) ($row['first_name'] ?? $row['firstname'] ?? ''));
                $lastName = trim((string) ($row['last_name'] ?? $row['lastname'] ?? ''));
                $email = trim((string) ($row['email'] ?? ''));

                // Skip blank rows and the template reference footer
                if ($firstName === '' || $email === '') {
                    continue;
                }
                if (preg_match('/^(REFERENCE_DO_NOT_IMPORT|AVAILABLE_|NOTES)/i', $firstName)) {
                    continue;
                }
                // Skip unchanged template example placeholders unless explicitly importing examples
                if (!$allowExamples && str_ends_with(strtolower($email), '@example.com')) {
                    continue;
                }

                $memberType = strtolower(trim((string) ($row['member_type'] ?? $row['membertype'] ?? 'adult')));
                $parentBi = trim((string) ($row['parent_bi_member_id'] ?? $row['parent_bi'] ?? ''));
                $parentEmail = trim((string) ($row['parent_email'] ?? ''));
                $parent = null;
                if ($memberType === 'junior') {
                    if ($parentBi !== '') {
                        $parent = Member::where('bi_member_id', $parentBi)
                            ->where('member_type', 'adult')
                            ->first();
                    }
                    if (!$parent && $parentEmail !== '') {
                        $parent = Member::where('email', $parentEmail)
                            ->where('member_type', 'adult')
                            ->first();
                    }
                }

                $user = null;
                if ($parent && $parent->user_id) {
                    $user = User::find($parent->user_id);
                }
                if (!$user) {
                    $user = User::where('email', $email)->first();
                }
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
                        'parent_member_id' => $parent?->id,
                        'first_name' => $firstName,
                        'last_name' => $lastName,
                        'dob' => $row['dob'] ?? '1990-01-01',
                        'email' => $email,
                        'sex' => $row['sex'] ?? 'male',
                        'member_type' => $memberType ?: 'adult',
                        'membership' => filter_var($row['membership'] ?? true, FILTER_VALIDATE_BOOLEAN),
                        'training_eligible' => filter_var($row['training_eligible'] ?? $row['trainingeligible'] ?? false, FILTER_VALIDATE_BOOLEAN),
                        'play_eligible' => filter_var($row['play_eligible'] ?? $row['playeligible'] ?? false, FILTER_VALIDATE_BOOLEAN),
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
