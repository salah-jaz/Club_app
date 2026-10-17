<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Member;
use App\Models\PlayerPosition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LeagueGroupWalletBalanceTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $parentUser;
    protected Member $adultMember;
    protected Member $juniorMember;
    protected Member $unlinkedJunior;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Grade::firstOrCreate(['name' => 'Junior A'], ['type' => 'junior']);
        PlayerPosition::firstOrCreate(['name' => 'Captain']);
        PlayerPosition::firstOrCreate(['name' => 'Singles 1']);

        $this->admin = User::create([
            'id' => 'u_admin_lg_test',
            'first_name' => 'Admin',
            'last_name' => 'User',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'admin_lg@test.com',
            'mobile' => '+1234567890',
            'address' => '123 Admin Way',
            'password' => bcrypt('password123'),
            'role' => 'admin',
            'status' => 'active',
        ]);

        $this->parentUser = User::create([
            'id' => 'u_parent_lg_test',
            'first_name' => 'Harish',
            'last_name' => 'Dhaninna',
            'sex' => 'male',
            'dob' => '1985-05-15',
            'email' => 'harish_lg@test.com',
            'mobile' => '+1987654321',
            'address' => '456 Parent St',
            'password' => bcrypt('password123'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->adultMember = Member::create([
            'id' => 'm_harish_lg_test',
            'user_id' => $this->parentUser->id,
            'first_name' => 'Harish',
            'last_name' => 'Dhaninna',
            'dob' => '1985-05-15',
            'email' => 'harish_lg@test.com',
            'sex' => 'male',
            'member_type' => 'adult',
            'membership' => true,
            'training_eligible' => true,
            'play_eligible' => true,
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 280.00,
        ]);

        $this->juniorMember = Member::create([
            'id' => 'm_junior_lg_test',
            'user_id' => $this->parentUser->id,
            'parent_member_id' => $this->adultMember->id,
            'first_name' => 'Aarav',
            'last_name' => 'Dhaninna',
            'dob' => '2012-08-20',
            'email' => 'harish_lg@test.com',
            'sex' => 'male',
            'member_type' => 'junior',
            'membership' => true,
            'training_eligible' => true,
            'play_eligible' => false,
            'grade' => 'Junior A',
            'status' => 'active',
            'credit' => 0.00,
        ]);

        $this->unlinkedJunior = Member::create([
            'id' => 'm_unlinked_lg_test',
            'user_id' => null,
            'parent_member_id' => null,
            'first_name' => 'Solo',
            'last_name' => 'Junior',
            'dob' => '2013-01-10',
            'email' => 'solo_junior@test.com',
            'sex' => 'female',
            'member_type' => 'junior',
            'membership' => true,
            'training_eligible' => true,
            'play_eligible' => false,
            'grade' => 'Junior A',
            'status' => 'active',
            'credit' => 15.00,
        ]);
    }

    public function test_adult_group_displays_actual_wallet_balance()
    {
        $group = LeagueGroup::create([
            'id' => 'lg_adult_test',
            'name' => 'Adult Premier League',
            'description' => 'Adult test group',
            'group_type' => 'Adult',
        ]);
        $group->members()->attach($this->adultMember->id, ['position' => 'Captain']);

        $res = $this->actingAs($this->admin)->getJson('/api/league-groups');
        $res->assertStatus(200);

        $groups = $res->json();
        $this->assertCount(1, $groups);
        $this->assertEquals('lg_adult_test', $groups[0]['id']);
        $this->assertCount(1, $groups[0]['members']);
        $this->assertEquals($this->adultMember->id, $groups[0]['members'][0]['id']);
        $this->assertEquals(280.00, $groups[0]['members'][0]['walletBalance']);
    }

    public function test_junior_group_displays_linked_parent_shared_wallet_balance()
    {
        $group = LeagueGroup::create([
            'id' => 'lg_junior_test',
            'name' => 'Junior Super League',
            'description' => 'Junior test group',
            'group_type' => 'Junior',
        ]);
        $group->members()->attach($this->juniorMember->id, ['position' => 'Singles 1']);

        $res = $this->actingAs($this->admin)->getJson('/api/league-groups');
        $res->assertStatus(200);

        $groups = $res->json();
        $this->assertCount(1, $groups);
        $this->assertEquals('lg_junior_test', $groups[0]['id']);
        $this->assertCount(1, $groups[0]['members']);
        $this->assertEquals($this->juniorMember->id, $groups[0]['members'][0]['id']);
        // Junior's wallet balance must reflect Harish's (parent) 280.00 credit
        $this->assertEquals(280.00, $groups[0]['members'][0]['walletBalance']);
    }

    public function test_wallet_balance_updates_after_debit_credit_refund()
    {
        $group = LeagueGroup::create([
            'id' => 'lg_balance_update_test',
            'name' => 'Update Test League',
            'description' => 'Testing balance updates',
            'group_type' => 'Adult',
        ]);
        $group->members()->attach($this->adultMember->id, ['position' => 'Captain']);

        // Initial balance: 280.00
        $res1 = $this->actingAs($this->admin)->getJson('/api/league-groups');
        $this->assertEquals(280.00, $res1->json()[0]['members'][0]['walletBalance']);

        // After spending 50.00 -> balance: 230.00
        $this->adultMember->update(['credit' => 230.00]);

        $res2 = $this->actingAs($this->admin)->getJson('/api/league-groups');
        $this->assertEquals(230.00, $res2->json()[0]['members'][0]['walletBalance']);

        // After refund/credit of 70.00 -> balance: 300.00
        $this->adultMember->update(['credit' => 300.00]);

        $res3 = $this->actingAs($this->admin)->getJson('/api/league-groups');
        $this->assertEquals(300.00, $res3->json()[0]['members'][0]['walletBalance']);
    }

    public function test_unlinked_junior_falls_back_to_own_balance()
    {
        $group = LeagueGroup::create([
            'id' => 'lg_unlinked_junior_test',
            'name' => 'Unlinked Junior League',
            'description' => 'Unlinked junior group',
            'group_type' => 'Junior',
        ]);
        $group->members()->attach($this->unlinkedJunior->id);

        $res = $this->actingAs($this->admin)->getJson('/api/league-groups');
        $res->assertStatus(200);

        $groups = $res->json();
        $this->assertEquals(15.00, $groups[0]['members'][0]['walletBalance']);
    }
}
