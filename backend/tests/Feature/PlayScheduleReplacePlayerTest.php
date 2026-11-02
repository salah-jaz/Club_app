<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Location;
use App\Models\Member;
use App\Models\PlayInvitation;
use App\Models\PlaySchedule;
use App\Models\Rotation;
use App\Models\Setting;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PlayScheduleReplacePlayerTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $memberUser;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult', 'rank' => 1]);
        Grade::firstOrCreate(['name' => 'Beginner'], ['type' => 'junior', 'rank' => 5]);
        Location::firstOrCreate(['name' => 'Main Court']);
        Setting::updateOrCreate(['key' => 'currency'], ['value' => '$']);

        $this->admin = User::firstOrCreate(
            ['email' => 'admin_replace@test.com'],
            [
                'id' => 'u_admin_replace_test',
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1985-01-01',
                'mobile' => '+1111111111',
                'address' => 'Admin Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->memberUser = User::firstOrCreate(
            ['email' => 'member_replace@test.com'],
            [
                'id' => 'u_member_replace_test',
                'first_name' => 'Member',
                'last_name' => 'User',
                'sex' => 'female',
                'dob' => '1990-01-01',
                'mobile' => '+2222222222',
                'address' => 'Member Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );
    }

    protected function createMember(string $name, float $credit = 100.0, string $type = 'adult', ?string $parentId = null, bool $skipCredit = false): Member
    {
        $parts = explode(' ', $name);
        $first = $parts[0];
        $last = $parts[1] ?? 'Test';
        $email = strtolower($first . '.' . $last . Str::random(4) . '@test.com');

        if ($type === 'junior' && $parentId) {
            $parent = Member::find($parentId);
            $userId = $parent ? $parent->user_id : $this->memberUser->id;
        } else {
            $user = User::create([
                'id' => 'u_' . Str::random(8),
                'first_name' => $first,
                'last_name' => $last,
                'email' => $email,
                'mobile' => '+1' . rand(1000000000, 9999999999),
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'address' => 'Test Address',
            ]);
            $userId = $user->id;
        }

        return Member::create([
            'id' => 'm_' . Str::random(8),
            'user_id' => $userId,
            'parent_member_id' => $parentId,
            'first_name' => $first,
            'last_name' => $last,
            'dob' => $type === 'junior' ? '2015-01-01' : '1990-01-01',
            'email' => $email,
            'sex' => 'male',
            'member_type' => $type,
            'membership' => true,
            'status' => 'active',
            'credit' => $credit,
            'grade' => $type === 'junior' ? 'Beginner' : 'Grade A',
            'play_eligible' => true,
            'training_eligible' => true,
            'skip_credit_consumption' => $skipCredit,
        ]);
    }

    protected function setInvitation(string $scheduleId, string $memberId, string $status, bool $debited = false, ?\Carbon\Carbon $acceptedAt = null): PlayInvitation
    {
        return PlayInvitation::updateOrCreate(
            ['schedule_id' => $scheduleId, 'member_id' => $memberId],
            [
                'id' => 'pi_' . Str::random(8),
                'status' => $status,
                'debited' => $debited,
                'accepted_at' => $acceptedAt,
            ]
        );
    }

    protected function createSchedule(int $players = 4, float $rate = 15.0, string $status = 'released'): PlaySchedule
    {
        return PlaySchedule::create([
            'id' => 'ps_' . Str::random(8),
            'name' => 'Saturday Open Play',
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

    public function test_admin_can_replace_accepted_member_with_member_from_waiting_list(): void
    {
        $sch = $this->createSchedule(4, 15.0, 'released');

        $p1 = $this->createMember('Ananta Bokka', 50.0);
        $p2 = $this->createMember('Bob Smith', 50.0);
        $p3 = $this->createMember('Charlie Brown', 50.0);
        $p4 = $this->createMember('David Miller', 50.0);
        $w1 = $this->createMember('md irfan', 60.0);
        $w2 = $this->createMember('Frank Sinatra', 60.0);

        // Accept 4 players and debit them
        foreach ([$p1, $p2, $p3, $p4] as $p) {
            $this->setInvitation($sch->id, $p->id, 'accepted', true, now());
            $p->credit -= 15.0;
            $p->save();

            Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $p->id,
                'type' => 'debit',
                'amount' => 15.0,
                'description' => 'Play session: ' . $sch->name . ' - ' . $p->name,
                'date' => now(),
            ]);
        }

        // 2 players on waiting list
        $this->setInvitation($sch->id, $w1->id, 'waiting', false);
        $this->setInvitation($sch->id, $w2->id, 'waiting', false);

        // Generate rotation
        $rounds = [
            [
                'round' => 1,
                'courts' => [
                    ['courtNo' => 1, 'players' => [$p1->id, $p2->id, $p3->id, $p4->id]],
                ],
                'resting' => [],
            ],
            [
                'round' => 2,
                'courts' => [
                    ['courtNo' => 1, 'players' => [$p2->id, $p3->id, $p4->id, $p1->id]],
                ],
                'resting' => [],
            ],
        ];
        Rotation::create([
            'id' => 'r_' . Str::random(8),
            'schedule_id' => $sch->id,
            'rounds' => $rounds,
            'show_member_grades' => true,
        ]);
        $sch->status = 'rotated';
        $sch->save();

        // Admin replaces Ananta Bokka ($p1) with md irfan ($w1)
        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/replace-player", [
            'outgoingMemberId' => $p1->id,
            'replacementMemberId' => $w1->id,
        ]);

        $res->assertStatus(200);
        $res->assertJsonPath('schedule.players', 4);

        // 1. Verify Outgoing Member (Ananta Bokka)
        $p1Invite = PlayInvitation::where('schedule_id', $sch->id)->where('member_id', $p1->id)->first();
        $this->assertEquals('open', $p1Invite->status);
        $this->assertFalse((bool) $p1Invite->debited);

        // Exactly one refund transaction
        $refundTxns = Transaction::where('member_id', $p1->id)->where('type', 'refund')->get();
        $this->assertCount(1, $refundTxns);
        $this->assertEquals(15.0, (float) $refundTxns->first()->amount);

        // Wallet balance refunded ($35 + $15 = $50)
        $this->assertEquals(50.0, (float) $p1->fresh()->credit);

        // 2. Verify Replacement Member (md irfan)
        $w1Invite = PlayInvitation::where('schedule_id', $sch->id)->where('member_id', $w1->id)->first();
        $this->assertEquals('accepted', $w1Invite->status);
        $this->assertTrue((bool) $w1Invite->debited);

        // Exactly one debit transaction
        $debitTxns = Transaction::where('member_id', $w1->id)->where('type', 'debit')->get();
        $this->assertCount(1, $debitTxns);
        $this->assertEquals(15.0, (float) $debitTxns->first()->amount);

        // Wallet balance debited ($60 - $15 = $45)
        $this->assertEquals(45.0, (float) $w1->fresh()->credit);

        // 3. Verify Waiting list and capacity
        $acceptedInvs = PlayInvitation::where('schedule_id', $sch->id)->where('status', 'accepted')->get();
        $this->assertCount(4, $acceptedInvs);
        $this->assertTrue($acceptedInvs->contains('member_id', $w1->id));
        $this->assertFalse($acceptedInvs->contains('member_id', $p1->id));

        $waitingInvs = PlayInvitation::where('schedule_id', $sch->id)->where('status', 'waiting')->get();
        $this->assertCount(1, $waitingInvs);
        $this->assertEquals($w2->id, $waitingInvs->first()->member_id);

        // 4. Verify Rotation rounds
        $updatedRot = Rotation::where('schedule_id', $sch->id)->first();
        $this->assertNotNull($updatedRot);
        $this->assertEquals(
            [$w1->id, $p2->id, $p3->id, $p4->id],
            $updatedRot->rounds[0]['courts'][0]['players']
        );
        $this->assertEquals(
            [$p2->id, $p3->id, $p4->id, $w1->id],
            $updatedRot->rounds[1]['courts'][0]['players']
        );
    }

    public function test_admin_can_replace_accepted_member_with_member_from_yet_to_accept(): void
    {
        $sch = $this->createSchedule(4, 20.0, 'rotated');

        $p1 = $this->createMember('Player One', 50.0);
        $p2 = $this->createMember('Player Two', 50.0);
        $p3 = $this->createMember('Player Three', 50.0);
        $p4 = $this->createMember('Player Four', 50.0);
        $y1 = $this->createMember('Yet To Accept Member', 80.0);

        foreach ([$p1, $p2, $p3, $p4] as $p) {
            $this->setInvitation($sch->id, $p->id, 'accepted', true, now());
            $p->credit -= 20.0;
            $p->save();

            Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $p->id,
                'type' => 'debit',
                'amount' => 20.0,
                'description' => 'Play session: ' . $sch->name . ' - ' . $p->name,
                'date' => now(),
            ]);
        }

        $this->setInvitation($sch->id, $y1->id, 'open', false);

        Rotation::create([
            'id' => 'r_' . Str::random(8),
            'schedule_id' => $sch->id,
            'rounds' => [
                [
                    'round' => 1,
                    'courts' => [['courtNo' => 1, 'players' => [$p1->id, $p2->id, $p3->id, $p4->id]]],
                    'resting' => [],
                ],
            ],
            'show_member_grades' => true,
        ]);

        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/replace-player", [
            'outgoingMemberId' => $p1->id,
            'replacementMemberId' => $y1->id,
        ]);

        $res->assertStatus(200);

        $this->assertEquals(50.0, (float) $p1->fresh()->credit);
        $this->assertEquals(60.0, (float) $y1->fresh()->credit);

        $this->assertEquals('open', PlayInvitation::where('schedule_id', $sch->id)->where('member_id', $p1->id)->value('status'));
        $this->assertEquals('accepted', PlayInvitation::where('schedule_id', $sch->id)->where('member_id', $y1->id)->value('status'));

        $rot = Rotation::where('schedule_id', $sch->id)->first();
        $this->assertEquals([$y1->id, $p2->id, $p3->id, $p4->id], $rot->rounds[0]['courts'][0]['players']);
    }

    public function test_replace_player_updates_published_court_details_consistently(): void
    {
        $sch = $this->createSchedule(4, 15.0, 'published');

        $p1 = $this->createMember('Accepted Player', 40.0);
        $p2 = $this->createMember('Other Two', 40.0);
        $p3 = $this->createMember('Other Three', 40.0);
        $p4 = $this->createMember('Other Four', 40.0);
        $w1 = $this->createMember('New Player', 40.0);

        foreach ([$p1, $p2, $p3, $p4] as $p) {
            $this->setInvitation($sch->id, $p->id, 'accepted', true, now());
            Transaction::create([
                'id' => 't_' . Str::random(8),
                'member_id' => $p->id,
                'type' => 'debit',
                'amount' => 15.0,
                'description' => 'Play session: ' . $sch->name . ' - ' . $p->name,
                'date' => now(),
            ]);
        }

        $this->setInvitation($sch->id, $w1->id, 'waiting', false);

        Rotation::create([
            'id' => 'r_' . Str::random(8),
            'schedule_id' => $sch->id,
            'rounds' => [
                [
                    'round' => 1,
                    'courts' => [['courtNo' => 1, 'players' => [$p1->id, $p2->id, $p3->id, $p4->id]]],
                    'resting' => [],
                ],
            ],
            'show_member_grades' => true,
        ]);

        // Admin replaces
        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/replace-player", [
            'outgoingMemberId' => $p1->id,
            'replacementMemberId' => $w1->id,
        ]);

        $res->assertStatus(200);

        // Verify status remains published
        $this->assertEquals('published', $sch->fresh()->status);

        // Fetch published rotations endpoint as replacement member (who is accepted)
        $w1User = User::find($w1->user_id);
        $rotRes = $this->actingAs($w1User)->getJson("/api/rotations");
        $rotRes->assertStatus(200);
        $rotData = collect($rotRes->json())->firstWhere('scheduleId', $sch->id);
        $this->assertNotNull($rotData);
        $this->assertEquals([$w1->id, $p2->id, $p3->id, $p4->id], $rotData['rounds'][0]['courts'][0]['players']);

        // Outgoing member is no longer accepted, so they no longer see the published rotation
        $p1User = User::find($p1->user_id);
        $p1RotRes = $this->actingAs($p1User)->getJson("/api/rotations");
        $p1RotRes->assertStatus(200);
        $this->assertNull(collect($p1RotRes->json())->firstWhere('scheduleId', $sch->id));

        // Admin also sees the updated published rotation
        $adminRotRes = $this->actingAs($this->admin)->getJson("/api/rotations");
        $adminRotRes->assertStatus(200);
        $adminRotData = collect($adminRotRes->json())->firstWhere('scheduleId', $sch->id);
        $this->assertNotNull($adminRotData);
        $this->assertEquals([$w1->id, $p2->id, $p3->id, $p4->id], $adminRotData['rounds'][0]['courts'][0]['players']);
    }

    public function test_insufficient_credits_prevents_replacement_and_rolls_back(): void
    {
        $sch = $this->createSchedule(4, 25.0, 'rotated');

        $p1 = $this->createMember('Player One', 10.0);
        $brokePlayer = $this->createMember('Broke Member', 5.0); // Only $5, but fee is $25

        $this->setInvitation($sch->id, $p1->id, 'accepted', true, now());
        Transaction::create([
            'id' => 't_' . Str::random(8),
            'member_id' => $p1->id,
            'type' => 'debit',
            'amount' => 25.0,
            'description' => 'Play session: ' . $sch->name . ' - ' . $p1->name,
            'date' => now(),
        ]);

        $this->setInvitation($sch->id, $brokePlayer->id, 'waiting', false);

        Rotation::create([
            'id' => 'r_' . Str::random(8),
            'schedule_id' => $sch->id,
            'rounds' => [
                [
                    'round' => 1,
                    'courts' => [['courtNo' => 1, 'players' => [$p1->id]]],
                    'resting' => [],
                ],
            ],
            'show_member_grades' => true,
        ]);

        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/replace-player", [
            'outgoingMemberId' => $p1->id,
            'replacementMemberId' => $brokePlayer->id,
        ]);

        $res->assertStatus(422);
        $this->assertStringContainsString('Insufficient credits', $res->json('message'));

        // Verify rollback: p1 is still accepted, debited, no refund transaction created
        $this->assertEquals('accepted', PlayInvitation::where('member_id', $p1->id)->value('status'));
        $this->assertTrue((bool) PlayInvitation::where('member_id', $p1->id)->value('debited'));
        $this->assertEquals(0, Transaction::where('member_id', $p1->id)->where('type', 'refund')->count());
        $this->assertEquals(10.0, (float) $p1->fresh()->credit);

        // Broke member was not debited
        $this->assertEquals('waiting', PlayInvitation::where('member_id', $brokePlayer->id)->value('status'));
        $this->assertFalse((bool) PlayInvitation::where('member_id', $brokePlayer->id)->value('debited'));
        $this->assertEquals(5.0, (float) $brokePlayer->fresh()->credit);
        $this->assertEquals(0, Transaction::where('member_id', $brokePlayer->id)->where('type', 'debit')->count());

        // Rotation not changed
        $rot = Rotation::where('schedule_id', $sch->id)->first();
        $this->assertEquals([$p1->id], $rot->rounds[0]['courts'][0]['players']);
    }

    public function test_repeated_replacement_requests_never_create_duplicate_refunds_or_debits(): void
    {
        $sch = $this->createSchedule(4, 15.0, 'rotated');

        $p1 = $this->createMember('Player One', 30.0);
        $w1 = $this->createMember('Waiting One', 50.0);

        $this->setInvitation($sch->id, $p1->id, 'accepted', true, now());
        Transaction::create([
            'id' => 't_' . Str::random(8),
            'member_id' => $p1->id,
            'type' => 'debit',
            'amount' => 15.0,
            'description' => 'Play session: ' . $sch->name . ' - ' . $p1->name,
            'date' => now(),
        ]);

        $this->setInvitation($sch->id, $w1->id, 'waiting', false);

        Rotation::create([
            'id' => 'r_' . Str::random(8),
            'schedule_id' => $sch->id,
            'rounds' => [
                [
                    'round' => 1,
                    'courts' => [['courtNo' => 1, 'players' => [$p1->id]]],
                    'resting' => [],
                ],
            ],
            'show_member_grades' => true,
        ]);

        // First attempt succeeds
        $res1 = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/replace-player", [
            'outgoingMemberId' => $p1->id,
            'replacementMemberId' => $w1->id,
        ]);
        $res1->assertStatus(200);

        $this->assertEquals(1, Transaction::where('member_id', $p1->id)->where('type', 'refund')->count());
        $this->assertEquals(1, Transaction::where('member_id', $w1->id)->where('type', 'debit')->count());

        // Repeated request
        $res2 = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/replace-player", [
            'outgoingMemberId' => $p1->id,
            'replacementMemberId' => $w1->id,
        ]);
        $res2->assertStatus(422);

        // Assert NO duplicate refund or debit transactions created
        $this->assertEquals(1, Transaction::where('member_id', $p1->id)->where('type', 'refund')->count());
        $this->assertEquals(1, Transaction::where('member_id', $w1->id)->where('type', 'debit')->count());
        $this->assertEquals(45.0, (float) $p1->fresh()->credit);
        $this->assertEquals(35.0, (float) $w1->fresh()->credit);
    }

    public function test_cannot_replace_with_already_accepted_member_or_self(): void
    {
        $sch = $this->createSchedule(4, 15.0, 'released');

        $p1 = $this->createMember('Player One', 50.0);
        $p2 = $this->createMember('Player Two', 50.0);

        $this->setInvitation($sch->id, $p1->id, 'accepted', true, now());
        $this->setInvitation($sch->id, $p2->id, 'accepted', true, now());

        // Try to replace p1 with p2 (p2 already accepted)
        $res1 = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/replace-player", [
            'outgoingMemberId' => $p1->id,
            'replacementMemberId' => $p2->id,
        ]);
        $res1->assertStatus(422);
        $this->assertStringContainsString('already accepted', $res1->json('message'));

        // Try to replace p1 with p1 (self)
        $res2 = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/replace-player", [
            'outgoingMemberId' => $p1->id,
            'replacementMemberId' => $p1->id,
        ]);
        $res2->assertStatus(422);
        $this->assertStringContainsString('themselves', $res2->json('message'));
    }

    public function test_respects_adult_junior_shared_wallet_rules(): void
    {
        $sch = $this->createSchedule(4, 15.0, 'rotated');

        $p1 = $this->createMember('Adult One', 20.0);
        $parent = $this->createMember('Parent Adult', 100.0);
        $junior = $this->createMember('Child Junior', 0.0, 'junior', $parent->id);

        $this->setInvitation($sch->id, $p1->id, 'accepted', true, now());
        Transaction::create([
            'id' => 't_' . Str::random(8),
            'member_id' => $p1->id,
            'type' => 'debit',
            'amount' => 15.0,
            'description' => 'Play session: ' . $sch->name . ' - ' . $p1->name,
            'date' => now(),
        ]);

        $this->setInvitation($sch->id, $junior->id, 'waiting', false);

        Rotation::create([
            'id' => 'r_' . Str::random(8),
            'schedule_id' => $sch->id,
            'rounds' => [
                [
                    'round' => 1,
                    'courts' => [['courtNo' => 1, 'players' => [$p1->id]]],
                    'resting' => [],
                ],
            ],
            'show_member_grades' => true,
        ]);

        // Replace Adult One with Child Junior
        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/replace-player", [
            'outgoingMemberId' => $p1->id,
            'replacementMemberId' => $junior->id,
        ]);

        $res->assertStatus(200);

        // Adult One refunded to their wallet ($20 + $15 = $35)
        $this->assertEquals(35.0, (float) $p1->fresh()->credit);

        // Junior debited from Parent's wallet ($100 - $15 = $85)
        $this->assertEquals(85.0, (float) $parent->fresh()->credit);
        $this->assertEquals(0.0, (float) $junior->fresh()->credit);

        // Transaction recorded on Parent's member ID
        $this->assertEquals(1, Transaction::where('member_id', $parent->id)->where('type', 'debit')->count());
    }

    public function test_non_admin_cannot_replace_player(): void
    {
        $sch = $this->createSchedule(4, 15.0, 'released');
        $p1 = $this->createMember('Player One', 50.0);
        $w1 = $this->createMember('Waiting One', 50.0);

        $res = $this->actingAs($this->memberUser)->postJson("/api/schedules/{$sch->id}/replace-player", [
            'outgoingMemberId' => $p1->id,
            'replacementMemberId' => $w1->id,
        ]);

        $res->assertStatus(403);
    }

    public function test_cannot_replace_player_on_closed_or_cancelled_schedule(): void
    {
        $sch = $this->createSchedule(4, 15.0, 'closed');
        $p1 = $this->createMember('Player One', 50.0);
        $w1 = $this->createMember('Waiting One', 50.0);

        $res = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch->id}/replace-player", [
            'outgoingMemberId' => $p1->id,
            'replacementMemberId' => $w1->id,
        ]);

        $res->assertStatus(422);
        $this->assertStringContainsString('closed or cancelled', $res->json('message'));
    }
}
