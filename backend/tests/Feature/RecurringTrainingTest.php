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

    public function test_repeat_for_weeks_validation_rejects_values_greater_than_5()
    {
        // Store validation check
        $resStore = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Training Program',
            'startDate' => '2026-07-20 10:00:00',
            'endDate' => '2026-07-20 11:00:00',
            'repeatWeeks' => 6,
            'repeatMonths' => 1,
            'slots' => 12,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $resStore->assertStatus(422);
        $resStore->assertJsonFragment([
            'message' => 'Repeat for Weeks cannot be greater than 5. Please select a value between 1 and 5.'
        ]);

        // Create valid program first
        $valid = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Training Program',
            'startDate' => '2026-07-20 10:00:00',
            'endDate' => '2026-07-20 11:00:00',
            'repeatWeeks' => 3,
            'repeatMonths' => 1,
            'slots' => 12,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ])->json();

        // Update validation check
        $resUpdate = $this->actingAs($this->admin)->patchJson("/api/trainings/{$valid['id']}", [
            'repeatWeeks' => 6,
        ]);

        $resUpdate->assertStatus(422);
        $resUpdate->assertJsonFragment([
            'message' => 'Repeat for Weeks cannot be greater than 5. Please select a value between 1 and 5.'
        ]);
    }

    public function test_create_recurring_training_month_by_month_logic()
    {
        // Start Date: Jul 20, 2026 (Monday), RFW: 5, RFM: 3
        $response = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Training Program',
            'startDate' => '2026-07-20 10:00:00',
            'endDate' => '2026-07-20 11:00:00',
            'repeatWeeks' => 5,
            'repeatMonths' => 3,
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

        // July (2 sessions): Jul 20, Jul 27
        // August (5 sessions): Aug 3, Aug 10, Aug 17, Aug 24, Aug 31
        // September (4 sessions): Sep 7, Sep 14, Sep 21, Sep 28
        // Total = 11 sessions
        $this->assertCount(11, $trainings);

        $dates = $trainings->map(fn($t) => substr($t['startDate'], 0, 10))->toArray();
        $expectedDates = [
            '2026-07-20', '2026-07-27',
            '2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31',
            '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28',
        ];

        $this->assertEquals($expectedDates, $dates);
    }

    public function test_edit_recurring_training_decreases_and_increases_month_sessions()
    {
        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Junior Training Program',
            'startDate' => '2026-07-20 10:00:00',
            'endDate' => '2026-07-20 11:00:00',
            'repeatWeeks' => 5,
            'repeatMonths' => 3,
            'slots' => 12,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $all = Training::orderBy('start_date', 'asc')->get();
        $parent = $all->first();

        // Decrease RFW from 5 to 3
        $resDecrease = $this->actingAs($this->admin)->patchJson("/api/trainings/{$parent->id}", [
            'repeatWeeks' => 3,
        ]);
        $resDecrease->assertStatus(200);

        $trainingsAfterDecrease = collect($this->actingAs($this->admin)->getJson('/api/trainings')->json())->sortBy('startDate')->values();
        // July: 2 sessions (Jul 20, Jul 27)
        // August: 3 sessions (Aug 3, Aug 10, Aug 17)
        // September: 3 sessions (Sep 7, Sep 14, Sep 21)
        // Total = 8 sessions
        $this->assertCount(8, $trainingsAfterDecrease);

        $expectedAfterDecrease = [
            '2026-07-20', '2026-07-27',
            '2026-08-03', '2026-08-10', '2026-08-17',
            '2026-09-07', '2026-09-14', '2026-09-21',
        ];
        $datesDecrease = $trainingsAfterDecrease->map(fn($t) => substr($t['startDate'], 0, 10))->toArray();
        $this->assertEquals($expectedAfterDecrease, $datesDecrease);

        // Decrease RFM from 3 to 2 (removes September)
        $resRFM = $this->actingAs($this->admin)->patchJson("/api/trainings/{$parent->id}", [
            'repeatMonths' => 2,
        ]);
        $resRFM->assertStatus(200);

        $trainingsAfterRFM = collect($this->actingAs($this->admin)->getJson('/api/trainings')->json())->sortBy('startDate')->values();
        // July: 2 sessions, August: 3 sessions -> Total = 5
        $this->assertCount(5, $trainingsAfterRFM);

        $expectedAfterRFM = [
            '2026-07-20', '2026-07-27',
            '2026-08-03', '2026-08-10', '2026-08-17',
        ];
        $datesRFM = $trainingsAfterRFM->map(fn($t) => substr($t['startDate'], 0, 10))->toArray();
        $this->assertEquals($expectedAfterRFM, $datesRFM);
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
        $julyPrimary = $allBefore[0];

        $deleteRes = $this->actingAs($this->admin)->deleteJson("/api/trainings/{$julyPrimary->id}");
        $deleteRes->assertStatus(200);

        $allAfter = Training::orderBy('start_date', 'asc')->get();

        $this->assertCount(3, $allAfter);
        $this->assertEquals('2026-08-05', substr($allAfter[0]->start_date, 0, 10));
    }

    public function test_edit_parent_training_fee_updates_all_child_sessions_and_fee_per_week()
    {
        Training::query()->delete();

        $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Elite Training Program',
            'startDate' => '2026-07-01 10:00:00',
            'endDate' => '2026-07-01 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 10,
            'duration' => '1 hour',
            'fees' => 120,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);

        $allBefore = Training::orderBy('start_date', 'asc')->get();
        $this->assertCount(4, $allBefore);

        foreach ($allBefore as $sItem) {
            $this->assertEquals(120.00, (float)$sItem->fees);
        }

        $parent = $allBefore->first();

        $updateRes = $this->actingAs($this->admin)->patchJson("/api/trainings/{$parent->id}", [
            'name' => $parent->name,
            'fees' => 200,
        ]);
        $updateRes->assertStatus(200);

        $allAfter = Training::orderBy('start_date', 'asc')->get();
        $this->assertCount(4, $allAfter);

        foreach ($allAfter as $sItem) {
            $this->assertEquals(200.00, (float)$sItem->fees);
        }
    }

    public function test_repeat_for_weeks_preserved_across_all_monthly_trainings()
    {
        Training::query()->delete();

        // Start Date: Jul 15, 2026 (Wednesday), RFW = 4, RFM = 6
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'Monthly Coaching Program',
            'startDate' => '2026-07-15 10:00:00',
            'endDate' => '2026-07-15 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 6,
            'slots' => 12,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);
        $res->assertStatus(201);

        $trainings = collect($this->actingAs($this->admin)->getJson('/api/trainings')->json());

        // Every training returned (parent and child) must have repeatWeeks == 4
        $this->assertGreaterThan(0, $trainings->count());
        foreach ($trainings as $tItem) {
            $this->assertEquals(4, $tItem['repeatWeeks'], "Training {$tItem['id']} start_date {$tItem['startDate']} should have repeatWeeks = 4");
        }
    }

    public function test_per_session_fee_uses_repeat_weeks_denominator_when_month_has_fewer_sessions()
    {
        Training::query()->delete();

        // Start Date: Jul 15, 2026 (Wednesday), RFW = 4, RFM = 1, Monthly Fee = $100
        // July contains 3 Wednesdays (Jul 15, Jul 22, Jul 29)
        $res = $this->actingAs($this->admin)->postJson('/api/trainings', [
            'name' => 'July Mid-Month Training',
            'startDate' => '2026-07-15 10:00:00',
            'endDate' => '2026-07-15 11:00:00',
            'repeatWeeks' => 4,
            'repeatMonths' => 1,
            'slots' => 12,
            'duration' => '1 hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'targetType' => 'junior',
        ]);
        $res->assertStatus(201);

        $allCreated = Training::orderBy('start_date', 'asc')->get();
        $this->assertCount(3, $allCreated);

        \App\Models\Grade::firstOrCreate(['name' => 'Grade 5']);

        $member = \App\Models\Member::firstOrCreate(
            ['id' => 'm_rfw_fee_test'],
            [
                'first_name' => 'Junior',
                'last_name' => 'Player',
                'sex' => 'female',
                'dob' => '2012-05-05',
                'email' => 'junior_rfw@test.com',
                'mobile' => '+1234567891',
                'address' => 'Member Address',
                'credit' => 500.00,
                'status' => 'active',
                'member_type' => 'junior',
                'grade' => 'Grade 5',
                'user_id' => $this->admin->id,
            ]
        );

        $firstSession = $allCreated->first();
        // Force accept 1 session: Per session fee should be $100 / 4 (RFW) = $25.00, NOT $100 / 3 ($33.33)
        $acceptRes = $this->actingAs($this->admin)->postJson("/api/trainings/{$firstSession->id}/update-member-invitation", [
            'memberId' => $member->id,
            'sessionIds' => [$firstSession->id],
            'forceAccept' => true,
        ]);
        $acceptRes->assertStatus(200);

        $member->refresh();
        // Started with $500.00 credit, deducted $25.00 -> remaining $475.00
        $this->assertEquals(475.00, (float)$member->credit);
    }
}

