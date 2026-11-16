<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Location;
use App\Models\Member;
use App\Models\PlayInvitation;
use App\Models\PlaySchedule;
use App\Models\PlayerPosition;
use App\Models\Rotation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class MemberSchedulePlayersRosterTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $userA;
    protected User $userB;
    protected User $userOutside;

    protected Member $memberA;
    protected Member $memberB;
    protected Member $memberOutside;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult', 'rank' => 1]);
        Location::firstOrCreate(['name' => 'Main Hall']);
        PlayerPosition::firstOrCreate(['name' => 'Captain']);
        PlayerPosition::firstOrCreate(['name' => 'Player']);

        $this->admin = User::create([
            'id' => 'u_roster_admin',
            'first_name' => 'Admin',
            'last_name' => 'User',
            'sex' => 'male',
            'dob' => '1985-01-01',
            'email' => 'roster_admin@test.com',
            'mobile' => '+1000000100',
            'address' => 'Admin Addr',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'is_super_admin' => true,
            'status' => 'active',
        ]);

        $this->userA = $this->makeUser('u_roster_a', 'Alice', 'Alpha');
        $this->userB = $this->makeUser('u_roster_b', 'Bob', 'Beta');
        $this->userOutside = $this->makeUser('u_roster_out', 'Charlie', 'Outside');

        $this->memberA = $this->makeMember('m_roster_a', $this->userA, 'Alice', 'Alpha');
        $this->memberB = $this->makeMember('m_roster_b', $this->userB, 'Bob', 'Beta');
        $this->memberOutside = $this->makeMember('m_roster_out', $this->userOutside, 'Charlie', 'Outside');
    }

    private function makeUser(string $id, string $first, string $last): User
    {
        return User::create([
            'id' => $id,
            'first_name' => $first,
            'last_name' => $last,
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => strtolower($first) . '_roster@test.com',
            'mobile' => '+' . random_int(1000000000, 1999999999),
            'address' => 'Addr',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);
    }

    private function makeMember(string $id, User $user, string $first, string $last): Member
    {
        return Member::create([
            'id' => $id,
            'user_id' => $user->id,
            'first_name' => $first,
            'last_name' => $last,
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => $user->email,
            'mobile' => $user->mobile,
            'member_type' => 'adult',
            'grade' => 'Grade A',
            'status' => 'active',
            'membership' => true,
            'credit' => 100,
        ]);
    }

    private function createOpenSchedule(array $overrides = []): PlaySchedule
    {
        return PlaySchedule::create(array_merge([
            'id' => 's_roster_' . Str::random(6),
            'name' => 'Friday Open Play',
            'date' => now()->addDays(2)->setTime(18, 0),
            'courts' => 1,
            'players' => 4,
            'slot_hours' => 2,
            'slot_duration' => '15 min',
            'session_rate' => 10,
            'hall_rate' => 0,
            'location' => 'Main Hall',
            'status' => 'released',
            'is_league_match' => false,
            'league_group_ids' => [],
        ], $overrides));
    }

    public function test_member_sees_all_accepted_and_waiting_players_with_names(): void
    {
        $sch = $this->createOpenSchedule(['players' => 1]);

        PlayInvitation::create([
            'id' => 'pi_roster_a',
            'schedule_id' => $sch->id,
            'member_id' => $this->memberA->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);
        PlayInvitation::create([
            'id' => 'pi_roster_b',
            'schedule_id' => $sch->id,
            'member_id' => $this->memberB->id,
            'status' => 'waiting',
        ]);
        PlayInvitation::create([
            'id' => 'pi_roster_open',
            'schedule_id' => $sch->id,
            'member_id' => $this->memberOutside->id,
            'status' => 'open',
        ]);

        $res = $this->actingAs($this->userA)->getJson("/api/schedules/{$sch->id}/players");
        $res->assertStatus(200);

        $rows = collect($res->json());
        $this->assertCount(2, $rows);
        $this->assertTrue($rows->contains(fn($r) => $r['memberId'] === $this->memberA->id && $r['memberName'] === 'Alice Alpha' && $r['status'] === 'accepted'));
        $this->assertTrue($rows->contains(fn($r) => $r['memberId'] === $this->memberB->id && $r['memberName'] === 'Bob Beta' && $r['status'] === 'waiting'));
        $this->assertFalse($rows->contains(fn($r) => $r['memberId'] === $this->memberOutside->id));
    }

    public function test_published_rotation_includes_player_directory_and_court_names(): void
    {
        $sch = $this->createOpenSchedule([
            'status' => 'published',
            'players' => 4,
        ]);

        PlayInvitation::create([
            'id' => 'pi_roster_pub_a',
            'schedule_id' => $sch->id,
            'member_id' => $this->memberA->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);
        PlayInvitation::create([
            'id' => 'pi_roster_pub_b',
            'schedule_id' => $sch->id,
            'member_id' => $this->memberB->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);

        Rotation::create([
            'id' => 'r_roster_1',
            'schedule_id' => $sch->id,
            'rounds' => [
                [
                    'round' => 1,
                    'resting' => [],
                    'courts' => [
                        [
                            'courtNo' => 1,
                            'courtName' => 'Centre Court',
                            'players' => [$this->memberA->id, $this->memberB->id, 'guest_1', 'guest_2'],
                        ],
                    ],
                ],
            ],
            'show_member_grades' => true,
        ]);

        $rotRes = $this->actingAs($this->userA)->getJson('/api/rotations');
        $rotRes->assertStatus(200);
        $rotation = collect($rotRes->json())->firstWhere('scheduleId', $sch->id);
        $this->assertNotNull($rotation);
        $this->assertEquals('Centre Court', $rotation['rounds'][0]['courts'][0]['courtName']);
        $this->assertEquals('Alice Alpha', $rotation['playerDirectory'][$this->memberA->id]['name']);
        $this->assertEquals('Bob Beta', $rotation['playerDirectory'][$this->memberB->id]['name']);
        $this->assertEquals('Guest Player 1', $rotation['playerDirectory']['guest_1']['name']);

        $playersRes = $this->actingAs($this->userA)->getJson("/api/schedules/{$sch->id}/players");
        $playersRes->assertStatus(200);
        $guestRows = collect($playersRes->json())->filter(fn($r) => ($r['isGuest'] ?? false) === true);
        $this->assertCount(2, $guestRows);
    }

    public function test_group_schedule_exposes_player_positions_to_eligible_member(): void
    {
        $group = LeagueGroup::create([
            'id' => 'lg_roster_1',
            'name' => 'L1',
            'description' => '',
            'group_type' => 'Adult',
        ]);
        $group->members()->sync([
            $this->memberA->id => ['position' => 'Captain'],
            $this->memberB->id => ['position' => 'Player'],
        ]);

        $sch = $this->createOpenSchedule([
            'is_league_match' => true,
            'league_group_ids' => [$group->id],
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'pi_roster_g_a',
            'schedule_id' => $sch->id,
            'member_id' => $this->memberA->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);
        PlayInvitation::create([
            'id' => 'pi_roster_g_b',
            'schedule_id' => $sch->id,
            'member_id' => $this->memberB->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);

        $res = $this->actingAs($this->userA)->getJson("/api/schedules/{$sch->id}/players");
        $res->assertStatus(200);
        $byId = collect($res->json())->keyBy('memberId');
        $this->assertEquals('Captain', $byId[$this->memberA->id]['memberPosition']);
        $this->assertEquals('Player', $byId[$this->memberB->id]['memberPosition']);

        $outside = $this->actingAs($this->userOutside)->getJson("/api/schedules/{$sch->id}/players");
        $outside->assertStatus(403);
    }

    public function test_admin_players_endpoint_still_returns_full_invite_list(): void
    {
        $sch = $this->createOpenSchedule();

        PlayInvitation::create([
            'id' => 'pi_roster_admin_a',
            'schedule_id' => $sch->id,
            'member_id' => $this->memberA->id,
            'status' => 'accepted',
            'accepted_at' => now(),
        ]);
        PlayInvitation::create([
            'id' => 'pi_roster_admin_open',
            'schedule_id' => $sch->id,
            'member_id' => $this->memberB->id,
            'status' => 'open',
        ]);

        $res = $this->actingAs($this->admin)->getJson("/api/schedules/{$sch->id}/players");
        $res->assertStatus(200);
        $this->assertCount(2, $res->json());
        $this->assertTrue(collect($res->json())->contains(fn($r) => $r['status'] === 'open'));
    }
}
