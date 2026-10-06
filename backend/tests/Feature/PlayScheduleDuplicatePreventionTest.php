<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Member;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\User;
use App\Models\Location;
use App\Models\Rotation;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlayScheduleDuplicatePreventionTest extends TestCase
{
    use RefreshDatabase;

    protected User $adminUser;
    protected User $memberUser;
    protected Member $rahul;
    protected Member $member1;
    protected Member $member2;
    protected Member $member3;
    protected Member $member5;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult', 'rank' => 1]);
        Location::firstOrCreate(['name' => 'Court 1']);
        Setting::updateOrCreate(['key' => 'currency'], ['value' => '$']);

        $this->adminUser = User::firstOrCreate(
            ['id' => 'u_admin_play_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'Boss',
                'sex' => 'male',
                'dob' => '1980-01-01',
                'email' => 'admin@playtest.com',
                'mobile' => '+1111111111',
                'address' => '123 Admin St',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->memberUser = User::firstOrCreate(
            ['id' => 'u_member_user'],
            [
                'first_name' => 'Test',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'memberuser@playtest.com',
                'mobile' => '+2222222222',
                'address' => '456 Member St',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->rahul = Member::firstOrCreate(
            ['id' => 'm_rahul'],
            [
                'user_id' => $this->memberUser->id,
                'first_name' => 'Rahul',
                'last_name' => 'Tyagi',
                'member_type' => 'adult',
                'status' => 'active',
                'membership' => true,
                'credit' => 100.00,
                'email' => 'rahul@playtest.com',
                'sex' => 'male',
                'dob' => '1992-05-10',
                'grade' => 'Grade A',
            ]
        );

        $this->member1 = Member::firstOrCreate(
            ['id' => 'm_player1'],
            [
                'user_id' => $this->memberUser->id,
                'first_name' => 'Player',
                'last_name' => 'One',
                'member_type' => 'adult',
                'status' => 'active',
                'membership' => true,
                'credit' => 100.00,
                'email' => 'player1@playtest.com',
                'sex' => 'male',
                'dob' => '1991-01-01',
                'grade' => 'Grade A',
            ]
        );

        $this->member2 = Member::firstOrCreate(
            ['id' => 'm_player2'],
            [
                'user_id' => $this->memberUser->id,
                'first_name' => 'Player',
                'last_name' => 'Two',
                'member_type' => 'adult',
                'status' => 'active',
                'membership' => true,
                'credit' => 100.00,
                'email' => 'player2@playtest.com',
                'sex' => 'female',
                'dob' => '1993-02-02',
                'grade' => 'Grade A',
            ]
        );

        $this->member3 = Member::firstOrCreate(
            ['id' => 'm_player3'],
            [
                'user_id' => $this->memberUser->id,
                'first_name' => 'Player',
                'last_name' => 'Three',
                'member_type' => 'adult',
                'status' => 'active',
                'membership' => true,
                'credit' => 100.00,
                'email' => 'player3@playtest.com',
                'sex' => 'male',
                'dob' => '1994-03-03',
                'grade' => 'Grade A',
            ]
        );

        $this->member5 = Member::firstOrCreate(
            ['id' => 'm_player5'],
            [
                'user_id' => $this->memberUser->id,
                'first_name' => 'Player',
                'last_name' => 'Five',
                'member_type' => 'adult',
                'status' => 'active',
                'membership' => true,
                'credit' => 100.00,
                'email' => 'player5@playtest.com',
                'sex' => 'female',
                'dob' => '1995-04-04',
                'grade' => 'Grade A',
            ]
        );
    }

    public function test_cannot_have_duplicate_invitation_records_for_same_member_and_schedule()
    {
        $sch = PlaySchedule::create([
            'id' => 's_test_dup_1',
            'name' => 'Friday Session',
            'date' => now()->addDays(3)->setTime(18, 0),
            'courts' => 2,
            'players' => 5,
            'slot_hours' => 2.0,
            'slot_duration' => '6:00 PM - 8:00 PM',
            'session_rate' => 10.0,
            'hall_rate' => 0.0,
            'location' => 'Court 1',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'pi_rahul_1',
            'schedule_id' => $sch->id,
            'member_id' => $this->rahul->id,
            'status' => 'open',
        ]);

        // Attempting direct DB duplicate insert should violate unique constraint
        $this->expectException(\Illuminate\Database\QueryException::class);
        PlayInvitation::create([
            'id' => 'pi_rahul_2',
            'schedule_id' => $sch->id,
            'member_id' => $this->rahul->id,
            'status' => 'open',
        ]);
    }

    public function test_enroll_safely_prevents_duplicate_invites_and_accepts()
    {
        $sch = PlaySchedule::create([
            'id' => 's_test_enroll_dup',
            'name' => 'Friday Session',
            'date' => now()->addDays(3)->setTime(18, 0),
            'courts' => 2,
            'players' => 5,
            'slot_hours' => 2.0,
            'slot_duration' => '6:00 PM - 8:00 PM',
            'session_rate' => 10.0,
            'hall_rate' => 0.0,
            'location' => 'Court 1',
            'status' => 'released',
        ]);

        // Enrolling with duplicate IDs in the request
        $response = $this->actingAs($this->memberUser)->postJson("/api/schedules/{$sch->id}/enroll", [
            'memberIds' => [$this->rahul->id, $this->rahul->id],
            'autoAccept' => true,
        ]);

        $response->assertStatus(200);

        // Rahul must only have 1 invitation
        $this->assertEquals(1, PlayInvitation::where('schedule_id', $sch->id)->where('member_id', $this->rahul->id)->count());

        // Subsequent enroll request for already invited member should return 422
        $response2 = $this->actingAs($this->memberUser)->postJson("/api/schedules/{$sch->id}/enroll", [
            'memberIds' => [$this->rahul->id],
            'autoAccept' => true,
        ]);
        $response2->assertStatus(422);
        $this->assertEquals(1, PlayInvitation::where('schedule_id', $sch->id)->where('member_id', $this->rahul->id)->count());
    }

    public function test_5_player_capacity_with_rahul_and_waiting_member_promotion()
    {
        // Example from prompt:
        // Play Session: Capacity 5 players.
        // 4 unique members accept (Member 1, Member 2, Member 3, Rahul Tyagi).
        // A 5th eligible member is on the waiting list.
        // Rahul must only take 1 slot.
        // The 5th waiting member must be able to fill the 5th available slot.

        $sch = PlaySchedule::create([
            'id' => 's_capacity_5_test',
            'name' => 'Friday Play Session',
            'date' => now()->addDays(3)->setTime(18, 0),
            'courts' => 2,
            'players' => 5,
            'slot_hours' => 2.0,
            'slot_duration' => '6:00 PM - 8:00 PM',
            'session_rate' => 10.0,
            'hall_rate' => 0.0,
            'location' => 'Court 1',
            'status' => 'released',
        ]);

        // 1. Member 1 accepts
        $inv1 = PlayInvitation::create([
            'id' => 'pi_m1',
            'schedule_id' => $sch->id,
            'member_id' => $this->member1->id,
            'status' => 'open',
        ]);
        $this->actingAs($this->memberUser)->postJson("/api/play-invitations/{$inv1->id}/respond", ['status' => 'accepted'])->assertStatus(200);

        // 2. Member 2 accepts
        $inv2 = PlayInvitation::create([
            'id' => 'pi_m2',
            'schedule_id' => $sch->id,
            'member_id' => $this->member2->id,
            'status' => 'open',
        ]);
        $this->actingAs($this->memberUser)->postJson("/api/play-invitations/{$inv2->id}/respond", ['status' => 'accepted'])->assertStatus(200);

        // 3. Member 3 accepts
        $inv3 = PlayInvitation::create([
            'id' => 'pi_m3',
            'schedule_id' => $sch->id,
            'member_id' => $this->member3->id,
            'status' => 'open',
        ]);
        $this->actingAs($this->memberUser)->postJson("/api/play-invitations/{$inv3->id}/respond", ['status' => 'accepted'])->assertStatus(200);

        // 4. Rahul Tyagi accepts
        $invRahul = PlayInvitation::create([
            'id' => 'pi_rahul',
            'schedule_id' => $sch->id,
            'member_id' => $this->rahul->id,
            'status' => 'open',
        ]);
        $this->actingAs($this->memberUser)->postJson("/api/play-invitations/{$invRahul->id}/respond", ['status' => 'accepted'])->assertStatus(200);

        // 5. Member 5 joins - since 4 unique players have accepted and capacity is 5,
        // Member 5 accepting should also be accepted to fill slot #5
        $inv5 = PlayInvitation::create([
            'id' => 'pi_m5',
            'schedule_id' => $sch->id,
            'member_id' => $this->member5->id,
            'status' => 'open',
        ]);
        $res5 = $this->actingAs($this->memberUser)->postJson("/api/play-invitations/{$inv5->id}/respond", ['status' => 'accepted']);
        $res5->assertStatus(200);
        $this->assertEquals('accepted', $inv5->fresh()->status);

        // Verify total accepted count
        $acceptedInvs = PlayInvitation::where('schedule_id', $sch->id)->where('status', 'accepted')->get();
        $this->assertCount(5, $acceptedInvs);
        $this->assertEquals(5, $acceptedInvs->pluck('member_id')->unique()->count());
    }

    public function test_waiting_member_promoted_when_available_slot_exists_under_capacity()
    {
        // Scenario: Capacity 5 players.
        // 4 unique players accepted (Member 1, Member 2, Member 3, Rahul).
        // Member 5 is currently waiting.
        // System promotes Member 5 to fill the 5th available slot.

        $sch = PlaySchedule::create([
            'id' => 's_promote_waiting_test',
            'name' => 'Friday Session',
            'date' => now()->addDays(3)->setTime(18, 0),
            'courts' => 2,
            'players' => 5,
            'slot_hours' => 2.0,
            'slot_duration' => '6:00 PM - 8:00 PM',
            'session_rate' => 10.0,
            'hall_rate' => 0.0,
            'location' => 'Court 1',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'pi_p1',
            'schedule_id' => $sch->id,
            'member_id' => $this->member1->id,
            'status' => 'accepted',
            'accepted_at' => now(),
            'debited' => true,
        ]);
        PlayInvitation::create([
            'id' => 'pi_p2',
            'schedule_id' => $sch->id,
            'member_id' => $this->member2->id,
            'status' => 'accepted',
            'accepted_at' => now(),
            'debited' => true,
        ]);
        PlayInvitation::create([
            'id' => 'pi_p3',
            'schedule_id' => $sch->id,
            'member_id' => $this->member3->id,
            'status' => 'accepted',
            'accepted_at' => now(),
            'debited' => true,
        ]);
        PlayInvitation::create([
            'id' => 'pi_rahul_acc',
            'schedule_id' => $sch->id,
            'member_id' => $this->rahul->id,
            'status' => 'accepted',
            'accepted_at' => now(),
            'debited' => true,
        ]);

        // Member 5 was in waiting
        $waitingInv = PlayInvitation::create([
            'id' => 'pi_p5_waiting',
            'schedule_id' => $sch->id,
            'member_id' => $this->member5->id,
            'status' => 'waiting',
            'accepted_at' => null,
            'debited' => false,
        ]);

        // Call listInvitations (which triggers auto publish/rotation and waiting promotion)
        $res = $this->actingAs($this->memberUser)->getJson('/api/play-invitations');
        $res->assertStatus(200);

        // Member 5 should now be promoted to accepted
        $waitingInv->refresh();
        $this->assertEquals('accepted', $waitingInv->status);
        $this->assertTrue($waitingInv->debited);
        $this->assertNotNull($waitingInv->accepted_at);

        // Total unique accepted members is 5
        $acceptedCount = PlayInvitation::where('schedule_id', $sch->id)
            ->where('status', 'accepted')
            ->distinct('member_id')
            ->count('member_id');
        $this->assertEquals(5, $acceptedCount);
    }

    public function test_declining_accepted_player_promotes_next_waiting_member()
    {
        $sch = PlaySchedule::create([
            'id' => 's_decline_promote_test',
            'name' => 'Friday Session',
            'date' => now()->addDays(3)->setTime(18, 0),
            'courts' => 2,
            'players' => 2,
            'slot_hours' => 2.0,
            'slot_duration' => '6:00 PM - 8:00 PM',
            'session_rate' => 10.0,
            'hall_rate' => 0.0,
            'location' => 'Court 1',
            'status' => 'released',
        ]);

        $inv1 = PlayInvitation::create([
            'id' => 'pi_dec_1',
            'schedule_id' => $sch->id,
            'member_id' => $this->member1->id,
            'status' => 'accepted',
            'accepted_at' => now(),
            'debited' => true,
        ]);
        $inv2 = PlayInvitation::create([
            'id' => 'pi_dec_2',
            'schedule_id' => $sch->id,
            'member_id' => $this->member2->id,
            'status' => 'accepted',
            'accepted_at' => now(),
            'debited' => true,
        ]);
        $invWaiting = PlayInvitation::create([
            'id' => 'pi_dec_wait',
            'schedule_id' => $sch->id,
            'member_id' => $this->rahul->id,
            'status' => 'waiting',
            'accepted_at' => null,
            'debited' => false,
        ]);

        // Member 1 declines
        $res = $this->actingAs($this->memberUser)->postJson("/api/play-invitations/{$inv1->id}/respond", ['status' => 'declined']);
        $res->assertStatus(200);

        $this->assertEquals('open', $inv1->fresh()->status);
        // Rahul should be promoted to accepted
        $this->assertEquals('accepted', $invWaiting->fresh()->status);
        $this->assertTrue($invWaiting->fresh()->debited);
    }
}
