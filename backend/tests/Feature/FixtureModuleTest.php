<?php

namespace Tests\Feature;

use App\Models\Fixture;
use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Member;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class FixtureModuleTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $memberUserWithGroup;
    protected User $memberUserNoGroup;
    protected Member $memberWithGroup;
    protected Member $memberNoGroup;
    protected LeagueGroup $group1;
    protected LeagueGroup $group2;

    protected function setUp(): void
    {
        parent::setUp();

        Setting::updateOrCreate(
            ['key' => 'match_types'],
            ['value' => json_encode(['Friendly', 'League Cup', 'Championship'])]
        );
        Setting::updateOrCreate(
            ['key' => 'venue_types'],
            ['value' => json_encode(['Home', 'Away', 'Neutral'])]
        );

        Grade::firstOrCreate(['name' => 'Division 1'], ['type' => 'adult']);
        Grade::firstOrCreate(['name' => 'Division 2'], ['type' => 'adult']);

        \App\Models\PlayerPosition::firstOrCreate(['name' => 'Captain']);
        \App\Models\PlayerPosition::firstOrCreate(['name' => 'Player']);

        // Create Admin
        $this->admin = User::create([
            'id' => 'u_admin_' . Str::random(8),
            'first_name' => 'Admin',
            'last_name' => 'User',
            'sex' => 'male',
            'dob' => '1985-01-01',
            'email' => 'admin_' . Str::random(8) . '@test.com',
            'mobile' => '+1000000000',
            'address' => 'Admin Addr',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'status' => 'active',
            'is_super_admin' => true,
        ]);

        // Create Member User with Group
        $this->memberUserWithGroup = User::create([
            'id' => 'u_mem1_' . Str::random(8),
            'first_name' => 'Member',
            'last_name' => 'One',
            'sex' => 'female',
            'dob' => '1992-01-01',
            'email' => 'member1_' . Str::random(8) . '@test.com',
            'mobile' => '+1000000001',
            'address' => 'Mem Addr 1',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->memberWithGroup = Member::create([
            'id' => 'm_' . Str::random(8),
            'user_id' => $this->memberUserWithGroup->id,
            'first_name' => 'Member',
            'last_name' => 'One',
            'email' => $this->memberUserWithGroup->email,
            'sex' => 'female',
            'dob' => '1992-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 50.0,
            'grade' => 'Division 1',
        ]);

        // Create Member User with No Group
        $this->memberUserNoGroup = User::create([
            'id' => 'u_mem2_' . Str::random(8),
            'first_name' => 'Member',
            'last_name' => 'Two',
            'sex' => 'male',
            'dob' => '1995-01-01',
            'email' => 'member2_' . Str::random(8) . '@test.com',
            'mobile' => '+1000000002',
            'address' => 'Mem Addr 2',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->memberNoGroup = Member::create([
            'id' => 'm_' . Str::random(8),
            'user_id' => $this->memberUserNoGroup->id,
            'first_name' => 'Member',
            'last_name' => 'Two',
            'email' => $this->memberUserNoGroup->email,
            'sex' => 'male',
            'dob' => '1995-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 50.0,
            'grade' => 'Division 1',
        ]);

        // Groups
        $this->group1 = LeagueGroup::create([
            'id' => 'lg_grp1_' . Str::random(8),
            'name' => 'Lions Team',
            'description' => 'First League Group',
            'group_type' => 'Adult',
        ]);

        $this->group2 = LeagueGroup::create([
            'id' => 'lg_grp2_' . Str::random(8),
            'name' => 'Tigers Team',
            'description' => 'Second League Group',
            'group_type' => 'Adult',
        ]);

        // Add memberWithGroup to group1
        $this->group1->members()->sync([
            $this->memberWithGroup->id => ['position' => 'Player'],
        ]);
    }

    public function test_settings_returns_match_types_and_venue_types(): void
    {
        $response = $this->actingAs($this->admin)->getJson('/api/settings');
        $response->assertOk();
        $this->assertIsArray($response->json('matchTypes'));
        $this->assertIsArray($response->json('venueTypes'));
        $this->assertContains('Friendly', $response->json('matchTypes'));
        $this->assertContains('Home', $response->json('venueTypes'));
    }

    public function test_settings_can_update_match_types_and_venue_types(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/settings', [
            'matchTypes' => ['Friendly', 'Tournament', 'Playoff'],
            'venueTypes' => ['Home', 'Away', 'Neutral Arena'],
        ]);
        $response->assertOk();
        $this->assertContains('Tournament', $response->json('matchTypes'));
        $this->assertContains('Neutral Arena', $response->json('venueTypes'));
    }

    public function test_admin_can_crud_fixtures(): void
    {
        // 1. Create
        $createRes = $this->actingAs($this->admin)->postJson('/api/fixtures', [
            'name' => 'Championship Match 1',
            'date' => '2026-08-15 14:00:00',
            'leagueGroupId' => $this->group1->id,
            'matchType' => 'Friendly',
            'venueType' => 'Home',
            'oppositionClub' => 'Hawks FC',
            'teamName' => 'Lions Alpha',
            'grade' => 'Division 1',
            'status' => 'Opened',
        ]);
        $createRes->assertStatus(201);
        $fixtureId = $createRes->json('id');
        $this->assertNotNull($fixtureId);
        $this->assertEquals('Championship Match 1', $createRes->json('name'));

        // 2. Read (All)
        $listRes = $this->actingAs($this->admin)->getJson('/api/fixtures');
        $listRes->assertOk();
        $ids = collect($listRes->json())->pluck('id')->all();
        $this->assertContains($fixtureId, $ids);

        // 3. Read (Single)
        $showRes = $this->actingAs($this->admin)->getJson('/api/fixtures/' . $fixtureId);
        $showRes->assertOk();
        $this->assertEquals('Championship Match 1', $showRes->json('name'));
        $this->assertEquals('Lions Team', $showRes->json('leagueGroupName'));

        // 4. Update
        $updateRes = $this->actingAs($this->admin)->putJson('/api/fixtures/' . $fixtureId, [
            'name' => 'Championship Match 1 Updated',
            'date' => '2026-08-15 15:30:00',
            'leagueGroupId' => $this->group1->id,
            'matchType' => 'Friendly',
            'venueType' => 'Away',
            'oppositionClub' => 'Hawks FC',
            'teamName' => 'Lions Alpha',
            'grade' => 'Division 1',
            'status' => 'In Progress',
        ]);
        $updateRes->assertOk();
        $this->assertEquals('Championship Match 1 Updated', $updateRes->json('name'));
        $this->assertEquals('Away', $updateRes->json('venueType'));
        $this->assertEquals('In Progress', $updateRes->json('status'));

        // 5. Delete
        $deleteRes = $this->actingAs($this->admin)->deleteJson('/api/fixtures/' . $fixtureId);
        $deleteRes->assertOk();
        $this->assertDatabaseMissing('fixtures', ['id' => $fixtureId]);
    }

    public function test_member_without_groups_cannot_access_fixtures_api(): void
    {
        // Member with no groups gets 403 on GET /api/fixtures
        $this->actingAs($this->memberUserNoGroup)
            ->getJson('/api/fixtures')
            ->assertStatus(403);

        // Cannot create fixture
        $this->actingAs($this->memberUserNoGroup)
            ->postJson('/api/fixtures', [
                'name' => 'Unauthorized Match',
                'date' => '2026-08-20 10:00:00',
                'leagueGroupId' => $this->group1->id,
                'matchType' => 'Friendly',
                'venueType' => 'Home',
                'oppositionClub' => 'Wolves',
                'teamName' => 'Lions Alpha',
                'grade' => 'Division 1',
                'status' => 'Opened',
            ])
            ->assertStatus(403);
    }

    public function test_member_with_group_can_view_only_their_group_fixtures(): void
    {
        // Fixture in Group 1 (which member belongs to)
        $fixture1 = Fixture::create([
            'id' => 'fix_1_' . Str::random(8),
            'name' => 'Group 1 Fixture',
            'date' => '2026-08-20 10:00:00',
            'league_group_id' => $this->group1->id,
            'match_type' => 'Friendly',
            'venue_type' => 'Home',
            'opposition_club' => 'Opp Club 1',
            'team_name' => 'Team 1',
            'grade' => 'Division 1',
            'status' => 'Opened',
        ]);

        // Fixture in Group 2 (which member does NOT belong to)
        $fixture2 = Fixture::create([
            'id' => 'fix_2_' . Str::random(8),
            'name' => 'Group 2 Fixture',
            'date' => '2026-08-22 10:00:00',
            'league_group_id' => $this->group2->id,
            'match_type' => 'Friendly',
            'venue_type' => 'Away',
            'opposition_club' => 'Opp Club 2',
            'team_name' => 'Team 2',
            'grade' => 'Division 1',
            'status' => 'Opened',
        ]);

        // Member queries fixtures list
        $res = $this->actingAs($this->memberUserWithGroup)->getJson('/api/fixtures');
        $res->assertOk();
        $ids = collect($res->json())->pluck('id')->all();

        $this->assertContains($fixture1->id, $ids);
        $this->assertNotContains($fixture2->id, $ids);

        // Can view single fixture for group 1
        $this->actingAs($this->memberUserWithGroup)
            ->getJson('/api/fixtures/' . $fixture1->id)
            ->assertOk();

        // Forbidden when attempting to view single fixture for group 2
        $this->actingAs($this->memberUserWithGroup)
            ->getJson('/api/fixtures/' . $fixture2->id)
            ->assertStatus(403);
    }

    public function test_member_can_create_and_edit_for_their_groups_but_cannot_delete(): void
    {
        // 1. Member creates fixture for group 1 (permitted)
        $createRes = $this->actingAs($this->memberUserWithGroup)->postJson('/api/fixtures', [
            'name' => 'Member Created Fixture',
            'date' => '2026-09-01 12:00:00',
            'leagueGroupId' => $this->group1->id,
            'matchType' => 'Friendly',
            'venueType' => 'Home',
            'oppositionClub' => 'Opp Team',
            'teamName' => 'Our Team',
            'grade' => 'Division 1',
            'status' => 'Opened',
        ]);
        $createRes->assertStatus(201);
        $fixtureId = $createRes->json('id');

        // 2. Member tries to create fixture for group 2 (forbidden)
        $this->actingAs($this->memberUserWithGroup)->postJson('/api/fixtures', [
            'name' => 'Member Forbidden Group Fixture',
            'date' => '2026-09-01 12:00:00',
            'leagueGroupId' => $this->group2->id,
            'matchType' => 'Friendly',
            'venueType' => 'Home',
            'oppositionClub' => 'Opp Team',
            'teamName' => 'Our Team',
            'grade' => 'Division 1',
            'status' => 'Opened',
        ])->assertStatus(403);

        // 3. Member edits their fixture (permitted)
        $editRes = $this->actingAs($this->memberUserWithGroup)->putJson('/api/fixtures/' . $fixtureId, [
            'name' => 'Member Updated Name',
            'date' => '2026-09-01 13:00:00',
            'leagueGroupId' => $this->group1->id,
            'matchType' => 'Friendly',
            'venueType' => 'Home',
            'oppositionClub' => 'Opp Team',
            'teamName' => 'Our Team',
            'grade' => 'Division 1',
            'status' => 'In Progress',
        ]);
        $editRes->assertOk();
        $this->assertEquals('Member Updated Name', $editRes->json('name'));

        // 4. Member tries to delete fixture (STRICTLY FORBIDDEN: 403)
        $delRes = $this->actingAs($this->memberUserWithGroup)->deleteJson('/api/fixtures/' . $fixtureId);
        $delRes->assertStatus(403);
        $this->assertDatabaseHas('fixtures', ['id' => $fixtureId]);
    }

    public function test_adding_and_removing_group_membership_updates_access_automatically(): void
    {
        // Currently, memberNoGroup has 0 groups and is denied
        $this->actingAs($this->memberUserNoGroup)
            ->getJson('/api/fixtures')
            ->assertStatus(403);

        // Add memberNoGroup to group2
        $this->group2->members()->sync([
            $this->memberNoGroup->id => ['position' => 'Player'],
        ]);

        // Now member has access automatically
        $res = $this->actingAs($this->memberUserNoGroup)
            ->getJson('/api/fixtures');
        $res->assertOk();

        // Remove member from group2
        $this->group2->members()->detach($this->memberNoGroup->id);

        // Access is automatically revoked (403)
        $this->actingAs($this->memberUserNoGroup)
            ->getJson('/api/fixtures')
            ->assertStatus(403);
    }
}
