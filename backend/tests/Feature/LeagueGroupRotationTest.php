<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Location;
use App\Models\Member;
use App\Models\PlayInvitation;
use App\Models\PlaySchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class LeagueGroupRotationTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;
    protected array $members = [];

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult', 'rank' => 1]);
        Grade::firstOrCreate(['name' => 'Grade B'], ['type' => 'adult', 'rank' => 2]);
        Location::firstOrCreate(['name' => 'Main Hall']);

        $this->admin = User::firstOrCreate(
            ['email' => 'admin_league_rot@test.com'],
            [
                'id' => 'u_admin_lgrot',
                'first_name' => 'Admin',
                'last_name' => 'LG',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'mobile' => '+1999999800',
                'address' => 'Test Address',
                'postal_code' => '12345',
                'emergency_name' => 'Emergency',
                'emergency_phone' => '+1999999999',
                'role' => 'admin',
                'status' => 'approved',
                'password' => bcrypt('password'),
            ]
        );

        // Create 8 members
        for ($i = 1; $i <= 8; $i++) {
            $user = User::firstOrCreate(
                ['email' => "lg_member_{$i}@test.com"],
                [
                    'id' => "u_lg_member_{$i}",
                    'first_name' => "LGMember{$i}",
                    'last_name' => 'Test',
                    'sex' => 'male',
                    'dob' => '1990-01-01',
                    'mobile' => "+199999980{$i}",
                    'address' => 'Test Address',
                    'postal_code' => '12345',
                    'emergency_name' => 'Emergency',
                    'emergency_phone' => '+1999999999',
                    'role' => 'member',
                    'status' => 'approved',
                    'password' => bcrypt('password'),
                ]
            );

            $member = Member::firstOrCreate(
                ['id' => "m_lg_{$i}"],
                [
                    'user_id' => $user->id,
                    'first_name' => "LGMember{$i}",
                    'last_name' => 'Test',
                    'sex' => 'male',
                    'dob' => '1990-01-01',
                    'email' => "lg_member_{$i}@test.com",
                    'member_type' => 'adult',
                    'grade' => $i % 2 === 0 ? 'Grade B' : 'Grade A',
                    'status' => 'active',
                    'membership' => true,
                    'credit' => 100,
                ]
            );
            $this->members[] = $member;
        }
    }

    public function test_league_group_rotation_rotates_positions_and_courts_across_rounds(): void
    {
        $group = LeagueGroup::create([
            'id' => 'lg_test_rot_1',
            'name' => 'Test League Group 1',
            'description' => 'Test group',
        ]);

        $memberIds = array_map(fn($m) => $m->id, $this->members);
        $group->members()->sync($memberIds);

        $schedule = PlaySchedule::create([
            'id' => 's_lg_rot_test_1',
            'name' => 'League Session 1',
            'date' => now()->addDays(2),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => 30,
            'session_rate' => 10,
            'hall_rate' => 20,
            'location' => 'Main Hall',
            'status' => 'released',
            'is_league_match' => true,
            'league_group_ids' => [$group->id],
        ]);

        foreach ($this->members as $m) {
            PlayInvitation::create([
                'id' => 'pi_' . $schedule->id . '_' . $m->id,
                'schedule_id' => $schedule->id,
                'member_id' => $m->id,
                'status' => 'accepted',
            ]);
        }

        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/rotate");
        $res->assertStatus(200);

        $rounds = $res->json('rotation.rounds');
        $this->assertCount(5, $rounds);

        // Verify position shifts across rounds for each player
        $playerSlotHistory = [];
        foreach ($rounds as $roundData) {
            foreach ($roundData['courts'] as $court) {
                $courtNo = $court['courtNo'];
                foreach ($court['players'] as $slotIdx => $pid) {
                    $playerSlotHistory[$pid][] = [
                        'round' => $roundData['round'],
                        'court' => $courtNo,
                        'slot' => $slotIdx,
                    ];
                }
            }
        }

        // Each player played 5 rounds
        foreach ($this->members as $m) {
            $history = $playerSlotHistory[$m->id] ?? [];
            $this->assertCount(5, $history, "Player {$m->id} should play in all 5 rounds");

            // Verify player was not stuck in the exact same court slot position in all 5 rounds
            $distinctSlots = array_unique(array_map(fn($h) => $h['court'] . '_' . $h['slot'], $history));
            $this->assertGreaterThan(
                1,
                count($distinctSlots),
                "Player {$m->id} must not be placed in the exact same court position every round"
            );
        }
    }

    public function test_grade_based_rotation_remains_unchanged_for_non_league_schedules(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 's_non_league_test',
            'name' => 'Non-League Schedule',
            'date' => now()->addDays(2),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => 30,
            'session_rate' => 10,
            'hall_rate' => 20,
            'location' => 'Main Hall',
            'status' => 'released',
            'is_league_match' => false,
            'league_group_ids' => [],
        ]);

        foreach ($this->members as $m) {
            PlayInvitation::create([
                'id' => 'pi_' . $schedule->id . '_' . $m->id,
                'schedule_id' => $schedule->id,
                'member_id' => $m->id,
                'status' => 'accepted',
            ]);
        }

        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/rotate");
        $res->assertStatus(200);

        $rounds = $res->json('rotation.rounds');
        $this->assertCount(5, $rounds);
    }

    public function test_multi_league_group_rotation(): void
    {
        $groupA = LeagueGroup::create(['id' => 'lg_multi_a', 'name' => 'Group A']);
        $groupB = LeagueGroup::create(['id' => 'lg_multi_b', 'name' => 'Group B']);

        $groupA->members()->sync([$this->members[0]->id, $this->members[1]->id, $this->members[2]->id, $this->members[3]->id]);
        $groupB->members()->sync([$this->members[4]->id, $this->members[5]->id, $this->members[6]->id, $this->members[7]->id]);

        $schedule = PlaySchedule::create([
            'id' => 's_lg_multi_test',
            'name' => 'Multi League Group Match',
            'date' => now()->addDays(2),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => 30,
            'session_rate' => 10,
            'hall_rate' => 20,
            'location' => 'Main Hall',
            'status' => 'released',
            'is_league_match' => true,
            'league_group_ids' => [$groupA->id, $groupB->id],
        ]);

        foreach ($this->members as $m) {
            PlayInvitation::create([
                'id' => 'pi_' . $schedule->id . '_' . $m->id,
                'schedule_id' => $schedule->id,
                'member_id' => $m->id,
                'status' => 'accepted',
            ]);
        }

        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/rotate");
        $res->assertStatus(200);

        $rounds = $res->json('rotation.rounds');
        $this->assertCount(5, $rounds);
    }

    public function test_fair_resting_rotation_when_players_exceed_slots(): void
    {
        $group = LeagueGroup::create(['id' => 'lg_rest_test', 'name' => 'Rest Test Group']);
        $group->members()->sync(array_map(fn($m) => $m->id, $this->members));

        // 8 players for 1 court (4 slots), so 4 rest each round
        $schedule = PlaySchedule::create([
            'id' => 's_lg_rest_test',
            'name' => 'Rest Schedule',
            'date' => now()->addDays(2),
            'courts' => 1,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => 30,
            'session_rate' => 10,
            'hall_rate' => 20,
            'location' => 'Main Hall',
            'status' => 'released',
            'is_league_match' => true,
            'league_group_ids' => [$group->id],
        ]);

        foreach ($this->members as $m) {
            PlayInvitation::create([
                'id' => 'pi_' . $schedule->id . '_' . $m->id,
                'schedule_id' => $schedule->id,
                'member_id' => $m->id,
                'status' => 'accepted',
            ]);
        }

        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/rotate");
        $res->assertStatus(200);

        $rounds = $res->json('rotation.rounds');
        $this->assertCount(5, $rounds);

        $playCounts = [];
        foreach ($rounds as $roundData) {
            foreach ($roundData['courts'] as $court) {
                foreach ($court['players'] as $pid) {
                    $playCounts[$pid] = ($playCounts[$pid] ?? 0) + 1;
                }
            }
        }

        // Each of the 8 players should play between 2 and 3 rounds over 5 total rounds (5 * 4 = 20 total slots / 8 = 2.5 per player)
        foreach ($this->members as $m) {
            $count = $playCounts[$m->id] ?? 0;
            $this->assertGreaterThanOrEqual(2, $count, "Player {$m->id} play count should be at least 2");
            $this->assertLessThanOrEqual(3, $count, "Player {$m->id} play count should be at most 3");
        }
    }

    public function test_league_play_session_invitations_cannot_be_declined(): void
    {
        $group = LeagueGroup::create([
            'id' => 'lg_test_nodecline',
            'name' => 'No Decline Group',
        ]);

        $schedule = PlaySchedule::create([
            'id' => 's_lg_nodecline_test',
            'name' => 'League Session No Decline',
            'date' => now()->addDays(3)->format('Y-m-d H:i:s'),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => 30,
            'session_rate' => 10,
            'hall_rate' => 20,
            'location' => 'Main Hall',
            'status' => 'released',
            'is_league_match' => true,
            'league_group_ids' => [$group->id],
        ]);

        $member = $this->members[0];
        $memberUser = User::find($member->user_id);

        $invite = PlayInvitation::create([
            'id' => 'pi_nodecline_' . $member->id,
            'schedule_id' => $schedule->id,
            'member_id' => $member->id,
            'status' => 'accepted',
        ]);

        $response = $this->actingAs($memberUser)->postJson("/api/play-invitations/{$invite->id}/respond", [
            'status' => 'declined',
        ]);

        $response->assertStatus(422);
        $response->assertJson([
            'message' => 'League play session invitations cannot be declined.',
        ]);
    }
}
