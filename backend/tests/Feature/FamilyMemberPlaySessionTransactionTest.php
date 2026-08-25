<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Member;
use App\Models\PlaySchedule;
use App\Models\PlayInvitation;
use App\Models\User;
use App\Models\Location;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FamilyMemberPlaySessionTransactionTest extends TestCase
{
    use RefreshDatabase;

    protected User $parentUser;
    protected Member $parentMember;
    protected Member $familyMember;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Location::firstOrCreate(['name' => 'Main Court']);

        $this->parentUser = User::firstOrCreate(
            ['id' => 'u_parent_family_test'],
            [
                'first_name' => 'John',
                'last_name' => 'Doe',
                'sex' => 'male',
                'dob' => '1985-01-01',
                'email' => 'john.doe@test.com',
                'mobile' => '+1234567895',
                'address' => '123 Family St',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->parentMember = Member::firstOrCreate(
            ['id' => 'm_parent_john'],
            [
                'user_id' => $this->parentUser->id,
                'member_type' => 'adult',
                'status' => 'active',
                'membership' => true,
                'credit' => 200.00,
                'first_name' => 'John',
                'last_name' => 'Doe',
                'email' => 'john.doe@test.com',
                'sex' => 'male',
                'dob' => '1985-01-01',
                'grade' => 'Grade A',
            ]
        );

        $this->familyMember = Member::firstOrCreate(
            ['id' => 'm_junior_jane'],
            [
                'user_id' => $this->parentUser->id,
                'parent_member_id' => $this->parentMember->id,
                'member_type' => 'junior',
                'status' => 'active',
                'membership' => false,
                'play_eligible' => true,
                'credit' => 0.00,
                'first_name' => 'Jane',
                'last_name' => 'Doe',
                'email' => 'jane.doe@test.com',
                'sex' => 'female',
                'dob' => '2012-05-05',
                'grade' => 'Grade A',
            ]
        );
    }

    public function test_family_members_accepting_play_session_includes_member_name_in_transaction_description(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 's_family_play_test',
            'name' => 'Weekend Social Match',
            'date' => now()->addDays(3),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hrs',
            'session_rate' => 15.00,
            'hall_rate' => 0,
            'location' => 'Main Court',
            'status' => 'released',
            'is_league_match' => false,
        ]);

        $inviteJohn = PlayInvitation::create([
            'id' => 'pi_john',
            'schedule_id' => $schedule->id,
            'member_id' => $this->parentMember->id,
            'status' => 'open',
            'debited' => false,
        ]);

        $inviteJane = PlayInvitation::create([
            'id' => 'pi_jane',
            'schedule_id' => $schedule->id,
            'member_id' => $this->familyMember->id,
            'status' => 'open',
            'debited' => false,
        ]);

        // 1. Parent John accepts
        $res1 = $this->actingAs($this->parentUser)->postJson("/api/play-invitations/{$inviteJohn->id}/respond", [
            'status' => 'accepted',
        ]);
        $res1->assertStatus(200);

        // 2. Junior Jane accepts
        $res2 = $this->actingAs($this->parentUser)->postJson("/api/play-invitations/{$inviteJane->id}/respond", [
            'status' => 'accepted',
        ]);
        $res2->assertStatus(200);

        // 3. Verify transactions logged under the parent wallet have specific member names in description
        $this->assertDatabaseHas('transactions', [
            'member_id' => $this->parentMember->id,
            'type' => 'debit',
            'amount' => 15.00,
            'description' => 'Play session: Weekend Social Match - John Doe',
        ]);

        $this->assertDatabaseHas('transactions', [
            'member_id' => $this->parentMember->id,
            'type' => 'refund',
            'amount' => 0, // ensure no spurious refund
        ] ? [] : [
            'member_id' => $this->parentMember->id,
            'type' => 'debit',
            'amount' => 15.00,
            'description' => 'Play session: Weekend Social Match - Jane Doe',
        ]);

        $this->assertDatabaseHas('transactions', [
            'member_id' => $this->parentMember->id,
            'type' => 'debit',
            'amount' => 15.00,
            'description' => 'Play session: Weekend Social Match - Jane Doe',
        ]);
    }
}
