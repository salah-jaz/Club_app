<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Location;
use App\Models\Member;
use App\Models\PlaySchedule;
use App\Models\Rotation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class CourtRotationConfirmationTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $memberUser;
    protected Member $dyna;
    protected Member $bob;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Location::firstOrCreate(['name' => 'Main Court']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_rot_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1985-01-01',
                'email' => 'admin_rot@test.com',
                'mobile' => '+1111111111',
                'address' => 'Admin Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $this->memberUser = User::firstOrCreate(
            ['id' => 'u_member_rot_test'],
            [
                'first_name' => 'Member',
                'last_name' => 'User',
                'sex' => 'female',
                'dob' => '1990-01-01',
                'email' => 'member_rot@test.com',
                'mobile' => '+2222222222',
                'address' => 'Member Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $bobUser = User::firstOrCreate(
            ['id' => 'u_bob_user_test'],
            [
                'first_name' => 'Bob',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1988-01-01',
                'email' => 'bob_user@test.com',
                'mobile' => '+3333333333',
                'address' => 'Bob Address',
                'password' => bcrypt('password'),
                'role' => 'member',
                'status' => 'active',
            ]
        );

        $this->dyna = Member::create([
            'id' => 'm_dyna_test',
            'user_id' => $this->memberUser->id,
            'first_name' => 'Dyna',
            'last_name' => 'Francis',
            'sex' => 'female',
            'dob' => '1990-01-01',
            'email' => 'dyna@example.com',
            'member_type' => 'adult',
            'membership' => true,
            'credit' => 100,
            'grade' => 'Grade A',
            'status' => 'active',
        ]);

        $this->bob = Member::create([
            'id' => 'm_bob_test',
            'user_id' => $bobUser->id,
            'first_name' => 'Bob',
            'last_name' => 'Smith',
            'sex' => 'male',
            'dob' => '1988-01-01',
            'email' => 'bob@example.com',
            'member_type' => 'adult',
            'membership' => true,
            'credit' => 100,
            'grade' => 'Grade A',
            'status' => 'active',
        ]);
    }

    public function test_admin_can_save_confirmed_rotation_changes_in_rotated_and_published_status(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 's_rot_' . Str::random(6),
            'name' => 'Social Play Evening',
            'date' => now()->addDays(2)->format('Y-m-d H:i:s'),
            'courts' => 1,
            'players' => 4,
            'slot_hours' => 2,
            'slot_duration' => '2 hrs',
            'session_rate' => 15,
            'hall_rate' => 0,
            'location' => 'Main Court',
            'status' => 'rotated',
            'is_league_match' => false,
        ]);

        $initialRounds = [
            [
                'round' => 1,
                'courts' => [
                    ['courtNo' => 1, 'players' => [$this->dyna->id]],
                ],
                'resting' => [$this->bob->id],
            ],
            [
                'round' => 2,
                'courts' => [
                    ['courtNo' => 1, 'players' => [$this->dyna->id]],
                ],
                'resting' => [$this->bob->id],
            ],
            [
                'round' => 3,
                'courts' => [
                    ['courtNo' => 1, 'players' => [$this->bob->id]],
                ],
                'resting' => [$this->dyna->id],
            ],
            [
                'round' => 4,
                'courts' => [
                    ['courtNo' => 1, 'players' => [$this->dyna->id]],
                ],
                'resting' => [$this->bob->id],
            ],
            [
                'round' => 5,
                'courts' => [
                    ['courtNo' => 1, 'players' => [$this->dyna->id]],
                ],
                'resting' => [$this->bob->id],
            ],
        ];

        Rotation::create([
            'id' => 'r_' . Str::random(6),
            'schedule_id' => $schedule->id,
            'rounds' => $initialRounds,
            'show_member_grades' => false,
        ]);

        // Admin confirms adding Dyna to Round 3 as well (on court with Bob)
        $updatedRounds = $initialRounds;
        $updatedRounds[2]['courts'][0]['players'] = [$this->bob->id, $this->dyna->id];
        $updatedRounds[2]['resting'] = [];

        $response = $this->actingAs($this->admin)->patchJson("/api/schedules/{$schedule->id}/rotation", [
            'rounds' => $updatedRounds,
        ]);

        $response->assertStatus(200);
        $response->assertJsonPath('message', 'Court rotation updated.');

        $rotationInDb = Rotation::where('schedule_id', $schedule->id)->first();
        $this->assertCount(2, $rotationInDb->rounds[2]['courts'][0]['players']);
        $this->assertContains($this->dyna->id, $rotationInDb->rounds[2]['courts'][0]['players']);
        $this->assertEmpty($rotationInDb->rounds[2]['resting']);

        // Now publish the schedule and verify editing is also permitted and updates published court details
        $schedule->update(['status' => 'published']);

        // Move Bob to resting in Round 3
        $updatedRounds[2]['courts'][0]['players'] = [$this->dyna->id];
        $updatedRounds[2]['resting'] = [$this->bob->id];

        $pubResponse = $this->actingAs($this->admin)->patchJson("/api/schedules/{$schedule->id}/rotation", [
            'rounds' => $updatedRounds,
        ]);

        $pubResponse->assertStatus(200);
        $rotationInDb->refresh();
        $this->assertEquals([$this->dyna->id], $rotationInDb->rounds[2]['courts'][0]['players']);
        $this->assertEquals([$this->bob->id], $rotationInDb->rounds[2]['resting']);
    }

    public function test_non_admin_cannot_update_rotation(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 's_rot_denied',
            'name' => 'Play Denied Test',
            'date' => now()->addDays(2)->format('Y-m-d H:i:s'),
            'courts' => 1,
            'players' => 4,
            'slot_hours' => 2,
            'slot_duration' => '2 hrs',
            'session_rate' => 15,
            'hall_rate' => 0,
            'location' => 'Main Court',
            'status' => 'rotated',
            'is_league_match' => false,
        ]);

        $response = $this->actingAs($this->memberUser)->patchJson("/api/schedules/{$schedule->id}/rotation", [
            'rounds' => [],
        ]);

        $response->assertStatus(403);
    }
}
