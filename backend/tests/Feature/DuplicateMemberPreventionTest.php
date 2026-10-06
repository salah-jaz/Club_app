<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Member;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class DuplicateMemberPreventionTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Grade::firstOrCreate(['name' => 'Beginner'], ['type' => 'junior']);

        $this->admin = User::create([
            'id' => 'u_admin_' . Str::random(5),
            'first_name' => 'Super',
            'last_name' => 'Admin',
            'sex' => 'male',
            'dob' => '1985-01-01',
            'email' => 'admin_' . Str::random(5) . '@test.com',
            'mobile' => '0000000000',
            'address' => 'Admin HQ',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'is_super_admin' => true,
            'status' => 'active',
        ]);
    }

    public function test_same_email_member_creation_twice_is_prevented(): void
    {
        $email = 'member_twice_' . Str::random(5) . '@test.com';

        // 1. First member creation succeeds
        $res1 = $this->actingAs($this->admin)->postJson('/api/members', [
            'firstName' => 'John',
            'lastName' => 'Doe',
            'dob' => '1990-01-01',
            'email' => $email,
            'mobile' => '1111111111',
            'address' => '123 Street',
            'password' => 'secret123',
            'sex' => 'male',
            'memberType' => 'adult',
            'membership' => true,
            'grade' => 'Grade A',
            'createLogin' => true,
            'status' => 'active',
        ]);
        $res1->assertCreated();

        // 2. Second member creation with same email is rejected with 422
        $res2 = $this->actingAs($this->admin)->postJson('/api/members', [
            'firstName' => 'John',
            'lastName' => 'Doe',
            'dob' => '1990-01-01',
            'email' => $email,
            'mobile' => '2222222222',
            'address' => '456 Avenue',
            'password' => 'secret123',
            'sex' => 'male',
            'memberType' => 'adult',
            'membership' => true,
            'grade' => 'Grade A',
            'createLogin' => true,
            'status' => 'active',
        ]);
        $res2->assertStatus(422);

        // Also test createLogin = false with same email
        $res3 = $this->actingAs($this->admin)->postJson('/api/members', [
            'firstName' => 'John',
            'lastName' => 'Clone',
            'dob' => '1990-01-01',
            'email' => $email,
            'sex' => 'male',
            'memberType' => 'adult',
            'membership' => true,
            'grade' => 'Grade A',
            'createLogin' => false,
            'userId' => $this->admin->id,
            'status' => 'active',
        ]);
        $res3->assertStatus(422);

        $this->assertEquals(1, Member::where('email', $email)->count());
    }

    public function test_double_approval_of_user_is_prevented_and_creates_only_one_member(): void
    {
        $email = 'double_approve_' . Str::random(5) . '@test.com';

        $registrant = User::create([
            'id' => 'u_reg_' . Str::random(5),
            'first_name' => 'Dbl',
            'last_name' => 'Approve',
            'sex' => 'male',
            'dob' => '1992-05-05',
            'email' => $email,
            'mobile' => '3333333333',
            'address' => 'Road 1',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'created',
        ]);

        // First approval succeeds
        $approve1 = $this->actingAs($this->admin)->postJson("/api/users/{$registrant->id}/approve", [
            'memberType' => 'adult',
            'grade' => 'Grade A',
        ]);
        $approve1->assertOk();
        $this->assertEquals(1, Member::where('user_id', $registrant->id)->count());

        // Second approval attempt fails with 422
        $approve2 = $this->actingAs($this->admin)->postJson("/api/users/{$registrant->id}/approve", [
            'memberType' => 'adult',
            'grade' => 'Grade A',
        ]);
        $approve2->assertStatus(422);
        $approve2->assertJsonFragment([
            'message' => 'User is already approved or not pending approval.',
        ]);

        // Still only 1 member record exists
        $this->assertEquals(1, Member::where('user_id', $registrant->id)->count());
        $this->assertEquals(1, Member::where('email', $email)->count());
    }

    public function test_concurrent_duplicate_creation_is_prevented_at_database_level(): void
    {
        $email = 'concurrent_' . Str::random(5) . '@test.com';

        // Create first active adult member directly
        Member::create([
            'id' => 'm_c1_' . Str::random(5),
            'user_id' => null,
            'first_name' => 'First',
            'last_name' => 'Instance',
            'dob' => '1990-01-01',
            'email' => $email,
            'sex' => 'male',
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 0.00,
        ]);

        // Attempting to bypass validation and insert a second active adult with same email triggers DB constraint
        $caughtException = false;
        try {
            Member::create([
                'id' => 'm_c2_' . Str::random(5),
                'user_id' => null,
                'first_name' => 'Second',
                'last_name' => 'Instance',
                'dob' => '1990-01-01',
                'email' => $email,
                'sex' => 'male',
                'member_type' => 'adult',
                'grade' => 'Grade A',
                'status' => 'active',
                'credit' => 0.00,
            ]);
        } catch (\Illuminate\Database\QueryException $e) {
            $caughtException = true;
        }

        $this->assertTrue($caughtException, 'Database-level constraint should block concurrent duplicate active adult emails.');
        $this->assertEquals(1, Member::where('email', $email)->count());
    }

    public function test_existing_active_member_with_same_email_blocks_approval(): void
    {
        $sharedEmail = 'already_active_' . Str::random(5) . '@test.com';

        // Existing active adult member
        Member::create([
            'id' => 'm_act_' . Str::random(5),
            'user_id' => null,
            'first_name' => 'Existing',
            'last_name' => 'Active',
            'dob' => '1990-01-01',
            'email' => $sharedEmail,
            'sex' => 'female',
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 0.00,
        ]);

        // A new user signs up with the same email (or an admin approves someone with that email)
        $newUser = User::create([
            'id' => 'u_new_' . Str::random(5),
            'first_name' => 'Late',
            'last_name' => 'Signer',
            'sex' => 'male',
            'dob' => '1995-02-02',
            'email' => $sharedEmail,
            'mobile' => '4444444444',
            'address' => 'Other St',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'created',
        ]);

        $res = $this->actingAs($this->admin)->postJson("/api/users/{$newUser->id}/approve");
        $res->assertStatus(422);
        $res->assertJsonFragment([
            'message' => 'An active member with this email already exists.',
        ]);

        $this->assertEquals(1, Member::where('email', $sharedEmail)->count());
    }

    public function test_deleted_member_email_reuse_is_preserved(): void
    {
        $email = 'reuse_allowed_' . Str::random(5) . '@test.com';

        // 1. Create user and active member
        $user = User::create([
            'id' => 'u_del_' . Str::random(5),
            'first_name' => 'Old',
            'last_name' => 'User',
            'sex' => 'female',
            'dob' => '1988-08-08',
            'email' => $email,
            'mobile' => '5555555555',
            'address' => 'Old Rd',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $member = Member::create([
            'id' => 'm_del_' . Str::random(5),
            'user_id' => $user->id,
            'first_name' => 'Old',
            'last_name' => 'User',
            'dob' => '1988-08-08',
            'email' => $email,
            'sex' => 'female',
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 0.00,
        ]);

        // 2. Delete member
        $this->actingAs($this->admin)->deleteJson("/api/members/{$member->id}")->assertOk();
        $this->assertDatabaseMissing('members', ['id' => $member->id]);
        $this->assertDatabaseMissing('users', ['id' => $user->id]);

        // 3. New member can now be created with the same email
        $res = $this->actingAs($this->admin)->postJson('/api/members', [
            'firstName' => 'New',
            'lastName' => 'Owner',
            'dob' => '1995-01-01',
            'email' => $email,
            'mobile' => '7777777777',
            'address' => 'New Road',
            'password' => 'newpassword123',
            'sex' => 'male',
            'memberType' => 'adult',
            'membership' => true,
            'grade' => 'Grade A',
            'createLogin' => true,
            'status' => 'active',
        ]);
        $res->assertCreated();

        $this->assertEquals(1, Member::where('email', $email)->count());
    }

    public function test_family_junior_creation_can_share_parent_email(): void
    {
        $parentEmail = 'family_parent_' . Str::random(5) . '@test.com';

        $parentUser = User::create([
            'id' => 'u_fp_' . Str::random(5),
            'first_name' => 'Parent',
            'last_name' => 'Adult',
            'sex' => 'female',
            'dob' => '1980-01-01',
            'email' => $parentEmail,
            'mobile' => '8888888888',
            'address' => 'Home',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $parentMember = Member::create([
            'id' => 'm_fp_' . Str::random(5),
            'user_id' => $parentUser->id,
            'first_name' => 'Parent',
            'last_name' => 'Adult',
            'dob' => '1980-01-01',
            'email' => $parentEmail,
            'sex' => 'female',
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 10.00,
        ]);

        // Parent adding a junior with parent's email succeeds
        $res = $this->actingAs($parentUser)->postJson('/api/members', [
            'firstName' => 'Junior',
            'lastName' => 'One',
            'dob' => '2016-01-01',
            'email' => $parentEmail,
            'sex' => 'male',
            'memberType' => 'junior',
            'grade' => 'Beginner',
        ]);
        $res->assertCreated();

        $junior = Member::where('first_name', 'Junior')->where('last_name', 'One')->first();
        $this->assertNotNull($junior);
        $this->assertEquals($parentEmail, $junior->email);
        $this->assertEquals($parentMember->id, $junior->parent_member_id);

        // Admin approving the junior succeeds without duplicate email conflict
        $approveJunior = $this->actingAs($this->admin)->postJson("/api/members/{$junior->id}/approve", [
            'grade' => 'Beginner',
        ]);
        $approveJunior->assertOk();
        $this->assertEquals('active', $junior->fresh()->status);
    }

    public function test_unrelated_junior_cannot_use_existing_active_member_email(): void
    {
        $unrelatedEmail = 'unrelated_' . Str::random(5) . '@test.com';

        // An active adult exists
        Member::create([
            'id' => 'm_unr_' . Str::random(5),
            'user_id' => null,
            'first_name' => 'Stranger',
            'last_name' => 'Person',
            'dob' => '1985-05-05',
            'email' => $unrelatedEmail,
            'sex' => 'male',
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 0.00,
        ]);

        // Another user logs in and tries to add a junior with that stranger's email
        $otherUser = User::create([
            'id' => 'u_oth_' . Str::random(5),
            'first_name' => 'Other',
            'last_name' => 'Parent',
            'sex' => 'female',
            'dob' => '1982-02-02',
            'email' => 'other_parent_' . Str::random(5) . '@test.com',
            'mobile' => '9999999999',
            'address' => 'Home 2',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $res = $this->actingAs($otherUser)->postJson('/api/members', [
            'firstName' => 'Kid',
            'lastName' => 'Other',
            'dob' => '2015-05-05',
            'email' => $unrelatedEmail,
            'sex' => 'female',
            'memberType' => 'junior',
            'grade' => 'Beginner',
        ]);
        $res->assertStatus(422);
        $res->assertJsonFragment([
            'message' => 'An active member with this email already exists.',
        ]);
    }
}
