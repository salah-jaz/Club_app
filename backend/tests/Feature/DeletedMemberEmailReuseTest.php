<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Member;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class DeletedMemberEmailReuseTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);

        $this->admin = User::create([
            'id' => 'u_admin_email_reuse_' . Str::random(5),
            'first_name' => 'Admin',
            'last_name' => 'Reuse',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'admin_email_reuse_' . Str::random(5) . '@test.com',
            'mobile' => '0000000000',
            'address' => 'Admin Address',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'is_super_admin' => true,
            'status' => 'active',
        ]);
    }

    private function makeAdultMember(string $email): array
    {
        $user = User::create([
            'id' => 'u_reuse_' . Str::random(6),
            'first_name' => 'Reuse',
            'last_name' => 'Member',
            'sex' => 'female',
            'dob' => '1995-05-05',
            'email' => $email,
            'mobile' => '1111111111',
            'address' => 'Member Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $member = Member::create([
            'id' => 'm_reuse_' . Str::random(6),
            'user_id' => $user->id,
            'first_name' => 'Reuse',
            'last_name' => 'Member',
            'dob' => '1995-05-05',
            'email' => $email,
            'sex' => 'female',
            'member_type' => 'adult',
            'membership' => true,
            'training_eligible' => true,
            'play_eligible' => true,
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 0,
        ]);

        return [$user, $member];
    }

    public function test_active_member_email_still_blocks_registration(): void
    {
        $email = 'active_blocks_' . Str::random(6) . '@test.com';
        $this->makeAdultMember($email);

        $this->postJson('/api/register', [
            'firstName' => 'New',
            'lastName' => 'Person',
            'sex' => 'male',
            'dob' => '1992-02-02',
            'email' => $email,
            'mobile' => '2222222222',
            'address' => 'Somewhere',
            'password' => 'password123',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_deleting_member_frees_email_for_registration(): void
    {
        $email = 'freed_after_delete_' . Str::random(6) . '@test.com';
        [$user, $member] = $this->makeAdultMember($email);

        $this->actingAs($this->admin)
            ->deleteJson("/api/members/{$member->id}")
            ->assertOk();

        $this->assertDatabaseMissing('members', ['id' => $member->id]);
        $this->assertDatabaseMissing('users', ['id' => $user->id]);

        $this->postJson('/api/register', [
            'firstName' => 'New',
            'lastName' => 'Person',
            'sex' => 'male',
            'dob' => '1992-02-02',
            'email' => $email,
            'mobile' => '2222222222',
            'address' => 'Somewhere',
            'password' => 'password123',
        ])->assertCreated();

        $this->assertDatabaseHas('users', [
            'email' => $email,
            'status' => 'created',
        ]);
    }

    public function test_orphaned_login_from_prior_deletes_is_reclaimed_on_register(): void
    {
        $email = 'orphan_reclaim_' . Str::random(6) . '@test.com';

        // Simulate the pre-fix bug: member gone, login row still holds the email
        User::create([
            'id' => 'u_orphan_' . Str::random(6),
            'first_name' => 'Orphan',
            'last_name' => 'Login',
            'sex' => 'male',
            'dob' => '1991-01-01',
            'email' => $email,
            'mobile' => '3333333333',
            'address' => 'Old Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->postJson('/api/register', [
            'firstName' => 'Fresh',
            'lastName' => 'Signup',
            'sex' => 'female',
            'dob' => '1993-03-03',
            'email' => $email,
            'mobile' => '4444444444',
            'address' => 'New Address',
            'password' => 'password123',
        ])->assertCreated();

        $this->assertEquals(1, User::where('email', $email)->count());
        $this->assertDatabaseHas('users', [
            'email' => $email,
            'status' => 'created',
            'first_name' => 'Fresh',
        ]);
    }

    public function test_deleting_one_family_member_keeps_shared_login_email_blocked(): void
    {
        $email = 'family_shared_' . Str::random(6) . '@test.com';
        [$user, $adult] = $this->makeAdultMember($email);

        Grade::firstOrCreate(['name' => 'Beginner'], ['type' => 'junior']);

        $junior = Member::create([
            'id' => 'm_junior_' . Str::random(6),
            'user_id' => $user->id,
            'parent_member_id' => $adult->id,
            'first_name' => 'Kid',
            'last_name' => 'Member',
            'dob' => '2015-01-01',
            'email' => $email,
            'sex' => 'male',
            'member_type' => 'junior',
            'membership' => false,
            'training_eligible' => true,
            'grade' => 'Beginner',
            'status' => 'active',
            'credit' => 0,
        ]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/members/{$junior->id}")
            ->assertOk();

        $this->assertDatabaseHas('users', ['id' => $user->id, 'email' => $email]);
        $this->assertDatabaseHas('members', ['id' => $adult->id]);

        $this->postJson('/api/register', [
            'firstName' => 'New',
            'lastName' => 'Person',
            'sex' => 'male',
            'dob' => '1992-02-02',
            'email' => $email,
            'mobile' => '5555555555',
            'address' => 'Somewhere',
            'password' => 'password123',
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }
}
