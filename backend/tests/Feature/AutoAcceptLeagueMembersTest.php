<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Location;
use App\Models\Member;
use App\Models\PlayerPosition;
use App\Models\PlayInvitation;
use App\Models\PlaySchedule;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AutoAcceptLeagueMembersTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private LeagueGroup $leagueGroup;
    private array $members = [];

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A']);
        PlayerPosition::firstOrCreate(['name' => 'Player']);
        Location::firstOrCreate(['name' => 'Main Hall']);

        $this->admin = User::factory()->create([
            'role' => 'admin',
            'status' => 'active',
        ]);

        $this->leagueGroup = LeagueGroup::create([
            'id' => 'lg_auto_accept_test',
            'name' => 'Premier League Group',
        ]);

        for ($i = 1; $i <= 4; $i++) {
            $user = User::factory()->create([
                'status' => 'active',
                'email' => "league_player_{$i}@example.com",
            ]);

            $member = Member::create([
                'id' => "m_league_{$i}",
                'user_id' => $user->id,
                'first_name' => 'League',
                'last_name' => "Player {$i}",
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => "league_player_{$i}@example.com",
                'member_type' => 'adult',
                'grade' => 'Grade A',
                'bi_member_id' => "BI_L{$i}",
                'status' => 'active',
                'credit' => 100.00,
                'membership' => true,
                'play_eligible' => true,
            ]);

            $this->leagueGroup->members()->attach($member->id, ['position' => 'Player']);
            $this->members[] = $member;
        }
    }

    public function test_release_league_schedule_with_auto_accept_on_auto_accepts_and_debits(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 's_auto_on_1',
            'name' => 'Auto Accept League Session',
            'date' => now()->addDays(2),
            'courts' => 2,
            'players' => 4,
            'slot_hours' => 2,
            'slot_duration' => '30',
            'session_rate' => 10.0,
            'hall_rate' => 20.0,
            'location' => 'Main Hall',
            'status' => 'open',
            'is_league_match' => true,
            'league_group_ids' => [$this->leagueGroup->id],
            'auto_accept_league' => true,
        ]);

        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release");
        $res->assertStatus(200);

        $invitations = PlayInvitation::where('schedule_id', $schedule->id)->get();
        $this->assertCount(4, $invitations);

        foreach ($invitations as $inv) {
            $this->assertEquals('accepted', $inv->status);
            $this->assertTrue((bool) $inv->debited);
            $this->assertNotNull($inv->accepted_at);
        }

        // Verify credit deduction & transactions
        foreach ($this->members as $member) {
            $member->refresh();
            $this->assertEquals(90.00, (float) $member->credit);

            $this->assertDatabaseHas('transactions', [
                'member_id' => $member->id,
                'type' => 'debit',
                'amount' => 10.00,
            ]);
        }
    }

    public function test_release_league_schedule_with_auto_accept_off_creates_open_invitations(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 's_auto_off_1',
            'name' => 'Manual Accept League Session',
            'date' => now()->addDays(2),
            'courts' => 2,
            'players' => 4,
            'slot_hours' => 2,
            'slot_duration' => '30',
            'session_rate' => 10.0,
            'hall_rate' => 20.0,
            'location' => 'Main Hall',
            'status' => 'open',
            'is_league_match' => true,
            'league_group_ids' => [$this->leagueGroup->id],
            'auto_accept_league' => false,
        ]);

        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release");
        $res->assertStatus(200);

        $invitations = PlayInvitation::where('schedule_id', $schedule->id)->get();
        $this->assertCount(4, $invitations);

        foreach ($invitations as $inv) {
            $this->assertEquals('open', $inv->status);
            $this->assertFalse((bool) $inv->debited);
            $this->assertNull($inv->accepted_at);
        }

        // Verify no credit was deducted
        foreach ($this->members as $member) {
            $member->refresh();
            $this->assertEquals(100.00, (float) $member->credit);
        }
    }

    public function test_release_non_league_schedule_keeps_open_invitations_regardless_of_auto_accept_setting(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 's_non_league_1',
            'name' => 'Non-League Play Session',
            'date' => now()->addDays(2),
            'courts' => 2,
            'players' => 4,
            'slot_hours' => 2,
            'slot_duration' => '30',
            'session_rate' => 10.0,
            'hall_rate' => 20.0,
            'location' => 'Main Hall',
            'status' => 'open',
            'is_league_match' => false,
            'league_group_ids' => [],
            'auto_accept_league' => true,
        ]);

        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$schedule->id}/release");
        $res->assertStatus(200);

        $invitations = PlayInvitation::where('schedule_id', $schedule->id)->get();
        $this->assertTrue($invitations->count() > 0);

        foreach ($invitations as $inv) {
            $this->assertEquals('open', $inv->status);
            $this->assertFalse((bool) $inv->debited);
        }
    }

    public function test_create_schedule_persists_auto_accept_league(): void
    {
        $res = $this->actingAs($this->admin)->postJson('/api/schedules', [
            'name' => 'New League Schedule',
            'date' => now()->addDays(3)->format('Y-m-d H:i:s'),
            'courts' => 2,
            'players' => 8,
            'slotHours' => 2,
            'slotDuration' => '30',
            'sessionRate' => 12.0,
            'hallRate' => 25.0,
            'location' => 'Main Hall',
            'isLeagueMatch' => true,
            'leagueGroupIds' => [$this->leagueGroup->id],
            'autoAcceptLeague' => true,
        ]);

        $res->assertStatus(201);
        $res->assertJsonPath('autoAcceptLeague', true);

        $scheduleId = $res->json('id');
        $schedule = PlaySchedule::find($scheduleId);
        $this->assertNotNull($schedule);
        $this->assertTrue((bool) $schedule->auto_accept_league);
    }
}
