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

    public function test_editing_existing_fixture_persists_all_fields_for_admin_and_member(): void
    {
        // 1. Admin creates fixture for group1
        $createRes = $this->actingAs($this->admin)->postJson('/api/fixtures', [
            'name' => 'Original Name',
            'date' => '2026-08-15 14:00:00',
            'leagueGroupId' => $this->group1->id,
            'matchType' => 'Friendly',
            'venueType' => 'Home',
            'oppositionClub' => 'Original Opp Club',
            'teamName' => 'Original Team',
            'grade' => 'Division 1',
            'status' => 'Opened',
        ]);
        $createRes->assertStatus(201);
        $fixtureId = $createRes->json('id');

        // 2. Admin edits EVERY field via PATCH (what frontend store uses)
        $patchRes = $this->actingAs($this->admin)->patchJson('/api/fixtures/' . $fixtureId, [
            'name' => 'Admin Updated Name',
            'date' => '2026-09-20 18:30:00',
            'leagueGroupId' => $this->group2->id,
            'matchType' => 'League Cup',
            'venueType' => 'Away',
            'oppositionClub' => 'Admin Updated Opp Club',
            'teamName' => 'Admin Updated Team',
            'grade' => 'Division 2',
            'status' => 'In Progress',
        ]);
        $patchRes->assertOk();

        // Check backend database persistence
        $fixture = Fixture::find($fixtureId);
        $this->assertEquals('Admin Updated Name', $fixture->name);
        $this->assertEquals('2026-09-20 18:30:00', $fixture->date);
        $this->assertEquals($this->group2->id, $fixture->league_group_id);
        $this->assertEquals('League Cup', $fixture->match_type);
        $this->assertEquals('Away', $fixture->venue_type);
        $this->assertEquals('Admin Updated Opp Club', $fixture->opposition_club);
        $this->assertEquals('Admin Updated Team', $fixture->team_name);
        $this->assertEquals('Division 2', $fixture->grade);
        $this->assertEquals('In Progress', $fixture->status);

        // 3. Now test member editing a fixture in their group
        // Add member to group2 as well
        $this->group2->members()->sync([
            $this->memberWithGroup->id => ['position' => 'Captain'],
        ]);

        $memberPatchRes = $this->actingAs($this->memberUserWithGroup)->patchJson('/api/fixtures/' . $fixtureId, [
            'name' => 'Member Final Name',
            'date' => '2026-10-05 19:45:00',
            'leagueGroupId' => $this->group1->id,
            'matchType' => 'Championship',
            'venueType' => 'Neutral',
            'oppositionClub' => 'Member Final Opp Club',
            'teamName' => 'Member Final Team',
            'grade' => 'Division 1',
            'status' => 'Closed',
        ]);
        $memberPatchRes->assertOk();

        $fixture = $fixture->fresh();
        $this->assertEquals('Member Final Name', $fixture->name);
        $this->assertEquals('2026-10-05 19:45:00', $fixture->date);
        $this->assertEquals($this->group1->id, $fixture->league_group_id);
        $this->assertEquals('Championship', $fixture->match_type);
        $this->assertEquals('Neutral', $fixture->venue_type);
        $this->assertEquals('Member Final Opp Club', $fixture->opposition_club);
        $this->assertEquals('Member Final Team', $fixture->team_name);
        $this->assertEquals('Division 1', $fixture->grade);
        $this->assertEquals('Closed', $fixture->status);

        // 4. Reopen fixture via GET /api/fixtures/{id} (both Admin and Member)
        $adminShow = $this->actingAs($this->admin)->getJson('/api/fixtures/' . $fixtureId);
        $adminShow->assertOk();
        $this->assertEquals('Member Final Name', $adminShow->json('name'));
        $this->assertEquals('2026-10-05T19:45:00', $adminShow->json('date'));
        $this->assertEquals($this->group1->id, $adminShow->json('leagueGroupId'));
        $this->assertEquals('Championship', $adminShow->json('matchType'));
        $this->assertEquals('Neutral', $adminShow->json('venueType'));
        $this->assertEquals('Member Final Opp Club', $adminShow->json('oppositionClub'));
        $this->assertEquals('Member Final Team', $adminShow->json('teamName'));
        $this->assertEquals('Division 1', $adminShow->json('grade'));
        $this->assertEquals('Closed', $adminShow->json('status'));

        $memberShow = $this->actingAs($this->memberUserWithGroup)->getJson('/api/fixtures/' . $fixtureId);
        $memberShow->assertOk();
        $this->assertEquals('Member Final Name', $memberShow->json('name'));

        // 5. Refresh data via GET /api/sync-data
        $syncRes = $this->actingAs($this->memberUserWithGroup)->getJson('/api/sync-data');
        $syncRes->assertOk();
        $syncedFixtures = collect($syncRes->json('fixtures'));
        $matching = $syncedFixtures->firstWhere('id', $fixtureId);
        $this->assertNotNull($matching);
        $this->assertEquals('Member Final Name', $matching['name']);
        $this->assertEquals('Closed', $matching['status']);
        $this->assertEquals('Championship', $matching['matchType']);
    }

    public function test_family_member_parent_can_edit_fixtures_for_junior_group(): void
    {
        // Create Junior Group
        $juniorGroup = LeagueGroup::create([
            'id' => 'lg_jr_' . Str::random(8),
            'name' => 'Junior Cubs',
            'description' => 'Junior Group',
            'group_type' => 'Junior',
        ]);

        // Create Junior Member linked to parent memberWithGroup (without direct user_id)
        $juniorMember = Member::create([
            'id' => 'm_jr_' . Str::random(8),
            'user_id' => null,
            'parent_member_id' => $this->memberWithGroup->id,
            'first_name' => 'Junior',
            'last_name' => 'One',
            'email' => $this->memberWithGroup->email,
            'sex' => 'female',
            'dob' => '2015-05-01',
            'member_type' => 'junior',
            'membership' => true,
            'status' => 'active',
            'credit' => 0.0,
            'grade' => 'Division 2',
        ]);

        $juniorGroup->members()->sync([
            $juniorMember->id => ['position' => 'Player'],
        ]);

        // Create fixture in junior group by Admin
        $createRes = $this->actingAs($this->admin)->postJson('/api/fixtures', [
            'name' => 'Junior Tournament 1',
            'date' => '2026-12-01 10:00:00',
            'leagueGroupId' => $juniorGroup->id,
            'matchType' => 'Tournament',
            'venueType' => 'Home',
            'oppositionClub' => 'Junior Tigers',
            'teamName' => 'Cubs Alpha',
            'grade' => 'Division 2',
            'status' => 'Opened',
        ]);
        $createRes->assertStatus(201);
        $fixtureId = $createRes->json('id');

        // Parent memberUserWithGroup edits the junior fixture
        $editRes = $this->actingAs($this->memberUserWithGroup)->patchJson('/api/fixtures/' . $fixtureId, [
            'name' => 'Junior Tournament 1 Updated by Parent',
            'date' => '2026-12-01 11:30:00',
            'leagueGroupId' => $juniorGroup->id,
            'matchType' => 'Friendly',
            'venueType' => 'Away',
            'oppositionClub' => 'Junior Tigers Updated',
            'teamName' => 'Cubs Alpha Updated',
            'grade' => 'Division 2',
            'status' => 'In Progress',
        ]);
        $editRes->assertOk();
        $this->assertEquals('Junior Tournament 1 Updated by Parent', $editRes->json('name'));
        $this->assertEquals('In Progress', $editRes->json('status'));

        $fixture = Fixture::find($fixtureId);
        $this->assertEquals('Junior Tournament 1 Updated by Parent', $fixture->name);
        $this->assertEquals('In Progress', $fixture->status);
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

    public function test_fixtures_visibility_across_groups_for_admin_and_members(): void
    {
        // Setup Group C and Member 3 (belongs only to Group C)
        $group3 = LeagueGroup::create([
            'id' => 'lg_grp3_' . Str::random(8),
            'name' => 'Eagles Team',
            'description' => 'Third League Group',
            'group_type' => 'Adult',
        ]);

        $memberUserGroup3 = User::create([
            'id' => 'u_mem3_' . Str::random(8),
            'first_name' => 'Member',
            'last_name' => 'Three',
            'sex' => 'male',
            'dob' => '1993-01-01',
            'email' => 'member3_' . Str::random(8) . '@test.com',
            'mobile' => '+1000000003',
            'address' => 'Mem Addr 3',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $member3 = Member::create([
            'id' => 'm_' . Str::random(8),
            'user_id' => $memberUserGroup3->id,
            'first_name' => 'Member',
            'last_name' => 'Three',
            'email' => $memberUserGroup3->email,
            'sex' => 'male',
            'dob' => '1993-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 50.0,
            'grade' => 'Division 1',
        ]);

        $group3->members()->sync([
            $member3->id => ['position' => 'Player'],
        ]);

        // Setup Member 2 in Group B (group2)
        $memberUserGroup2 = User::create([
            'id' => 'u_mem_b_' . Str::random(8),
            'first_name' => 'Member',
            'last_name' => 'Two',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'member_b_' . Str::random(8) . '@test.com',
            'mobile' => '+1000000004',
            'address' => 'Mem Addr B',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $member2 = Member::create([
            'id' => 'm_' . Str::random(8),
            'user_id' => $memberUserGroup2->id,
            'first_name' => 'Member',
            'last_name' => 'Two',
            'email' => $memberUserGroup2->email,
            'sex' => 'male',
            'dob' => '1990-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 50.0,
            'grade' => 'Division 1',
        ]);

        $this->group2->members()->sync([
            $member2->id => ['position' => 'Player'],
        ]);

        // 1. Admin creates a fixture for Group A (group1) -> all members with Fixtures access can see it
        $adminCreateRes = $this->actingAs($this->admin)->postJson('/api/fixtures', [
            'name' => 'Admin Fixture Group A',
            'date' => '2026-08-20 10:00:00',
            'leagueGroupId' => $this->group1->id,
            'matchType' => 'Friendly',
            'venueType' => 'Home',
            'oppositionClub' => 'Opp Club A',
            'teamName' => 'Team A',
            'grade' => 'Division 1',
            'status' => 'Opened',
        ]);
        $adminCreateRes->assertStatus(201);
        $fixtureAId = $adminCreateRes->json('id');

        // All members with Fixtures access (memberUserWithGroup, memberUserGroup2, memberUserGroup3) can see fixture A
        $resMem1 = $this->actingAs($this->memberUserWithGroup)->getJson('/api/fixtures');
        $resMem1->assertOk();
        $this->assertContains($fixtureAId, collect($resMem1->json())->pluck('id')->all());

        $resMem2 = $this->actingAs($memberUserGroup2)->getJson('/api/fixtures');
        $resMem2->assertOk();
        $this->assertContains($fixtureAId, collect($resMem2->json())->pluck('id')->all());

        $resMem3 = $this->actingAs($memberUserGroup3)->getJson('/api/fixtures');
        $resMem3->assertOk();
        $this->assertContains($fixtureAId, collect($resMem3->json())->pluck('id')->all());

        // Single view for fixture A is allowed for all members with fixtures access
        $this->actingAs($this->memberUserWithGroup)->getJson('/api/fixtures/' . $fixtureAId)->assertOk();
        $this->actingAs($memberUserGroup2)->getJson('/api/fixtures/' . $fixtureAId)->assertOk();
        $this->actingAs($memberUserGroup3)->getJson('/api/fixtures/' . $fixtureAId)->assertOk();
        $this->actingAs($this->admin)->getJson('/api/fixtures/' . $fixtureAId)->assertOk();

        // 2. A member (Member 2 in Group B) creates a fixture for Group B -> all members with access and Admin can see it
        $memberCreateRes = $this->actingAs($memberUserGroup2)->postJson('/api/fixtures', [
            'name' => 'Member Fixture Group B',
            'date' => '2026-08-22 14:00:00',
            'leagueGroupId' => $this->group2->id,
            'matchType' => 'League Cup',
            'venueType' => 'Away',
            'oppositionClub' => 'Opp Club B',
            'teamName' => 'Team B',
            'grade' => 'Division 1',
            'status' => 'Opened',
        ]);
        $memberCreateRes->assertStatus(201);
        $fixtureBId = $memberCreateRes->json('id');

        // Admin can see it
        $adminList = $this->actingAs($this->admin)->getJson('/api/fixtures');
        $adminList->assertOk();
        $this->assertContains($fixtureBId, collect($adminList->json())->pluck('id')->all());
        $this->actingAs($this->admin)->getJson('/api/fixtures/' . $fixtureBId)->assertOk();

        // 3. A member who belongs to Group C but not A or B (memberUserGroup3) can still see both fixtures
        $resMem3AfterBoth = $this->actingAs($memberUserGroup3)->getJson('/api/fixtures');
        $resMem3AfterBoth->assertOk();
        $idsForMem3 = collect($resMem3AfterBoth->json())->pluck('id')->all();
        $this->assertContains($fixtureAId, $idsForMem3);
        $this->assertContains($fixtureBId, $idsForMem3);

        $this->actingAs($memberUserGroup3)->getJson('/api/fixtures/' . $fixtureAId)->assertOk();
        $this->actingAs($memberUserGroup3)->getJson('/api/fixtures/' . $fixtureBId)->assertOk();

        // Member 1 (belongs to Group A, not B) can also see both fixtures
        $resMem1AfterBoth = $this->actingAs($this->memberUserWithGroup)->getJson('/api/fixtures');
        $resMem1AfterBoth->assertOk();
        $idsForMem1 = collect($resMem1AfterBoth->json())->pluck('id')->all();
        $this->assertContains($fixtureAId, $idsForMem1);
        $this->assertContains($fixtureBId, $idsForMem1);

        // 4. A member with no group membership cannot access Fixtures
        $this->actingAs($this->memberUserNoGroup)->getJson('/api/fixtures')->assertStatus(403);
        $this->actingAs($this->memberUserNoGroup)->getJson('/api/fixtures/' . $fixtureAId)->assertStatus(403);
        $this->actingAs($this->memberUserNoGroup)->getJson('/api/fixtures/' . $fixtureBId)->assertStatus(403);
        $this->actingAs($this->memberUserNoGroup)->postJson('/api/fixtures', [
            'name' => 'Forbidden Fixture',
            'date' => '2026-08-25 10:00:00',
            'leagueGroupId' => $this->group1->id,
            'matchType' => 'Friendly',
            'venueType' => 'Home',
            'oppositionClub' => 'Opp Club',
            'teamName' => 'Team',
            'grade' => 'Division 1',
            'status' => 'Opened',
        ])->assertStatus(403);

        // 5. Verify Members still cannot delete fixtures
        $delResMem1 = $this->actingAs($this->memberUserWithGroup)->deleteJson('/api/fixtures/' . $fixtureAId);
        $delResMem1->assertStatus(403);
        $this->assertDatabaseHas('fixtures', ['id' => $fixtureAId]);

        $delResMem2 = $this->actingAs($memberUserGroup2)->deleteJson('/api/fixtures/' . $fixtureBId);
        $delResMem2->assertStatus(403);
        $this->assertDatabaseHas('fixtures', ['id' => $fixtureBId]);

        $delResMem3 = $this->actingAs($memberUserGroup3)->deleteJson('/api/fixtures/' . $fixtureAId);
        $delResMem3->assertStatus(403);
        $this->assertDatabaseHas('fixtures', ['id' => $fixtureAId]);
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

    public function test_match_result_is_optional_on_creation_and_can_be_updated_by_admin(): void
    {
        // 1. Create fixture without match result (match result is optional)
        $createRes = $this->actingAs($this->admin)->postJson('/api/fixtures', [
            'name' => 'Championship Quarterfinal',
            'date' => '2026-09-10 14:00:00',
            'leagueGroupId' => $this->group1->id,
            'matchType' => 'Championship',
            'venueType' => 'Home',
            'oppositionClub' => 'Bristol Smashers',
            'teamName' => 'Lions United',
            'grade' => 'Division 1',
            'status' => 'Opened',
        ]);
        $createRes->assertStatus(201);
        $fixtureId = $createRes->json('id');
        $this->assertNull($createRes->json('result'));
        $this->assertNull($createRes->json('homeTotalMatches'));
        $this->assertEquals('Lions United', $createRes->json('homeTeamName'));
        $this->assertEquals('Bristol Smashers', $createRes->json('visitingTeamName'));

        // 2. Admin edits fixture to record Match Result = Win, with table statistics
        $patchRes = $this->actingAs($this->admin)->patchJson('/api/fixtures/' . $fixtureId, [
            'result' => 'Win',
            'homeTeamName' => 'Lions United',
            'homeTotalMatches' => 5,
            'homeTotalGames' => 10,
            'homeTotalPoints' => 210,
            'visitingTeamName' => 'Bristol Smashers',
            'visitingTotalMatches' => 1,
            'visitingTotalGames' => 3,
            'visitingTotalPoints' => 145,
            'status' => 'Closed',
        ]);
        $patchRes->assertOk();
        $this->assertEquals('Win', $patchRes->json('result'));
        $this->assertEquals('Lions United', $patchRes->json('homeTeamName'));
        $this->assertEquals(5, $patchRes->json('homeTotalMatches'));
        $this->assertEquals(10, $patchRes->json('homeTotalGames'));
        $this->assertEquals(210, $patchRes->json('homeTotalPoints'));
        $this->assertEquals('Bristol Smashers', $patchRes->json('visitingTeamName'));
        $this->assertEquals(1, $patchRes->json('visitingTotalMatches'));
        $this->assertEquals(3, $patchRes->json('visitingTotalGames'));
        $this->assertEquals(145, $patchRes->json('visitingTotalPoints'));

        // 3. Database verification
        $fixture = Fixture::find($fixtureId);
        $this->assertEquals('Win', $fixture->result);
        $this->assertEquals('Lions United', $fixture->home_team_name);
        $this->assertEquals(5, $fixture->home_total_matches);
        $this->assertEquals(10, $fixture->home_total_games);
        $this->assertEquals(210, $fixture->home_total_points);
        $this->assertEquals('Bristol Smashers', $fixture->visiting_team_name);
        $this->assertEquals(1, $fixture->visiting_total_matches);
        $this->assertEquals(3, $fixture->visiting_total_games);
        $this->assertEquals(145, $fixture->visiting_total_points);

        // 4. Reload fixture (View Fixture page API)
        $showRes = $this->actingAs($this->admin)->getJson('/api/fixtures/' . $fixtureId);
        $showRes->assertOk();
        $this->assertEquals('Win', $showRes->json('result'));
        $this->assertEquals(5, $showRes->json('homeTotalMatches'));
        $this->assertEquals(10, $showRes->json('homeTotalGames'));
        $this->assertEquals(210, $showRes->json('homeTotalPoints'));
        $this->assertEquals(1, $showRes->json('visitingTotalMatches'));
        $this->assertEquals(3, $showRes->json('visitingTotalGames'));
        $this->assertEquals(145, $showRes->json('visitingTotalPoints'));
    }

    public function test_authorized_member_can_edit_match_result_and_stats_and_clear_result(): void
    {
        // 1. Create fixture for group1
        $fixture = Fixture::create([
            'id' => 'fix_res_' . Str::random(6),
            'name' => 'League Match Round 3',
            'date' => '2026-09-15 18:00:00',
            'league_group_id' => $this->group1->id,
            'match_type' => 'League Cup',
            'venue_type' => 'Away',
            'opposition_club' => 'Oxford Racquets',
            'team_name' => 'Lions Team',
            'grade' => 'Division 1',
            'status' => 'In Progress',
            'result' => 'Win',
            'home_team_name' => 'Lions Team',
            'home_total_matches' => 4,
            'home_total_games' => 9,
            'home_total_points' => 195,
            'visiting_team_name' => 'Oxford Racquets',
            'visiting_total_matches' => 2,
            'visiting_total_games' => 5,
            'visiting_total_points' => 160,
        ]);

        // 2. Member who belongs to group1 edits the result to "Loss" and updates scores
        $memberPatch = $this->actingAs($this->memberUserWithGroup)->patchJson('/api/fixtures/' . $fixture->id, [
            'result' => 'Loss',
            'homeTotalMatches' => 2,
            'homeTotalGames' => 4,
            'homeTotalPoints' => 150,
            'visitingTotalMatches' => 4,
            'visitingTotalGames' => 8,
            'visitingTotalPoints' => 190,
        ]);
        $memberPatch->assertOk();
        $this->assertEquals('Loss', $memberPatch->json('result'));
        $this->assertEquals(2, $memberPatch->json('homeTotalMatches'));
        $this->assertEquals(4, $memberPatch->json('visitingTotalMatches'));

        // 3. Member clears the match result back to optional/null
        $clearPatch = $this->actingAs($this->memberUserWithGroup)->patchJson('/api/fixtures/' . $fixture->id, [
            'result' => '',
            'homeTotalMatches' => null,
            'homeTotalGames' => null,
            'homeTotalPoints' => null,
            'visitingTotalMatches' => null,
            'visitingTotalGames' => null,
            'visitingTotalPoints' => null,
        ]);
        $clearPatch->assertOk();
        $this->assertNull($clearPatch->json('result'));
        $this->assertNull($clearPatch->json('homeTotalMatches'));
        $this->assertNull($clearPatch->json('visitingTotalMatches'));

        // 4. Sync endpoint reloads cleared state accurately
        $syncRes = $this->actingAs($this->memberUserWithGroup)->getJson('/api/sync-data');
        $syncRes->assertOk();
        $item = collect($syncRes->json('fixtures'))->firstWhere('id', $fixture->id);
        $this->assertNotNull($item);
        $this->assertNull($item['result']);

        // 5. Unauthorized member (not belonging to group1) cannot edit fixture result
        // Create user in another group
        $otherUser = User::create([
            'id' => 'u_other_' . Str::random(8),
            'first_name' => 'Other',
            'last_name' => 'User',
            'sex' => 'male',
            'dob' => '1991-01-01',
            'email' => 'other_' . Str::random(8) . '@test.com',
            'mobile' => '+1000000099',
            'address' => 'Other Addr',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);
        $otherMember = Member::create([
            'id' => 'm_oth_' . Str::random(8),
            'user_id' => $otherUser->id,
            'first_name' => 'Other',
            'last_name' => 'Member',
            'email' => $otherUser->email,
            'sex' => 'male',
            'dob' => '1991-01-01',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 50.0,
            'grade' => 'Division 1',
        ]);
        $this->group2->members()->sync([
            $otherMember->id => ['position' => 'Player'],
        ]);

        $unauthRes = $this->actingAs($otherUser)->patchJson('/api/fixtures/' . $fixture->id, [
            'result' => 'Win',
            'homeTotalMatches' => 6,
        ]);
        $unauthRes->assertStatus(403);
    }
}
