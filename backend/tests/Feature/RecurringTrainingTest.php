<?php

namespace Tests\Feature;

use App\Models\Training;
use App\Models\User;
use App\Models\Location;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class RecurringTrainingTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        Training::query()->delete();

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_test'],
            [
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
            ]
        );
    }

    public function test_create_recurring_training_stores_parent_and_child_sessions()
    {
        $response = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Training Program',
            'startDate' => '2026-07-25 10:00:00',
            'endDate' => '2026-07-25 11:00:00',
            'repeatWeeks' => 5,
            'repeatMonths' => 1,
            'slots' => 12,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $response->assertStatus(201);

        $trainingsResponse = $this->actingAs($this->admin)->getJson('/api/trainings');
        $trainings = collect($trainingsResponse->json())->sortBy('startDate')->values();

        $this->assertCount(5, $trainings);
        $this->assertEquals(5, $trainings[0]['repeatWeeks']); // Jul 25
        $this->assertEquals(4, $trainings[1]['repeatWeeks']); // Aug 1
        $this->assertEquals(3, $trainings[2]['repeatWeeks']); // Aug 8
        $this->assertEquals(2, $trainings[3]['repeatWeeks']); // Aug 15
        $this->assertEquals(1, $trainings[4]['repeatWeeks']); // Aug 22

        // First session is parent, remaining sessions have parentId pointing to first session
        $parentId = $trainings[0]['id'];
        $this->assertEquals($parentId, $trainings[0]['parentId']);
        for ($i = 1; $i < 5; $i++) {
            $this->assertEquals($parentId, $trainings[$i]['parentId']);
        }
    }

    public function test_edit_parent_session_decreases_and_increases_repeat_count()
    {
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Training Program',
            'startDate' => '2026-07-25 10:00:00',
            'endDate' => '2026-07-25 11:00:00',
            'repeatWeeks' => 5,
            'repeatMonths' => 1,
            'slots' => 12,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $all = Training::orderBy('start_date', 'asc')->get();
        $parent = $all->first();

        // Decrease: Edit parent (Jul 25) repeatWeeks to 3
        $res = $this->actingAs($this->admin)->patchJson("/api/trainings/{$parent->id}", [
            'name' => $parent->name,
            'repeatWeeks' => 3,
        ]);
        $res->assertStatus(200);

        $trainings = collect($this->actingAs($this->admin)->getJson('/api/trainings')->json())->sortBy('startDate')->values();
        $this->assertCount(3, $trainings);
        $this->assertEquals(3, $trainings[0]['repeatWeeks']);
        $this->assertEquals(2, $trainings[1]['repeatWeeks']);
        $this->assertEquals(1, $trainings[2]['repeatWeeks']);

        // Increase: Edit parent (Jul 25) repeatWeeks from 3 to 5
        $resIncrease = $this->actingAs($this->admin)->patchJson("/api/trainings/{$parent->id}", [
            'name' => $parent->name,
            'repeatWeeks' => 5,
        ]);
        $resIncrease->assertStatus(200);

        $trainingsAfterIncrease = collect($this->actingAs($this->admin)->getJson('/api/trainings')->json())->sortBy('startDate')->values();
        $this->assertCount(5, $trainingsAfterIncrease);
        $this->assertEquals(5, $trainingsAfterIncrease[0]['repeatWeeks']);
        $this->assertEquals(4, $trainingsAfterIncrease[1]['repeatWeeks']);
        $this->assertEquals(3, $trainingsAfterIncrease[2]['repeatWeeks']);
        $this->assertEquals(2, $trainingsAfterIncrease[3]['repeatWeeks']);
        $this->assertEquals(1, $trainingsAfterIncrease[4]['repeatWeeks']);
    }

    public function test_edit_child_session_updates_repeat_count_and_removes_or_creates_tail_sessions()
    {
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Training Program',
            'startDate' => '2026-07-25 10:00:00',
            'endDate' => '2026-07-25 11:00:00',
            'repeatWeeks' => 5,
            'repeatMonths' => 1,
            'slots' => 12,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $all = Training::orderBy('start_date', 'asc')->get();
        $child = $all[1]; // Aug 1 (current repeatWeeks = 4)

        // Case A: Change Aug 1 from 4 -> 3 (removes Aug 22)
        $resA = $this->actingAs($this->admin)->patchJson("/api/trainings/{$child->id}", [
            'name' => $child->name,
            'repeatWeeks' => 3,
        ]);
        $resA->assertStatus(200);

        $trainingsA = collect($this->actingAs($this->admin)->getJson('/api/trainings')->json())->sortBy('startDate')->values();
        $this->assertCount(4, $trainingsA);
        $this->assertEquals(4, $trainingsA[0]['repeatWeeks']);
        $this->assertEquals(3, $trainingsA[1]['repeatWeeks']);
        $this->assertEquals(2, $trainingsA[2]['repeatWeeks']);
        $this->assertEquals(1, $trainingsA[3]['repeatWeeks']);

        // Case B: Change Aug 1 from 3 -> 5 (adds Aug 22, Aug 29)
        $resB = $this->actingAs($this->admin)->patchJson("/api/trainings/{$child->id}", [
            'name' => $child->name,
            'repeatWeeks' => 5,
        ]);
        $resB->assertStatus(200);

        $trainingsB = collect($this->actingAs($this->admin)->getJson('/api/trainings')->json())->sortBy('startDate')->values();
        $this->assertCount(6, $trainingsB);
        $this->assertEquals(6, $trainingsB[0]['repeatWeeks']);
        $this->assertEquals(5, $trainingsB[1]['repeatWeeks']);
        $this->assertEquals(4, $trainingsB[2]['repeatWeeks']);
        $this->assertEquals(3, $trainingsB[3]['repeatWeeks']);
        $this->assertEquals(2, $trainingsB[4]['repeatWeeks']);
        $this->assertEquals(1, $trainingsB[5]['repeatWeeks']);
    }

    public function test_edit_child_session_multi_month_recalculates_repeat_weeks()
    {
        Training::query()->delete();

        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Training Program',
            'startDate' => '2026-07-01 10:00:00',
            'endDate' => '2026-07-01 11:00:00',
            'repeatWeeks' => 2,
            'repeatMonths' => 2,
            'slots' => 12,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $all = Training::orderBy('start_date', 'asc')->get();
        $this->assertCount(4, $all);

        // Sessions: Jul 1 (0), Jul 8 (1), Aug 1 (2), Aug 8 (3)
        $jul8 = $all[1];

        // Edit Jul 8 (currently RFW = 1): change RFW to 2
        $res = $this->actingAs($this->admin)->patchJson("/api/trainings/{$jul8->id}", [
            'name' => $jul8->name,
            'repeatWeeks' => 2,
        ]);
        $res->assertStatus(200);

        $trainings = collect($this->actingAs($this->admin)->getJson('/api/trainings')->json())->sortBy('startDate')->values();

        // Should now have 6 sessions total (3 in Month 1, 3 in Month 2)
        $this->assertCount(6, $trainings);

        // Month 1
        $this->assertEquals('2026-07-01', substr($trainings[0]['startDate'], 0, 10));
        $this->assertEquals(3, $trainings[0]['repeatWeeks']);

        $this->assertEquals('2026-07-08', substr($trainings[1]['startDate'], 0, 10));
        $this->assertEquals(2, $trainings[1]['repeatWeeks']);

        $this->assertEquals('2026-07-15', substr($trainings[2]['startDate'], 0, 10));
        $this->assertEquals(1, $trainings[2]['repeatWeeks']);

        // Month 2
        $this->assertEquals('2026-08-01', substr($trainings[3]['startDate'], 0, 10));
        $this->assertEquals(3, $trainings[3]['repeatWeeks']);

        $this->assertEquals('2026-08-08', substr($trainings[4]['startDate'], 0, 10));
        $this->assertEquals(2, $trainings[4]['repeatWeeks']);

        $this->assertEquals('2026-08-15', substr($trainings[5]['startDate'], 0, 10));
        $this->assertEquals(1, $trainings[5]['repeatWeeks']);

        // Now edit Jul 8 (currently RFW = 2): change RFW to 1 (should remove Jul 15 and Aug 15)
        $resReduce = $this->actingAs($this->admin)->patchJson("/api/trainings/{$jul8->id}", [
            'name' => $jul8->name,
            'repeatWeeks' => 1,
        ]);
        $resReduce->assertStatus(200);

        $trainingsReduced = collect($this->actingAs($this->admin)->getJson('/api/trainings')->json())->sortBy('startDate')->values();

        // Should now have 4 sessions total (2 in Month 1, 2 in Month 2)
        $this->assertCount(4, $trainingsReduced);

        // Month 1
        $this->assertEquals('2026-07-01', substr($trainingsReduced[0]['startDate'], 0, 10));
        $this->assertEquals(2, $trainingsReduced[0]['repeatWeeks']);

        $this->assertEquals('2026-07-08', substr($trainingsReduced[1]['startDate'], 0, 10));
        $this->assertEquals(1, $trainingsReduced[1]['repeatWeeks']);

        // Month 2
        $this->assertEquals('2026-08-01', substr($trainingsReduced[2]['startDate'], 0, 10));
        $this->assertEquals(2, $trainingsReduced[2]['repeatWeeks']);

        $this->assertEquals('2026-08-08', substr($trainingsReduced[3]['startDate'], 0, 10));
        $this->assertEquals(1, $trainingsReduced[3]['repeatWeeks']);
    }

    public function test_delete_monthly_training_program_removes_monthly_sessions_and_keeps_other_months()
    {
        Training::query()->delete();

        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Training Program',
            'startDate' => '2026-07-01 10:00:00',
            'endDate' => '2026-07-01 11:00:00',
            'repeatWeeks' => 3,
            'repeatMonths' => 2,
            'slots' => 12,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $allBefore = Training::orderBy('start_date', 'asc')->get();
        $this->assertCount(6, $allBefore);

        $julyPrimary = $allBefore[0];

        $deleteRes = $this->actingAs($this->admin)->deleteJson("/api/trainings/{$julyPrimary->id}");
        $deleteRes->assertStatus(200);

        $allAfter = Training::orderBy('start_date', 'asc')->get();

        $this->assertCount(3, $allAfter);
        $this->assertEquals('2026-08-01', substr($allAfter[0]->start_date, 0, 10));
        $this->assertEquals('2026-08-08', substr($allAfter[1]->start_date, 0, 10));
        $this->assertEquals('2026-08-15', substr($allAfter[2]->start_date, 0, 10));
    }
}
