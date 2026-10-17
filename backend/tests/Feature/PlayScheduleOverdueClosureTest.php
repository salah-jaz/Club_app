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
use App\Helpers\SessionTimingHelper;
use App\Http\Controllers\Api\PlayScheduleController;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PlayScheduleOverdueClosureTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $memberUser;
    protected Member $member;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Location::firstOrCreate(['name' => 'Court 1']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_overdue_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1985-01-01',
                'email' => 'admin_overdue@test.com',
                'mobile' => '+1111111111',
                'address' => 'Admin Address',
                'postal_code' => '12345',
                'emergency_name' => 'Emerg',
                'emergency_phone' => '+1111111112',
                'role' => 'admin',
                'status' => 'approved',
                'password' => bcrypt('secret'),
            ]
        );

        $this->memberUser = User::firstOrCreate(
            ['id' => 'u_member_overdue_test'],
            [
                'first_name' => 'Member',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'member_overdue@test.com',
                'mobile' => '+1222222222',
                'address' => 'Member Address',
                'postal_code' => '54321',
                'emergency_name' => 'Emerg',
                'emergency_phone' => '+1222222223',
                'role' => 'member',
                'status' => 'approved',
                'password' => bcrypt('secret'),
            ]
        );

        $this->member = Member::firstOrCreate(
            ['id' => 'm_overdue_test_1'],
            [
                'user_id' => $this->memberUser->id,
                'first_name' => 'Member',
                'last_name' => 'One',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'member_overdue@test.com',
                'status' => 'active',
                'member_type' => 'adult',
                'membership' => true,
                'credit' => 100,
                'grade' => 'Grade A',
            ]
        );

        Setting::updateOrCreate(['key' => 'timezone'], ['value' => 'Asia/Kolkata']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '24']);
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        SessionTimingHelper::applyClubTimezone();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    /**
     * Test 1: Schedule in the future -> acceptance works normally.
     */
    public function test_1_schedule_in_future_acceptance_works_normally(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-10-15 10:00:00', 'Asia/Kolkata'));

        $schedule = PlaySchedule::create([
            'id' => 'sch_future_test',
            'name' => 'Future Session',
            'date' => '2026-10-17 19:30:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court 1',
            'status' => 'released',
        ]);

        $invite = PlayInvitation::create([
            'id' => 'inv_future_test',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'open',
            'debited' => false,
        ]);

        $initialCredit = $this->member->fresh()->credit;

        $response = $this->actingAs($this->memberUser)
            ->postJson("/api/play-invitations/{$invite->id}/respond", ['status' => 'accepted']);

        $response->assertStatus(200);
        $this->assertEquals('accepted', $invite->fresh()->status);
        $this->assertTrue((bool) $invite->fresh()->debited);
        $this->assertEquals($initialCredit - 10, $this->member->fresh()->credit);
    }

    /**
     * Test 2: At least one member accepts -> existing automatic rotation workflow remains unchanged.
     */
    public function test_2_at_least_one_member_accepts_automatic_rotation_works_normally(): void
    {
        // Scheduled match: 2026-10-17 19:30:00
        // Lock window: 24h prior = 2026-10-16 19:30:00
        $schedule = PlaySchedule::create([
            'id' => 'sch_autorot_test',
            'name' => 'Auto Rotate Session',
            'date' => '2026-10-17 19:30:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court 1',
            'status' => 'released',
        ]);

        $invite = PlayInvitation::create([
            'id' => 'inv_autorot_test',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
            'debited' => true,
        ]);

        // Advance time to lock window (e.g. 2026-10-16 20:00:00, within 24h lock window, before match start)
        Carbon::setTestNow(Carbon::parse('2026-10-16 20:00:00', 'Asia/Kolkata'));

        PlayScheduleController::processAutoPublishAndRotation();

        $schedule->refresh();
        $this->assertEquals('published', $schedule->status);
        $this->assertNotNull(Rotation::where('schedule_id', $schedule->id)->first());
    }

    /**
     * Test 3: Nobody accepts and the start time passes -> schedule automatically closes without rotation.
     */
    public function test_3_nobody_accepts_and_start_time_passes_schedule_automatically_closes(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 'sch_nobody_test',
            'name' => 'Nobody Accepted Session',
            'date' => '2026-10-17 19:30:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court 1',
            'status' => 'released',
        ]);

        $invite = PlayInvitation::create([
            'id' => 'inv_nobody_test',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'open',
            'debited' => false,
        ]);

        // Advance time past match start time: 2026-10-17 19:31:00
        Carbon::setTestNow(Carbon::parse('2026-10-17 19:31:00', 'Asia/Kolkata'));

        PlayScheduleController::processAutoPublishAndRotation();

        $schedule->refresh();
        $this->assertEquals('closed', $schedule->status);
        $this->assertNull(Rotation::where('schedule_id', $schedule->id)->first());
    }

    /**
     * Test 4: After start time passes, direct API acceptance is rejected without rotation or wallet debit.
     */
    public function test_4_after_start_time_direct_api_acceptance_rejected(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 'sch_late_accept_test',
            'name' => 'Late Accept Session',
            'date' => '2026-10-17 19:30:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 15,
            'hall_rate' => 50,
            'location' => 'Court 1',
            'status' => 'released',
        ]);

        $invite = PlayInvitation::create([
            'id' => 'inv_late_accept_test',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'open',
            'debited' => false,
        ]);

        $initialCredit = $this->member->fresh()->credit;

        // Set time to 20 minutes after match start: 2026-10-17 19:50:00
        Carbon::setTestNow(Carbon::parse('2026-10-17 19:50:00', 'Asia/Kolkata'));

        $response = $this->actingAs($this->memberUser)
            ->postJson("/api/play-invitations/{$invite->id}/respond", ['status' => 'accepted']);

        $response->assertStatus(422);
        $response->assertJson([
            'message' => 'This session is closed. Accept and decline are no longer available.',
        ]);

        // Verify schedule is closed
        $this->assertEquals('closed', $schedule->fresh()->status);
        // Verify invitation remained open (not accepted)
        $this->assertEquals('open', $invite->fresh()->status);
        // Verify no wallet debit occurred
        $this->assertEquals($initialCredit, $this->member->fresh()->credit);
        // Verify no rotation was generated
        $this->assertNull(Rotation::where('schedule_id', $schedule->id)->first());

        // Also test decline on past schedule is rejected
        $declineResponse = $this->actingAs($this->memberUser)
            ->postJson("/api/play-invitations/{$invite->id}/respond", ['status' => 'declined']);
        $declineResponse->assertStatus(422);

        // Also test direct enroll on past schedule is rejected
        $enrollResponse = $this->actingAs($this->memberUser)
            ->postJson("/api/schedules/{$schedule->id}/enroll", [
                'memberIds' => [$this->member->id],
                'autoAccept' => true,
            ]);
        $enrollResponse->assertStatus(422);
    }

    /**
     * Test 5: Already Closed or Cancelled schedules -> no duplicate processing.
     */
    public function test_5_already_closed_or_cancelled_schedules_no_duplicate_processing(): void
    {
        $closedSchedule = PlaySchedule::create([
            'id' => 'sch_already_closed',
            'name' => 'Already Closed Session',
            'date' => '2026-10-17 19:30:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court 1',
            'status' => 'closed',
        ]);

        $cancelledSchedule = PlaySchedule::create([
            'id' => 'sch_already_cancelled',
            'name' => 'Already Cancelled Session',
            'date' => '2026-10-17 19:30:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court 1',
            'status' => 'cancelled',
            'cancel_reason' => 'Rain',
        ]);

        Carbon::setTestNow(Carbon::parse('2026-10-18 10:00:00', 'Asia/Kolkata'));

        // Run overdue closure multiple times
        PlayScheduleController::processOverdueClosure();
        PlayScheduleController::processOverdueClosure();

        $this->assertEquals('closed', $closedSchedule->fresh()->status);
        $this->assertEquals('cancelled', $cancelledSchedule->fresh()->status);
        $this->assertEquals('Rain', $cancelledSchedule->fresh()->cancel_reason);

        // Ensure zero transactions or rotations created
        $this->assertEquals(0, Transaction::count());
        $this->assertNull(Rotation::where('schedule_id', $closedSchedule->id)->first());
        $this->assertNull(Rotation::where('schedule_id', $cancelledSchedule->id)->first());
    }

    /**
     * Test 6: Verify status is reflected correctly in Admin and Member Play Sessions views.
     */
    public function test_6_status_reflected_correctly_in_admin_and_member_views(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 'sch_view_test',
            'name' => 'View Session',
            'date' => '2026-10-17 19:30:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court 1',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'inv_view_test',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'open',
            'debited' => false,
        ]);

        // Advance time past match start: 2026-10-17 21:00:00
        Carbon::setTestNow(Carbon::parse('2026-10-17 21:00:00', 'Asia/Kolkata'));

        // Admin schedules list automatically updates and reflects closed status
        $adminRes = $this->actingAs($this->admin)->getJson('/api/schedules');
        $adminRes->assertStatus(200);
        $adminSchedules = collect($adminRes->json());
        $foundAdmin = $adminSchedules->firstWhere('id', $schedule->id);
        $this->assertNotNull($foundAdmin);
        $this->assertEquals('closed', $foundAdmin['status']);

        // Member schedules list also reflects closed status
        $memberRes = $this->actingAs($this->memberUser)->getJson('/api/schedules');
        $memberRes->assertStatus(200);
        $memberSchedules = collect($memberRes->json());
        $foundMember = $memberSchedules->firstWhere('id', $schedule->id);
        $this->assertNotNull($foundMember);
        $this->assertEquals('closed', $foundMember['status']);

        // Upcoming dashboard sessions excludes closed past sessions
        $upcomingRes = $this->actingAs($this->memberUser)->getJson('/api/schedules/upcoming-play-sessions');
        $upcomingRes->assertStatus(200);
        $upcomingSchedules = collect($upcomingRes->json());
        $this->assertNull($upcomingSchedules->firstWhere('id', $schedule->id));
    }

    /**
     * Test 7: Preserves existing behavior for schedules where rotation was already published.
     */
    public function test_7_preserves_published_schedule_behavior_after_start_time(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 'sch_published_test',
            'name' => 'Published Session',
            'date' => '2026-10-17 19:30:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court 1',
            'status' => 'published',
        ]);

        Rotation::create([
            'id' => 'rot_published_test',
            'schedule_id' => $schedule->id,
            'rounds' => [['round' => 1, 'matches' => []]],
            'show_member_grades' => false,
        ]);

        Carbon::setTestNow(Carbon::parse('2026-10-17 20:00:00', 'Asia/Kolkata'));

        PlayScheduleController::processOverdueClosure();

        // Status remains published (preserving completed rotation workflow)
        $this->assertEquals('published', $schedule->fresh()->status);
        $this->assertNotNull(Rotation::where('schedule_id', $schedule->id)->first());
    }
}
