<?php

namespace Tests\Feature;

use App\Models\Grade;
use App\Models\Location;
use App\Models\Member;
use App\Models\PlayInvitation;
use App\Models\PlaySchedule;
use App\Models\Rotation;
use App\Models\Setting;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

class AutoPublishRotationTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;
    protected User $memberUser;
    protected Member $member;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult']);
        Location::firstOrCreate(['name' => 'Court A']);

        $this->admin = User::firstOrCreate(
            ['email' => 'admin_autopublish@test.com'],
            [
                'id' => 'u_admin_autopublish',
                'first_name' => 'Admin',
                'last_name' => 'Auto',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'mobile' => '+1999999991',
                'address' => 'Test Address',
                'postal_code' => '12345',
                'emergency_name' => 'Emergency',
                'emergency_phone' => '+1999999999',
                'role' => 'admin',
                'status' => 'approved',
                'password' => bcrypt('password'),
            ]
        );

        $this->memberUser = User::firstOrCreate(
            ['email' => 'member_autopublish@test.com'],
            [
                'id' => 'u_member_autopublish',
                'first_name' => 'Member',
                'last_name' => 'Auto',
                'sex' => 'female',
                'dob' => '1995-01-01',
                'mobile' => '+1999999992',
                'address' => 'Test Address',
                'postal_code' => '12345',
                'emergency_name' => 'Emergency',
                'emergency_phone' => '+1999999999',
                'role' => 'member',
                'status' => 'approved',
                'password' => bcrypt('password'),
            ]
        );

        $this->member = Member::firstOrCreate(
            ['id' => 'm_autopublish_1'],
            [
                'user_id' => $this->memberUser->id,
                'first_name' => 'Member',
                'last_name' => 'Auto',
                'sex' => 'female',
                'dob' => '1995-01-01',
                'email' => 'member_autopublish@test.com',
                'status' => 'active',
                'member_type' => 'adult',
                'membership' => true,
                'credit' => 100,
                'grade' => 'Grade A',
            ]
        );

        Setting::updateOrCreate(['key' => 'timezone'], ['value' => 'UTC']);
        \App\Helpers\SessionTimingHelper::applyClubTimezone();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_setting_auto_publish_rotation_toggle_can_be_read_and_updated(): void
    {
        Setting::where('key', 'auto_publish_rotation')->delete();

        $res = $this->actingAs($this->admin)->getJson('/api/settings');
        $res->assertStatus(200);
        $this->assertTrue($res->json('autoPublishRotation'));

        // 2. Turn ON
        $updateRes = $this->actingAs($this->admin)->postJson('/api/settings', [
            'autoPublishRotation' => true,
            'cancellationLockHours' => 23,
        ]);
        $updateRes->assertStatus(200);
        $this->assertTrue($updateRes->json('autoPublishRotation'));
        $this->assertEquals(23, $updateRes->json('cancellationLockHours'));

        $this->assertEquals('true', Setting::where('key', 'auto_publish_rotation')->value('value'));
        $this->assertEquals('23', Setting::where('key', 'cancellation_lock_hours')->value('value'));

        // 3. Turn OFF
        $updateRes2 = $this->actingAs($this->admin)->postJson('/api/settings', [
            'autoPublishRotation' => false,
        ]);
        $updateRes2->assertStatus(200);
        $this->assertFalse($updateRes2->json('autoPublishRotation'));
        $this->assertEquals('false', Setting::where('key', 'auto_publish_rotation')->value('value'));
    }

    public function test_auto_publish_and_rotation_does_not_trigger_when_toggle_is_disabled(): void
    {
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'false']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '24']);

        // Create schedule 10 hours away (within 24h lock window)
        $schedule = PlaySchedule::create([
            'id' => 'sch_manual_flow',
            'name' => 'Manual Flow Test Schedule',
            'date' => Carbon::now()->addHours(10)->toDateTimeString(),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court A',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'inv_m1',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
        ]);

        // Fetch index or run auto publish command
        $this->actingAs($this->admin)->getJson('/api/schedules');

        $schedule->refresh();
        $this->assertEquals('released', $schedule->status);
        $this->assertNull(Rotation::where('schedule_id', $schedule->id)->first());
    }

    public function test_auto_publish_and_rotation_triggers_when_toggle_is_enabled_and_lock_window_reached(): void
    {
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '23']);

        // Create schedule 20 hours away (within 23h lock window)
        $schedule = PlaySchedule::create([
            'id' => 'sch_auto_flow',
            'name' => 'Auto Flow Test Schedule',
            'date' => Carbon::now()->addHours(20)->toDateTimeString(),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court A',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'inv_m2',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
        ]);

        // Fetch index (triggers auto publish and rotation)
        $res = $this->actingAs($this->admin)->getJson('/api/schedules');
        $res->assertStatus(200);

        $schedule->refresh();
        $this->assertEquals('published', $schedule->status);

        $rotation = Rotation::where('schedule_id', $schedule->id)->first();
        $this->assertNotNull($rotation);
    }

    public function test_rsvp_decline_blocked_when_auto_publish_rotation_enabled_and_lock_window_reached(): void
    {
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '12']);

        $schedule = PlaySchedule::create([
            'id' => 'sch_decline_lock',
            'name' => 'Decline Lock Test Schedule',
            'date' => Carbon::now()->addHours(6)->toDateTimeString(), // 6 hours away (< 12h)
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court A',
            'status' => 'released',
        ]);

        $invite = PlayInvitation::create([
            'id' => 'inv_m3',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
        ]);

        // Attempt RSVP decline via respond endpoint
        $res = $this->actingAs($this->memberUser)->postJson("/api/play-invitations/{$invite->id}/respond", [
            'status' => 'declined',
        ]);

        $res->assertStatus(422);
        $this->assertStringContainsString('locked', $res->json('message'));
    }

    public function test_auto_publish_does_not_release_open_schedules(): void
    {
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '24']);

        $schedule = PlaySchedule::create([
            'id' => 'sch_open_flow',
            'name' => 'Open Flow Test Schedule',
            'date' => Carbon::now()->addHours(12)->toDateTimeString(),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court A',
            'status' => 'open',
        ]);

        $res = $this->actingAs($this->admin)->getJson('/api/schedules');
        $res->assertStatus(200);

        $schedule->refresh();
        $this->assertEquals('open', $schedule->status);
        $this->assertNull(Rotation::where('schedule_id', $schedule->id)->first());
    }

    public function test_auto_publish_skips_released_schedule_with_no_accepted_players(): void
    {
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '24']);

        $schedule = PlaySchedule::create([
            'id' => 'sch_no_accepted',
            'name' => 'No Accepted Players',
            'date' => Carbon::now()->addHours(10)->toDateTimeString(),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court A',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'inv_open_only',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'open',
        ]);

        $this->actingAs($this->admin)->getJson('/api/schedules')->assertStatus(200);

        $schedule->refresh();
        $this->assertEquals('released', $schedule->status);
        $this->assertNull(Rotation::where('schedule_id', $schedule->id)->first());
    }

    public function test_auto_publish_does_not_trigger_before_lock_window(): void
    {
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '12']);

        $schedule = PlaySchedule::create([
            'id' => 'sch_before_lock',
            'name' => 'Before Lock Window',
            'date' => Carbon::now()->addHours(20)->toDateTimeString(),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court A',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'inv_before_lock',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
        ]);

        $this->actingAs($this->admin)->getJson('/api/schedules')->assertStatus(200);

        $schedule->refresh();
        $this->assertEquals('released', $schedule->status);
        $this->assertNull(Rotation::where('schedule_id', $schedule->id)->first());
    }

    public function test_auto_publish_includes_accepted_juniors_and_artisan_command(): void
    {
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '24']);

        $junior = Member::firstOrCreate(
            ['id' => 'm_autopublish_junior'],
            [
                'user_id' => $this->memberUser->id,
                'first_name' => 'Junior',
                'last_name' => 'Auto',
                'sex' => 'male',
                'dob' => '2015-01-01',
                'email' => 'junior_autopublish@test.com',
                'status' => 'active',
                'member_type' => 'junior',
                'membership' => false,
                'credit' => 0,
                'grade' => 'Grade A',
                'parent_member_id' => $this->member->id,
            ]
        );

        $schedule = PlaySchedule::create([
            'id' => 'sch_junior_auto',
            'name' => 'Junior Auto Flow',
            'date' => Carbon::now()->addHours(10)->toDateTimeString(),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court A',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'inv_adult_acc',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
        ]);
        PlayInvitation::create([
            'id' => 'inv_junior_acc',
            'schedule_id' => $schedule->id,
            'member_id' => $junior->id,
            'status' => 'accepted',
        ]);

        $this->artisan('schedules:auto-publish')->assertSuccessful();

        $schedule->refresh();
        $this->assertEquals('published', $schedule->status);

        $rotation = Rotation::where('schedule_id', $schedule->id)->first();
        $this->assertNotNull($rotation);
        $roundsJson = json_encode($rotation->rounds);
        $this->assertStringContainsString($this->member->id, $roundsJson);
        $this->assertStringContainsString($junior->id, $roundsJson);
    }

    public function test_rotated_schedule_is_published_when_lock_window_reached(): void
    {
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '24']);

        $schedule = PlaySchedule::create([
            'id' => 'sch_already_rotated',
            'name' => 'Already Rotated',
            'date' => Carbon::now()->addHours(6)->toDateTimeString(),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court A',
            'status' => 'rotated',
        ]);

        PlayInvitation::create([
            'id' => 'inv_rotated_acc',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
        ]);

        Rotation::create([
            'id' => 'r_already',
            'schedule_id' => $schedule->id,
            'rounds' => [],
            'show_member_grades' => false,
        ]);

        $this->actingAs($this->admin)->getJson('/api/schedules')->assertStatus(200);

        $schedule->refresh();
        $this->assertEquals('published', $schedule->status);
    }

    public function test_auto_publish_triggers_when_settings_are_updated(): void
    {
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'false']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '24']);

        $schedule = PlaySchedule::create([
            'id' => 'sch_settings_trigger',
            'name' => 'Settings Trigger Test Schedule',
            'date' => Carbon::now()->addHours(10)->toDateTimeString(),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court A',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'inv_settings_trigger',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
        ]);

        // Turning ON auto publish setting via API should immediately trigger auto publish for eligible schedules
        $updateRes = $this->actingAs($this->admin)->postJson('/api/settings', [
            'autoPublishRotation' => true,
            'cancellationLockHours' => 24,
        ]);
        $updateRes->assertStatus(200);

        $schedule->refresh();
        $this->assertEquals('published', $schedule->status);
        $this->assertNotNull(Rotation::where('schedule_id', $schedule->id)->first());
    }

    public function test_auto_publish_generates_and_releases_next_play_session_and_prevents_duplicates(): void
    {
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '24']);

        $startDate = Carbon::now()->addHours(12);

        $schedule = PlaySchedule::create([
            'id' => 'sch_next_gen_test',
            'parent_id' => 'sch_next_gen_test',
            'repeat_weeks' => 1,
            'name' => 'Next Generation Schedule',
            'date' => $startDate->toDateTimeString(),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 15,
            'hall_rate' => 60,
            'location' => 'Court A',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'inv_m_next_gen',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
        ]);

        // Trigger auto publish & rotation
        $res = $this->actingAs($this->admin)->getJson('/api/schedules');
        $res->assertStatus(200);

        $schedule->refresh();
        $this->assertEquals('published', $schedule->status);
        $this->assertNotNull(Rotation::where('schedule_id', $schedule->id)->first());

        // Verify next play session was generated for 1 week later
        $expectedNextDate = $startDate->copy()->addWeeks(1)->toDateString();
        $nextSchedules = PlaySchedule::where('parent_id', 'sch_next_gen_test')
            ->whereDate('date', $expectedNextDate)
            ->get();

        $this->assertCount(1, $nextSchedules);
        $nextSch = $nextSchedules->first();
        $this->assertEquals('released', $nextSch->status);
        $this->assertEquals('Court A', $nextSch->location);
        $this->assertEquals(2, $nextSch->courts);
        $this->assertEquals(8, $nextSch->players);

        // Verify invitations were created for the next session
        $nextInvites = PlayInvitation::where('schedule_id', $nextSch->id)->get();
        $this->assertGreaterThan(0, $nextInvites->count());

        // Trigger auto publish again to ensure no duplicate session is created
        $res2 = $this->actingAs($this->admin)->getJson('/api/schedules');
        $res2->assertStatus(200);

        $nextSchedulesAfterSecondRun = PlaySchedule::where('parent_id', 'sch_next_gen_test')
            ->whereDate('date', $expectedNextDate)
            ->get();
        $this->assertCount(1, $nextSchedulesAfterSecondRun);
    }

    public function test_auto_publish_uses_club_timezone_same_moment_as_cancellation_lock(): void
    {
        Setting::updateOrCreate(['key' => 'timezone'], ['value' => 'Asia/Kolkata']);
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '24']);
        \App\Helpers\SessionTimingHelper::applyClubTimezone();

        // Club wall clock: 19 Aug 2026 11:54 IST. Match: 20 Aug 2026 11:45 IST.
        // Cancellation closes at 19 Aug 11:45 IST — 9 minutes ago.
        // UTC now is 06:24, which would miss a naive UTC comparison against 11:45.
        Carbon::setTestNow(Carbon::parse('2026-08-19 11:54:00', 'Asia/Kolkata'));

        $schedule = PlaySchedule::create([
            'id' => 'sch_tz_1145',
            'name' => 'Thursday · Aug 20, 2026 · 11:45 AM',
            'date' => '2026-08-20 11:45:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 50,
            'hall_rate' => 50,
            'location' => 'Court A',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'inv_tz_1145',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
            'debited' => true,
        ]);

        $this->actingAs($this->admin)->getJson('/api/schedules')->assertStatus(200);

        $schedule->refresh();
        $this->assertEquals('published', $schedule->status);
        $this->assertNotNull(Rotation::where('schedule_id', $schedule->id)->first());

        Carbon::setTestNow();
        Setting::updateOrCreate(['key' => 'timezone'], ['value' => 'UTC']);
        \App\Helpers\SessionTimingHelper::applyClubTimezone();
    }

    public function test_sync_data_triggers_auto_publish_and_rotation(): void
    {
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '24']);

        $schedule = PlaySchedule::create([
            'id' => 'sch_sync_auto',
            'name' => 'Sync Auto Publish',
            'date' => Carbon::now()->addHours(10)->toDateTimeString(),
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Court A',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'inv_sync_auto',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
        ]);

        $this->actingAs($this->admin)->getJson('/api/sync-data')->assertStatus(200);

        $schedule->refresh();
        $this->assertEquals('published', $schedule->status);
        $this->assertNotNull(Rotation::where('schedule_id', $schedule->id)->first());
    }

    public function test_auto_publish_uses_kolkata_when_timezone_setting_is_missing(): void
    {
        Setting::where('key', 'timezone')->delete();
        Setting::updateOrCreate(['key' => 'auto_publish_rotation'], ['value' => 'true']);
        Setting::updateOrCreate(['key' => 'cancellation_lock_hours'], ['value' => '24']);
        \App\Helpers\SessionTimingHelper::applyClubTimezone();

        Carbon::setTestNow(Carbon::parse('2026-08-19 12:14:00', 'Asia/Kolkata'));

        $schedule = PlaySchedule::create([
            'id' => 'sch_missing_tz_1210',
            'name' => 'Thursday · Aug 20, 2026 · 12:10 PM',
            'date' => '2026-08-20 12:10:00',
            'courts' => 2,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 55,
            'hall_rate' => 50,
            'location' => 'Main Hall',
            'status' => 'released',
        ]);

        PlayInvitation::create([
            'id' => 'inv_missing_tz_1210',
            'schedule_id' => $schedule->id,
            'member_id' => $this->member->id,
            'status' => 'accepted',
            'debited' => true,
        ]);

        $this->actingAs($this->admin)->getJson('/api/sync-data')->assertStatus(200);

        $schedule->refresh();
        $this->assertEquals('published', $schedule->status);
        $this->assertNotNull(Rotation::where('schedule_id', $schedule->id)->first());
    }
}
