<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Member;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Tests\TestCase;

class JuniorDuplicateRegistrationTest extends TestCase
{
    use DatabaseTransactions;

    protected User $parentUser1;
    protected Member $parentMember1;
    protected User $parentUser2;
    protected Member $parentMember2;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Beginner'], ['type' => 'junior']);
        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);

        // Parent Member 1
        $this->parentUser1 = User::create([
            'id' => 'u_parent1_' . Str::random(5),
            'first_name' => 'ParentOne',
            'last_name' => 'User',
            'sex' => 'male',
            'dob' => '1980-01-01',
            'email' => 'parent1_' . Str::random(5) . '@test.com',
            'mobile' => '+1111111111',
            'address' => '123 Street',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->parentMember1 = Member::create([
            'id' => 'm_parent1_' . Str::random(5),
            'user_id' => $this->parentUser1->id,
            'first_name' => 'ParentOne',
            'last_name' => 'User',
            'dob' => '1980-01-01',
            'email' => $this->parentUser1->email,
            'sex' => 'male',
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.00,
        ]);

        // Parent Member 2
        $this->parentUser2 = User::create([
            'id' => 'u_parent2_' . Str::random(5),
            'first_name' => 'ParentTwo',
            'last_name' => 'User',
            'sex' => 'female',
            'dob' => '1982-02-02',
            'email' => 'parent2_' . Str::random(5) . '@test.com',
            'mobile' => '+2222222222',
            'address' => '456 Street',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->parentMember2 = Member::create([
            'id' => 'm_parent2_' . Str::random(5),
            'user_id' => $this->parentUser2->id,
            'first_name' => 'ParentTwo',
            'last_name' => 'User',
            'dob' => '1982-02-02',
            'email' => $this->parentUser2->email,
            'sex' => 'female',
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.00,
        ]);
    }

    public function test_blocks_exact_duplicate_junior_registration_across_different_members()
    {
        // 1. Parent 1 registers Junior John David born 15-06-2018
        $response1 = $this->actingAs($this->parentUser1)->postJson('/api/members', [
            'firstName' => 'John',
            'lastName' => 'David',
            'dob' => '2018-06-15',
            'email' => 'john.david@test.com',
            'sex' => 'male',
            'memberType' => 'junior',
            'grade' => 'Beginner',
        ]);

        $response1->assertStatus(201);

        // 2. Parent 2 tries to register exact same Junior John David born 15-06-2018
        $response2 = $this->actingAs($this->parentUser2)->postJson('/api/members', [
            'firstName' => 'John',
            'lastName' => 'David',
            'dob' => '2018-06-15',
            'email' => 'john.david.parent2@test.com',
            'sex' => 'male',
            'memberType' => 'junior',
            'grade' => 'Beginner',
        ]);

        $response2->assertStatus(422)
            ->assertJson([
                'message' => 'This junior is already registered under another member. Duplicate registration is not allowed.',
            ]);
    }

    public function test_allows_registration_when_only_some_fields_match()
    {
        // Register initial Junior John David born 2018-06-15 under Parent 1
        $this->actingAs($this->parentUser1)->postJson('/api/members', [
            'firstName' => 'John',
            'lastName' => 'David',
            'dob' => '2018-06-15',
            'email' => 'john.david@test.com',
            'sex' => 'male',
            'memberType' => 'junior',
            'grade' => 'Beginner',
        ])->assertStatus(201);

        // 1. Same First Name & Last Name, DIFFERENT DOB -> Should succeed
        $diffDobResponse = $this->actingAs($this->parentUser2)->postJson('/api/members', [
            'firstName' => 'John',
            'lastName' => 'David',
            'dob' => '2019-01-01',
            'email' => 'john.david.2019@test.com',
            'sex' => 'male',
            'memberType' => 'junior',
            'grade' => 'Beginner',
        ]);
        $diffDobResponse->assertStatus(201);

        // 2. Same First Name & DOB, DIFFERENT Last Name -> Should succeed
        $diffLastNameResponse = $this->actingAs($this->parentUser2)->postJson('/api/members', [
            'firstName' => 'John',
            'lastName' => 'Smith',
            'dob' => '2018-06-15',
            'email' => 'john.smith@test.com',
            'sex' => 'male',
            'memberType' => 'junior',
            'grade' => 'Beginner',
        ]);
        $diffLastNameResponse->assertStatus(201);

        // 3. Same Last Name & DOB, DIFFERENT First Name -> Should succeed
        $diffFirstNameResponse = $this->actingAs($this->parentUser2)->postJson('/api/members', [
            'firstName' => 'Robert',
            'lastName' => 'David',
            'dob' => '2018-06-15',
            'email' => 'robert.david@test.com',
            'sex' => 'male',
            'memberType' => 'junior',
            'grade' => 'Beginner',
        ]);
        $diffFirstNameResponse->assertStatus(201);
    }
}
