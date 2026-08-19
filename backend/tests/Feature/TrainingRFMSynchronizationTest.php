<?php

namespace Tests\Feature;

use App\Models\Training;
use App\Models\User;
use App\Models\Location;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class TrainingRFMSynchronizationTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Court 1']);
        Training::query()->delete();

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_rfm_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_rfm@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );
    }

    public function test_rfm_synchronization_initial_parent_creation_and_child_calculation()
    {
        // Initial Parent Training: Jul 26, 2026 -> RFM = 3 (1 session per month)
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Sunday Training',
            'startDate' => '2026-07-26 10:00:00',
            'endDate' => '2026-07-26 11:00:00',
            'repeatWeeks' => 1,
            'repeatMonths' => 3,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Court 1',
            'targetType' => 'junior',
        ]);

        $res->assertStatus(201);

        $trainingsRes = $this->actingAs($this->admin)->getJson('/api/trainings');
        $trainings = collect($trainingsRes->json())->sortBy('startDate')->values();

        // 3 monthly sessions: Jul 26 (RFM 3), Aug 2 (RFM 2), Sep 6 (RFM 1)
        $this->assertCount(3, $trainings);
        $this->assertEquals(3, $trainings[0]['repeatMonths']); // Jul 26
        $this->assertEquals(2, $trainings[1]['repeatMonths']); // Aug 2
        $this->assertEquals(1, $trainings[2]['repeatMonths']); // Sep 6
    }

    public function test_rfm_synchronization_parent_edit_logic()
    {
        // Initial: Jul 26, 2026 -> RFM = 3
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Sunday Training',
            'startDate' => '2026-07-26 10:00:00',
            'endDate' => '2026-07-26 11:00:00',
            'repeatWeeks' => 1,
            'repeatMonths' => 3,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Court 1',
            'targetType' => 'junior',
        ]);

        $parent = Training::orderBy('start_date', 'asc')->first();

        // Admin edits Parent: RFM changes from 3 to 4
        $updateRes = $this->actingAs($this->admin)->patchJson("/api/trainings/{$parent->id}", [
            'repeatMonths' => 4,
        ]);
        $updateRes->assertStatus(200);

        $trainingsRes = $this->actingAs($this->admin)->getJson('/api/trainings');
        $trainings = collect($trainingsRes->json())->sortBy('startDate')->values();

        // 4 monthly sessions: Jul 26 (RFM 4), Aug 2 (RFM 3), Sep 6 (RFM 2), Oct 4 (RFM 1)
        $this->assertCount(4, $trainings);
        $this->assertEquals('2026-07-26', substr($trainings[0]['startDate'], 0, 10));
        $this->assertEquals(4, $trainings[0]['repeatMonths']);

        $this->assertEquals('2026-08-02', substr($trainings[1]['startDate'], 0, 10));
        $this->assertEquals(3, $trainings[1]['repeatMonths']);

        $this->assertEquals('2026-09-06', substr($trainings[2]['startDate'], 0, 10));
        $this->assertEquals(2, $trainings[2]['repeatMonths']);

        $this->assertEquals('2026-10-04', substr($trainings[3]['startDate'], 0, 10));
        $this->assertEquals(1, $trainings[3]['repeatMonths']);
    }

    public function test_rfm_synchronization_child_edit_logic_increase()
    {
        // Setup series: Jul 26 (4), Aug 2 (3), Sep 6 (2), Oct 4 (1)
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Sunday Training',
            'startDate' => '2026-07-26 10:00:00',
            'endDate' => '2026-07-26 11:00:00',
            'repeatWeeks' => 1,
            'repeatMonths' => 4,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Court 1',
            'targetType' => 'junior',
        ]);

        $series = Training::orderBy('start_date', 'asc')->get();
        $aug2Child = $series[1]; // Aug 2, 2026 (Month 2)

        // Admin edits Aug 2, 2026: RFM changes from 3 to 5
        $updateRes = $this->actingAs($this->admin)->patchJson("/api/trainings/{$aug2Child->id}", [
            'repeatMonths' => 5,
        ]);
        $updateRes->assertStatus(200);

        $trainingsRes = $this->actingAs($this->admin)->getJson('/api/trainings');
        $trainings = collect($trainingsRes->json())->sortBy('startDate')->values();

        // Total 6 months:
        // Jul 26 -> RFM 6
        // Aug 2  -> RFM 5
        // Sep 6  -> RFM 4
        // Oct 4  -> RFM 3
        // Nov 1  -> RFM 2
        // Dec 6  -> RFM 1
        $this->assertCount(6, $trainings);
        $this->assertEquals('2026-07-26', substr($trainings[0]['startDate'], 0, 10));
        $this->assertEquals(6, $trainings[0]['repeatMonths']);

        $this->assertEquals('2026-08-02', substr($trainings[1]['startDate'], 0, 10));
        $this->assertEquals(5, $trainings[1]['repeatMonths']);

        $this->assertEquals('2026-09-06', substr($trainings[2]['startDate'], 0, 10));
        $this->assertEquals(4, $trainings[2]['repeatMonths']);

        $this->assertEquals('2026-10-04', substr($trainings[3]['startDate'], 0, 10));
        $this->assertEquals(3, $trainings[3]['repeatMonths']);

        $this->assertEquals('2026-11-01', substr($trainings[4]['startDate'], 0, 10));
        $this->assertEquals(2, $trainings[4]['repeatMonths']);

        $this->assertEquals('2026-12-06', substr($trainings[5]['startDate'], 0, 10));
        $this->assertEquals(1, $trainings[5]['repeatMonths']);
    }

    public function test_rfm_synchronization_child_edit_logic_decrease()
    {
        // Setup series: 6 months
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Sunday Training',
            'startDate' => '2026-07-26 10:00:00',
            'endDate' => '2026-07-26 11:00:00',
            'repeatWeeks' => 1,
            'repeatMonths' => 6,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Court 1',
            'targetType' => 'junior',
        ]);

        $series = Training::orderBy('start_date', 'asc')->get();
        $sep6Child = $series[2]; // Sep 6, 2026 (Month 3, current RFM = 4)

        // Admin edits Sep 6, 2026: RFM changes from 4 to 2
        $updateRes = $this->actingAs($this->admin)->patchJson("/api/trainings/{$sep6Child->id}", [
            'repeatMonths' => 2,
        ]);
        $updateRes->assertStatus(200);

        $trainingsRes = $this->actingAs($this->admin)->getJson('/api/trainings');
        $trainings = collect($trainingsRes->json())->sortBy('startDate')->values();

        // New total months = 2 + 2 = 4:
        // Jul 26 -> RFM 4
        // Aug 2  -> RFM 3
        // Sep 6  -> RFM 2
        // Oct 4  -> RFM 1
        $this->assertCount(4, $trainings);
        $this->assertEquals('2026-07-26', substr($trainings[0]['startDate'], 0, 10));
        $this->assertEquals(4, $trainings[0]['repeatMonths']);

        $this->assertEquals('2026-08-02', substr($trainings[1]['startDate'], 0, 10));
        $this->assertEquals(3, $trainings[1]['repeatMonths']);

        $this->assertEquals('2026-09-06', substr($trainings[2]['startDate'], 0, 10));
        $this->assertEquals(2, $trainings[2]['repeatMonths']);

        $this->assertEquals('2026-10-04', substr($trainings[3]['startDate'], 0, 10));
        $this->assertEquals(1, $trainings[3]['repeatMonths']);
    }
}
