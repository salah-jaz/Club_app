<?php

namespace Tests\Feature;

use App\Models\PlaySchedule;
use App\Models\User;
use App\Models\Location;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RecurringPlayScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Location::create(['name' => 'Main Hall']);

        $this->admin = User::create([
            'id' => 'u_admin_test',
            'first_name' => 'Admin',
            'last_name' => 'User',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'admin@test.com',
            'mobile' => '+1234567890',
            'address' => 'Test Address',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'status' => 'active',
        ]);
    }

    public function test_create_recurring_schedule_stores_and_formats_correct_repeat_weeks()
    {
        $response = $this->actingAs($this->admin)->postJson('/api/schedules', [
            'name' => 'Saturday Session',
            'date' => '2026-07-25 19:00:00',
            'courts' => 2,
            'players' => 16,
            'slotHours' => 2,
            'slotDuration' => '15 min',
            'sessionRate' => 8,
            'hallRate' => 40,
            'location' => 'Main Hall',
            'repeatWeeks' => 5,
        ]);

        $response->assertStatus(201);

        $schedulesResponse = $this->actingAs($this->admin)->getJson('/api/schedules');
        $schedules = collect($schedulesResponse->json())->sortBy('date')->values();

        $this->assertCount(5, $schedules);
        $this->assertEquals(5, $schedules[0]['repeatWeeks']); // Jul 25
        $this->assertEquals(4, $schedules[1]['repeatWeeks']); // Aug 1
        $this->assertEquals(3, $schedules[2]['repeatWeeks']); // Aug 8
        $this->assertEquals(2, $schedules[3]['repeatWeeks']); // Aug 15
        $this->assertEquals(1, $schedules[4]['repeatWeeks']); // Aug 22
    }

    public function test_edit_parent_session_decreases_repeat_count()
    {
        $this->actingAs($this->admin)->postJson('/api/schedules', [
            'name' => 'Saturday Session',
            'date' => '2026-07-25 19:00:00',
            'courts' => 2,
            'players' => 16,
            'slotHours' => 2,
            'slotDuration' => '15 min',
            'sessionRate' => 8,
            'hallRate' => 40,
            'location' => 'Main Hall',
            'repeatWeeks' => 5,
        ]);

        $all = PlaySchedule::orderBy('date', 'asc')->get();
        $parent = $all->first();

        // Edit parent (Jul 25) repeatWeeks to 3
        $res = $this->actingAs($this->admin)->patchJson("/api/schedules/{$parent->id}", [
            'name' => $parent->name,
            'repeatWeeks' => 3,
        ]);
        $res->assertStatus(200);

        $schedulesResponse = $this->actingAs($this->admin)->getJson('/api/schedules');
        $schedules = collect($schedulesResponse->json())->sortBy('date')->values();

        $this->assertCount(3, $schedules);
        $this->assertEquals(3, $schedules[0]['repeatWeeks']);
        $this->assertEquals(2, $schedules[1]['repeatWeeks']);
        $this->assertEquals(1, $schedules[2]['repeatWeeks']);
    }

    public function test_edit_child_session_case_a_and_case_b()
    {
        $this->actingAs($this->admin)->postJson('/api/schedules', [
            'name' => 'Saturday Session',
            'date' => '2026-07-25 19:00:00',
            'courts' => 2,
            'players' => 16,
            'slotHours' => 2,
            'slotDuration' => '15 min',
            'sessionRate' => 8,
            'hallRate' => 40,
            'location' => 'Main Hall',
            'repeatWeeks' => 5,
        ]);

        $all = PlaySchedule::orderBy('date', 'asc')->get();
        $child = $all[1]; // Aug 1 (current repeatWeeks = 4)

        // Case A: Change from 4 -> 3
        $resA = $this->actingAs($this->admin)->patchJson("/api/schedules/{$child->id}", [
            'name' => $child->name,
            'repeatWeeks' => 3,
        ]);
        $resA->assertStatus(200);

        $schedulesA = collect($this->actingAs($this->admin)->getJson('/api/schedules')->json())->sortBy('date')->values();
        $this->assertCount(4, $schedulesA); // Aug 22 removed
        $this->assertEquals(4, $schedulesA[0]['repeatWeeks']);
        $this->assertEquals(3, $schedulesA[1]['repeatWeeks']);
        $this->assertEquals(2, $schedulesA[2]['repeatWeeks']);
        $this->assertEquals(1, $schedulesA[3]['repeatWeeks']);

        // Case B: Change from 3 -> 5
        $resB = $this->actingAs($this->admin)->patchJson("/api/schedules/{$child->id}", [
            'name' => $child->name,
            'repeatWeeks' => 5,
        ]);
        $resB->assertStatus(200);

        $schedulesB = collect($this->actingAs($this->admin)->getJson('/api/schedules')->json())->sortBy('date')->values();
        $this->assertCount(6, $schedulesB); // Aug 22 and Aug 29 added
        $this->assertEquals(6, $schedulesB[0]['repeatWeeks']);
        $this->assertEquals(5, $schedulesB[1]['repeatWeeks']);
        $this->assertEquals(4, $schedulesB[2]['repeatWeeks']);
        $this->assertEquals(3, $schedulesB[3]['repeatWeeks']);
        $this->assertEquals(2, $schedulesB[4]['repeatWeeks']);
        $this->assertEquals(1, $schedulesB[5]['repeatWeeks']);
    }
}
