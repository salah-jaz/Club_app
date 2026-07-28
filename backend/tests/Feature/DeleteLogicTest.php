<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Location;
use App\Models\Member;
use App\Models\PlayInvitation;
use App\Models\PlaySchedule;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class DeleteLogicTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;
    protected Member $member;
    protected Location $location;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        $this->location = Location::firstOrCreate(['name' => 'Court A']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_del_logic_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'Tester',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_del_logic@test.com',
                'mobile' => '+1234567891',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $memberUser = User::create([
            'id' => 'u_member_del_logic_test',
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'sex' => 'female',
            'dob' => '1995-05-05',
            'email' => 'jane_del_logic@test.com',
            'mobile' => '+1234567892',
            'address' => 'Member Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->member = Member::create([
            'id' => 'm_del_logic_test',
            'user_id' => $memberUser->id,
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'dob' => '1995-05-05',
            'email' => 'jane_del_logic@test.com',
            'sex' => 'female',
            'member_type' => 'adult',
            'membership' => true,
            'training_eligible' => true,
            'play_eligible' => true,
            'skip_credit_consumption' => false,
            'apply_discount' => false,
            'grade' => 'Grade A',
            'bi_member_id' => 'BI-999',
            'status' => 'active',
            'credit' => 200.0,
        ]);
    }

    public function test_play_schedule_deletion_with_and_without_accepted_invitations()
    {
        // 1. Play schedule released, 0 accepted -> delete allowed
        $sch1 = PlaySchedule::create([
            'id' => 'sch_del_1_' . \Illuminate\Support\Str::random(4),
            'name' => 'Test Play Schedule 1',
            'date' => now()->addDays(2),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10.0,
            'hall_rate' => 50.0,
            'location' => $this->location->name,
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'pi_open_1_' . \Illuminate\Support\Str::random(4),
            'schedule_id' => $sch1->id,
            'member_id' => $this->member->id,
            'status' => 'open',
        ]);

        $delRes1 = $this->actingAs($this->admin)->deleteJson("/api/schedules/{$sch1->id}");
        $delRes1->assertOk();

        // 2. Play schedule released, 1 accepted -> delete forbidden (422)
        $sch2 = PlaySchedule::create([
            'id' => 'sch_del_2_' . \Illuminate\Support\Str::random(4),
            'name' => 'Test Play Schedule 2',
            'date' => now()->addDays(3),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10.0,
            'hall_rate' => 50.0,
            'location' => $this->location->name,
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'pi_acc_2_' . \Illuminate\Support\Str::random(4),
            'schedule_id' => $sch2->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
        ]);

        $delRes2 = $this->actingAs($this->admin)->deleteJson("/api/schedules/{$sch2->id}");
        $delRes2->assertStatus(422);

        // 3. Play schedule cancelled after accepted -> delete allowed
        $cancelRes = $this->actingAs($this->admin)->postJson("/api/schedules/{$sch2->id}/cancel", [
            'reason' => 'Rain out',
        ]);
        $cancelRes->assertOk();

        $delRes3 = $this->actingAs($this->admin)->deleteJson("/api/schedules/{$sch2->id}");
        $delRes3->assertOk();
    }

    public function test_training_program_deletion_with_and_without_accepted_invitations()
    {
        // 1. Training released, 0 accepted -> delete allowed
        $tr1 = Training::create([
            'id' => 'tr_del_1_' . \Illuminate\Support\Str::random(4),
            'name' => 'Test Training Program 1',
            'start_date' => now()->addDays(5),
            'end_date' => now()->addDays(5)->addHours(2),
            'sessions' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 30.0,
            'coach' => 'Coach Lee',
            'location' => $this->location->name,
            'status' => 'released',
        ]);

        TrainingInvitation::create([
            'id' => 'ti_open_1_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr1->id,
            'member_id' => $this->member->id,
            'status' => 'open',
        ]);

        $delRes1 = $this->actingAs($this->admin)->deleteJson("/api/trainings/{$tr1->id}");
        $delRes1->assertOk();

        // 2. Training released, 1 accepted -> delete forbidden (422)
        $tr2 = Training::create([
            'id' => 'tr_del_2_' . \Illuminate\Support\Str::random(4),
            'name' => 'Test Training Program 2',
            'start_date' => now()->addDays(6),
            'end_date' => now()->addDays(6)->addHours(2),
            'sessions' => 1,
            'slots' => 10,
            'duration' => '2 Hours',
            'fees' => 30.0,
            'coach' => 'Coach Lee',
            'location' => $this->location->name,
            'status' => 'released',
        ]);

        TrainingInvitation::create([
            'id' => 'ti_acc_2_' . \Illuminate\Support\Str::random(4),
            'training_id' => $tr2->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
        ]);

        $delRes2 = $this->actingAs($this->admin)->deleteJson("/api/trainings/{$tr2->id}");
        $delRes2->assertStatus(422);

        // 3. Training cancelled after accepted -> delete allowed
        $cancelRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr2->id}/cancel", [
            'reason' => 'Coach emergency',
        ]);
        $cancelRes->assertOk();

        $delRes3 = $this->actingAs($this->admin)->deleteJson("/api/trainings/{$tr2->id}");
        $delRes3->assertOk();
    }
}
