<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Location;
use App\Models\Member;
use App\Models\PlayInvitation;
use App\Models\PlaySchedule;
use App\Models\Setting;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PlayScheduleAuditFixesTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult', 'rank' => 1]);
        Location::firstOrCreate(['name' => 'Main Court']);
        Setting::updateOrCreate(['key' => 'currency'], ['value' => '$']);

        $this->admin = User::create([
            'id' => 'u_admin_audit',
            'first_name' => 'Admin',
            'last_name' => 'Audit',
            'email' => 'admin_audit@test.com',
            'sex' => 'male',
            'dob' => '1985-01-01',
            'mobile' => '+1111111119',
            'address' => 'Admin Address',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'is_super_admin' => true,
            'status' => 'active',
        ]);
    }

    /** @return array{0: User, 1: Member} */
    protected function createUserMember(string $first, float $credit = 100.0): array
    {
        $email = strtolower($first) . Str::random(4) . '@test.com';
        $user = User::create([
            'id' => 'u_' . Str::random(8),
            'first_name' => $first,
            'last_name' => 'Tester',
            'email' => $email,
            'mobile' => '+1' . rand(1000000000, 9999999999),
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'address' => 'Test Address',
        ]);

        $member = Member::create([
            'id' => 'm_' . Str::random(8),
            'user_id' => $user->id,
            'first_name' => $first,
            'last_name' => 'Tester',
            'dob' => '1990-01-01',
            'email' => $email,
            'sex' => 'male',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => $credit,
            'grade' => 'Grade A',
            'play_eligible' => true,
            'training_eligible' => true,
        ]);

        return [$user, $member];
    }

    protected function createSchedule(string $status = 'released', int $players = 4, float $rate = 10.0): PlaySchedule
    {
        return PlaySchedule::create([
            'id' => 'ps_' . Str::random(8),
            'name' => 'Audit Session ' . Str::random(4),
            'date' => now()->addDays(3)->format('Y-m-d H:i:s'),
            'location' => 'Main Court',
            'courts' => 1,
            'players' => $players,
            'session_rate' => $rate,
            'hall_rate' => 0.0,
            'slot_hours' => 2.0,
            'slot_duration' => '2 hours',
            'status' => $status,
            'is_league_match' => false,
        ]);
    }

    protected function invite(string $scheduleId, string $memberId, string $status = 'open', bool $debited = false): PlayInvitation
    {
        // Member creation may already have auto-synced an open invite for released schedules.
        return PlayInvitation::updateOrCreate(
            ['schedule_id' => $scheduleId, 'member_id' => $memberId],
            [
                'id' => 'pi_' . Str::random(8),
                'status' => $status,
                'accepted_at' => $status === 'accepted' ? now() : null,
                'debited' => $debited,
            ]
        );
    }

    public function test_member_cannot_respond_to_another_members_invitation(): void
    {
        [$attacker] = $this->createUserMember('Attacker');
        [, $victim] = $this->createUserMember('Victim');
        $sch = $this->createSchedule();
        $inv = $this->invite($sch->id, $victim->id, 'open');

        $res = $this->actingAs($attacker)->postJson("/api/play-invitations/{$inv->id}/respond", [
            'status' => 'accepted',
        ]);

        $res->assertStatus(403);
        $this->assertSame('open', $inv->fresh()->status);
        $this->assertEquals(100.0, (float) $victim->fresh()->credit);
    }

    public function test_member_can_respond_to_own_invitation(): void
    {
        [$user, $member] = $this->createUserMember('Owner');
        $sch = $this->createSchedule();
        $inv = $this->invite($sch->id, $member->id, 'open');

        $this->actingAs($user)->postJson("/api/play-invitations/{$inv->id}/respond", [
            'status' => 'accepted',
        ])->assertOk();

        $fresh = $inv->fresh();
        $this->assertSame('accepted', $fresh->status);
        $this->assertTrue($fresh->debited);
        $this->assertEquals(10.0, (float) $fresh->debited_amount);
    }

    public function test_admin_can_respond_to_any_invitation(): void
    {
        [, $member] = $this->createUserMember('Someone');
        $sch = $this->createSchedule();
        $inv = $this->invite($sch->id, $member->id, 'open');

        $this->actingAs($this->admin)->postJson("/api/play-invitations/{$inv->id}/respond", [
            'status' => 'accepted',
        ])->assertOk();
    }

    public function test_list_invitations_does_not_leak_other_members_invites(): void
    {
        [$viewer, $viewerMember] = $this->createUserMember('Viewer');
        [, $other] = $this->createUserMember('Other');
        $sch = $this->createSchedule('released');
        $mine = $this->invite($sch->id, $viewerMember->id, 'open');
        $theirs = $this->invite($sch->id, $other->id, 'accepted', true);

        $res = $this->actingAs($viewer)->getJson('/api/play-invitations');
        $res->assertOk();

        $ids = collect($res->json())->pluck('id')->all();
        $memberIds = collect($res->json())->pluck('memberId')->all();

        $this->assertContains($mine->id, $ids);
        $this->assertNotContains($theirs->id, $ids);
        $this->assertNotContains($other->id, $memberIds);

        // Admins still see everything.
        $adminIds = collect($this->actingAs($this->admin)->getJson('/api/play-invitations')->json())
            ->pluck('id')->all();
        $this->assertContains($mine->id, $adminIds);
        $this->assertContains($theirs->id, $adminIds);
    }

    public function test_list_invitations_does_not_leak_in_group_schedules(): void
    {
        [$viewer, $viewerMember] = $this->createUserMember('GroupViewer');
        [, $other] = $this->createUserMember('GroupOther');

        $group = LeagueGroup::create([
            'id' => 'lg_' . Str::random(6),
            'name' => 'Audit Group ' . Str::random(4),
        ]);
        $group->members()->attach([$viewerMember->id, $other->id]);

        $sch = $this->createSchedule('released');
        $sch->league_group_ids = [$group->id];
        $sch->save();

        $mine = $this->invite($sch->id, $viewerMember->id, 'open');
        $theirs = $this->invite($sch->id, $other->id, 'open');

        $res = $this->actingAs($viewer)->getJson('/api/play-invitations');
        $ids = collect($res->json())->pluck('id')->all();

        $this->assertNotContains($theirs->id, $ids);
        $this->assertContains($mine->id, $ids);
    }

    public function test_release_twice_returns_422_and_does_not_duplicate_debits(): void
    {
        [, $member] = $this->createUserMember('Releasee');
        $sch = $this->createSchedule('open');

        $first = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/release");
        $first->assertOk();
        $this->assertSame('released', $sch->fresh()->status);

        $second = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/release");
        $second->assertStatus(422);

        $this->assertSame(1, PlayInvitation::where('schedule_id', $sch->id)->where('member_id', $member->id)->count());
    }

    public function test_cannot_release_from_other_statuses(): void
    {
        foreach (['rotated', 'published', 'closed', 'cancelled'] as $status) {
            $sch = $this->createSchedule($status);
            $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/release")->assertStatus(422);
            $this->assertSame($status, $sch->fresh()->status);
        }
    }

    public function test_reducing_capacity_below_accepted_count_returns_422(): void
    {
        $sch = $this->createSchedule('released', 4);
        foreach (['A', 'B', 'C'] as $name) {
            [, $m] = $this->createUserMember($name);
            $this->invite($sch->id, $m->id, 'accepted', true);
        }

        $res = $this->actingAs($this->admin)->patchJson("/api/schedules/{$sch->id}", ['players' => 2]);
        $res->assertStatus(422);
        $this->assertSame(4, (int) $sch->fresh()->players);

        $this->actingAs($this->admin)->patchJson("/api/schedules/{$sch->id}", ['players' => 3])->assertOk();
    }

    public function test_update_rejects_terminal_statuses(): void
    {
        $sch = $this->createSchedule('released');

        foreach (['cancelled', 'closed', 'published'] as $status) {
            $this->actingAs($this->admin)->patchJson("/api/schedules/{$sch->id}", ['status' => $status])
                ->assertStatus(422);
        }
        $this->assertSame('released', $sch->fresh()->status);
    }

    public function test_close_cancelled_schedule_returns_422(): void
    {
        $sch = $this->createSchedule('cancelled');

        $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/close")->assertStatus(422);
        $this->assertSame('cancelled', $sch->fresh()->status);
    }

    public function test_cancel_refunds_debited_amount_snapshot_once(): void
    {
        [, $member] = $this->createUserMember('Snap', 100.0);
        $sch = $this->createSchedule('released', 4, 10.0);
        $inv = $this->invite($sch->id, $member->id, 'accepted', true);
        $inv->debited_amount = 7.5; // charged earlier at a different effective rate
        $inv->save();
        $member->credit = 92.5;
        $member->save();

        $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/cancel", ['reason' => 'Rain'])->assertOk();
        // A second cancel must not refund again.
        $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/cancel", ['reason' => 'Rain'])->assertOk();

        $this->assertEquals(100.0, (float) $member->fresh()->credit);
        $this->assertSame(1, Transaction::where('member_id', $member->id)->where('type', 'refund')->count());
        $this->assertFalse($inv->fresh()->debited);
        $this->assertNull($inv->fresh()->debited_amount);
    }

    public function test_lock_hours_zero_rotates_at_match_start(): void
    {
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '0']);
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);

        [, $member] = $this->createUserMember('ZeroLock');
        $sch = $this->createSchedule('released');
        $sch->date = now()->subMinute()->format('Y-m-d H:i:s');
        $sch->save();
        $this->invite($sch->id, $member->id, 'accepted', true);

        \App\Http\Controllers\Api\PlayScheduleController::processAutoPublishAndRotation();

        $this->assertContains($sch->fresh()->status, ['rotated', 'published']);
    }

    public function test_debit_cron_uses_play_session_description_and_leaves_insufficient_undebited(): void
    {
        Setting::updateOrCreate(['key' => 'debit_timing_hours'], ['value' => '24']);

        [, $rich] = $this->createUserMember('Rich', 100.0);
        [, $poor] = $this->createUserMember('Poor', 1.0);
        $sch = $this->createSchedule('released', 4, 10.0);
        $sch->date = now()->addHours(5)->format('Y-m-d H:i:s');
        $sch->save();
        $richInv = $this->invite($sch->id, $rich->id, 'accepted', false);
        $poorInv = $this->invite($sch->id, $poor->id, 'accepted', false);

        \Illuminate\Support\Facades\Artisan::call('debit:cancellations');

        $this->assertTrue($richInv->fresh()->debited);
        $this->assertEquals(10.0, (float) $richInv->fresh()->debited_amount);
        $this->assertEquals(90.0, (float) $rich->fresh()->credit);
        $this->assertDatabaseHas('transactions', [
            'member_id' => $rich->id,
            'type' => 'debit',
            'description' => 'Play session: ' . $sch->name . ' - ' . $rich->name,
        ]);

        $this->assertFalse($poorInv->fresh()->debited);
        $this->assertEquals(1.0, (float) $poor->fresh()->credit);
    }

    public function test_member_cannot_enroll_non_family_member(): void
    {
        [$user] = $this->createUserMember('Enroller');
        [, $stranger] = $this->createUserMember('Stranger');
        $sch = $this->createSchedule('released');

        $this->actingAs($user)->postJson("/api/schedules/{$sch->id}/enroll", [
            'memberIds' => [$stranger->id],
        ])->assertStatus(422);

        $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/enroll", [
            'memberIds' => [$stranger->id],
        ])->assertOk();
    }
}
