<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Member;
use App\Models\PlayerPosition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LeagueGroupClubMembershipEligibilityTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $parentUser;
    protected Member $adultMember;
    protected Member $juniorMember;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Grade::firstOrCreate(['name' => 'Junior A'], ['type' => 'junior']);
        PlayerPosition::firstOrCreate(['name' => 'Captain']);
        PlayerPosition::firstOrCreate(['name' => 'Singles 1']);

        $this->admin = User::create([
            'id' => 'u_admin_elig',
            'first_name' => 'Admin',
            'last_name' => 'User',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'admin_elig@test.com',
            'mobile' => '+1234567890',
            'address' => 'Admin Street',
            'password' => bcrypt('password123'),
            'role' => 'admin',
            'status' => 'active',
        ]);

        $this->parentUser = User::create([
            'id' => 'u_parent_elig',
            'first_name' => 'Felix',
            'last_name' => 'Raja',
            'sex' => 'male',
            'dob' => '1985-05-15',
            'email' => 'felix_elig@test.com',
            'mobile' => '+1987654321',
            'address' => 'Member Street',
            'password' => bcrypt('password123'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->adultMember = Member::create([
            'id' => 'm_felix_raja',
            'user_id' => $this->parentUser->id,
            'first_name' => 'md',
            'last_name' => 'felix raja',
            'dob' => '1985-05-15',
            'email' => 'felix_elig@test.com',
            'sex' => 'male',
            'member_type' => 'adult',
            'membership' => true,
            'grade' => 'Grade A',
            'status' => 'active',
            'credit' => 100.00,
        ]);

        $this->juniorMember = Member::create([
            'id' => 'm_junior_felix',
            'user_id' => $this->parentUser->id,
            'parent_member_id' => $this->adultMember->id,
            'first_name' => 'Junior',
            'last_name' => 'Raja',
            'dob' => '2012-08-20',
            'email' => 'felix_elig@test.com',
            'sex' => 'male',
            'member_type' => 'junior',
            'membership' => true,
            'grade' => 'Junior A',
            'status' => 'active',
            'credit' => 0.00,
        ]);
    }

    /**
     * Issue 1: When Club Membership toggle is turned OFF for an adult,
     * automatically remove that member from all groups they belong to.
     * Member account and groups must NOT be deleted.
     */
    public function test_adult_club_membership_turned_off_automatically_removes_from_all_groups(): void
    {
        $group1 = LeagueGroup::create([
            'id' => 'lg_group_1',
            'name' => 'Group 1',
            'description' => 'Adult Group 1',
            'group_type' => 'Adult',
        ]);
        $group1->members()->attach($this->adultMember->id, ['position' => 'Captain']);

        $group2 = LeagueGroup::create([
            'id' => 'lg_group_2',
            'name' => 'Group 2',
            'description' => 'Adult Group 2',
            'group_type' => 'Adult',
        ]);
        $group2->members()->attach($this->adultMember->id, ['position' => 'Singles 1']);

        // Verify member is initially in both groups
        $this->assertDatabaseHas('league_group_member', [
            'league_group_id' => $group1->id,
            'member_id' => $this->adultMember->id,
        ]);
        $this->assertDatabaseHas('league_group_member', [
            'league_group_id' => $group2->id,
            'member_id' => $this->adultMember->id,
        ]);

        // Turn Club Membership OFF via API
        $res = $this->actingAs($this->admin)->patchJson("/api/members/{$this->adultMember->id}", [
            'membership' => false,
        ]);
        $res->assertStatus(200);

        // Verify automatic removal from all groups
        $this->assertDatabaseMissing('league_group_member', [
            'member_id' => $this->adultMember->id,
        ]);

        // Member account must NOT be deleted
        $this->assertDatabaseHas('members', [
            'id' => $this->adultMember->id,
            'membership' => false,
        ]);

        // Groups must NOT be deleted
        $this->assertDatabaseHas('league_groups', ['id' => $group1->id]);
        $this->assertDatabaseHas('league_groups', ['id' => $group2->id]);

        // Verify group lists and member counts reflect the removal
        $groupsRes = $this->actingAs($this->admin)->getJson('/api/league-groups');
        $groupsRes->assertStatus(200);
        $groups = $groupsRes->json();

        $fetchedGroup1 = collect($groups)->firstWhere('id', $group1->id);
        $this->assertEmpty($fetchedGroup1['memberIds']);
        $this->assertEmpty($fetchedGroup1['members']);
        $this->assertArrayNotHasKey($this->adultMember->id, $fetchedGroup1['memberPositions']);

        $fetchedGroup2 = collect($groups)->firstWhere('id', $group2->id);
        $this->assertEmpty($fetchedGroup2['memberIds']);
        $this->assertEmpty($fetchedGroup2['members']);
    }

    /**
     * Issue 1 (Juniors): When Club Membership toggle is turned OFF for a junior,
     * automatically remove that junior from all groups.
     */
    public function test_junior_club_membership_turned_off_automatically_removes_from_all_groups(): void
    {
        $juniorGroup = LeagueGroup::create([
            'id' => 'lg_junior_group',
            'name' => 'Junior Group 1',
            'description' => 'Junior Super League',
            'group_type' => 'Junior',
        ]);
        $juniorGroup->members()->attach($this->juniorMember->id, ['position' => 'Singles 1']);

        $this->assertDatabaseHas('league_group_member', [
            'league_group_id' => $juniorGroup->id,
            'member_id' => $this->juniorMember->id,
        ]);

        // Turn Club Membership OFF for junior
        $res = $this->actingAs($this->admin)->patchJson("/api/members/{$this->juniorMember->id}", [
            'membership' => false,
        ]);
        $res->assertStatus(200);

        $this->assertDatabaseMissing('league_group_member', [
            'member_id' => $this->juniorMember->id,
        ]);

        $this->assertDatabaseHas('members', [
            'id' => $this->juniorMember->id,
            'membership' => false,
        ]);
        $this->assertDatabaseHas('league_groups', ['id' => $juniorGroup->id]);
    }

    /**
     * Eligibility Rule: Club Membership OFF members cannot be added to a new or existing group.
     */
    public function test_member_with_club_membership_off_cannot_be_added_to_groups(): void
    {
        $this->adultMember->update(['membership' => false]);

        // 1. Attempt creating a group with membership OFF member -> rejected
        $createRes = $this->actingAs($this->admin)->postJson('/api/league-groups', [
            'name' => 'Test Ineligible Group',
            'groupType' => 'Adult',
            'memberIds' => [$this->adultMember->id],
        ]);
        $createRes->assertStatus(422);

        // 2. Create an empty group
        $group = LeagueGroup::create([
            'id' => 'lg_empty_group',
            'name' => 'Empty Group',
            'group_type' => 'Adult',
        ]);

        // 3. Attempt updating the group to add membership OFF member -> rejected
        $updateRes = $this->actingAs($this->admin)->patchJson("/api/league-groups/{$group->id}", [
            'memberIds' => [$this->adultMember->id],
        ]);
        $updateRes->assertStatus(422);
    }

    /**
     * Issue 2: Club Membership turned ON again:
     * - Member does NOT automatically re-join old groups.
     * - Admin can select and add the member back to an existing group.
     * - Admin can select and add the member to a new group.
     */
    public function test_club_membership_turned_on_allows_readding_without_auto_readding(): void
    {
        $group = LeagueGroup::create([
            'id' => 'lg_group_readd',
            'name' => 'Re-add Group',
            'group_type' => 'Adult',
        ]);
        $group->members()->attach($this->adultMember->id, ['position' => 'Captain']);

        // 1. Turn OFF -> removed
        $this->adultMember->update(['membership' => false]);
        $this->assertDatabaseMissing('league_group_member', ['member_id' => $this->adultMember->id]);

        // 2. Turn ON again via API
        $onRes = $this->actingAs($this->admin)->patchJson("/api/members/{$this->adultMember->id}", [
            'membership' => true,
        ]);
        $onRes->assertStatus(200);

        // 3. Verify NOT automatically re-added to old group
        $this->assertDatabaseMissing('league_group_member', [
            'league_group_id' => $group->id,
            'member_id' => $this->adultMember->id,
        ]);

        $groupsRes = $this->actingAs($this->admin)->getJson('/api/league-groups');
        $fetchedGroup = collect($groupsRes->json())->firstWhere('id', $group->id);
        $this->assertEmpty($fetchedGroup['memberIds']);

        // 4. Admin edits the previous group and explicitly adds the member back
        $editRes = $this->actingAs($this->admin)->patchJson("/api/league-groups/{$group->id}", [
            'memberIds' => [$this->adultMember->id],
            'memberPositions' => [$this->adultMember->id => 'Captain'],
        ]);
        $editRes->assertStatus(200);

        $this->assertDatabaseHas('league_group_member', [
            'league_group_id' => $group->id,
            'member_id' => $this->adultMember->id,
            'position' => 'Captain',
        ]);

        // 5. Admin can also add the member to a new group
        $newGroupRes = $this->actingAs($this->admin)->postJson('/api/league-groups', [
            'name' => 'Brand New Adult Group',
            'groupType' => 'Adult',
            'memberIds' => [$this->adultMember->id],
        ]);
        $newGroupRes->assertStatus(201);
    }

    /**
     * Eligibility Rule: Adult/Junior group type restrictions remain enforced.
     */
    public function test_adult_and_junior_type_restrictions_remain_enforced(): void
    {
        // Attempt adding Adult member to Junior group -> rejected
        $juniorCreate = $this->actingAs($this->admin)->postJson('/api/league-groups', [
            'name' => 'Junior Only Group',
            'groupType' => 'Junior',
            'memberIds' => [$this->adultMember->id],
        ]);
        $juniorCreate->assertStatus(422);

        // Attempt adding Junior member to Adult group -> rejected
        $adultCreate = $this->actingAs($this->admin)->postJson('/api/league-groups', [
            'name' => 'Adult Only Group',
            'groupType' => 'Adult',
            'memberIds' => [$this->juniorMember->id],
        ]);
        $adultCreate->assertStatus(422);
    }
}
