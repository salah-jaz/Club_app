<?php

namespace Tests\Feature;

use App\Jobs\SendPlayScheduleReleaseNotifications;
use App\Models\Grade;
use App\Models\LeagueGroup;
use App\Models\Location;
use App\Models\Member;
use App\Models\PlayInvitation;
use App\Models\PlaySchedule;
use App\Models\Setting;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PlayScheduleReleasePerformanceTest extends TestCase
{
    use RefreshDatabase;

    protected User $adminUser;
    protected Member $adultMember1;
    protected Member $adultMember2;
    protected Member $juniorMember;

    protected function setUp(): void
    {
        parent::setUp();

        Grade::firstOrCreate(['name' => 'Grade A'], ['type' => 'adult', 'rank' => 1]);
        Location::firstOrCreate(['name' => 'Court 1']);
        Setting::updateOrCreate(['key' => 'currency'], ['value' => '$']);
        Setting::updateOrCreate(['key' => 'app_name'], ['value' => 'ClubConnect']);

        $this->adminUser = User::create([
            'id' => 'u_admin_release_test',
            'first_name' => 'Admin',
            'last_name' => 'Boss',
            'sex' => 'male',
            'dob' => '1980-01-01',
            'email' => 'admin@release-test.com',
            'mobile' => '+1111111111',
            'address' => '123 Admin St',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'status' => 'active',
        ]);

        $u1 = User::create([
            'id' => 'u_member_1',
            'first_name' => 'Adult',
            'last_name' => 'One',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'adult1@release-test.com',
            'mobile' => '+2222222221',
            'address' => '456 Member St',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->adultMember1 = Member::create([
            'id' => 'm_adult_1',
            'user_id' => $u1->id,
            'name' => 'Adult One',
            'first_name' => 'Adult',
            'last_name' => 'One',
            'email' => 'adult1@release-test.com',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'grade' => 'Grade A',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 100.0,
            'skip_credit_consumption' => false,
            'play_eligible' => true,
        ]);

        $u2 = User::create([
            'id' => 'u_member_2',
            'first_name' => 'Adult',
            'last_name' => 'Two',
            'sex' => 'female',
            'dob' => '1992-01-01',
            'email' => 'adult2@release-test.com',
            'mobile' => '+2222222222',
            'address' => '456 Member St',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->adultMember2 = Member::create([
            'id' => 'm_adult_2',
            'user_id' => $u2->id,
            'name' => 'Adult Two',
            'first_name' => 'Adult',
            'last_name' => 'Two',
            'email' => 'adult2@release-test.com',
            'sex' => 'female',
            'dob' => '1992-01-01',
            'grade' => 'Grade A',
            'member_type' => 'adult',
            'membership' => true,
            'status' => 'active',
            'credit' => 50.0,
            'skip_credit_consumption' => false,
            'play_eligible' => true,
        ]);

        $this->juniorMember = Member::create([
            'id' => 'm_junior_1',
            'user_id' => $u1->id,
            'name' => 'Junior One',
            'first_name' => 'Junior',
            'last_name' => 'One',
            'email' => 'junior1@release-test.com',
            'sex' => 'male',
            'dob' => now()->subYears(10)->format('Y-m-d'),
            'grade' => 'Grade A',
            'member_type' => 'junior',
            'membership' => false,
            'status' => 'active',
            'credit' => 0.0,
            'skip_credit_consumption' => false,
            'play_eligible' => true,
        ]);
    }

    public function test_release_dispatches_background_job_and_returns_immediately(): void
    {
        Queue::fake();

        $schedule = PlaySchedule::create([
            'id' => 'ps_test_release_1',
            'name' => 'Open Badminton Play',
            'date' => now()->addDays(2)->format('Y-m-d H:i:s'),
            'location' => 'Court 1',
            'courts' => 1,
            'players' => 10,
            'slot_hours' => 2,
            'slot_duration' => '2 hrs',
            'session_rate' => 15.0,
            'hall_rate' => 0.0,
            'status' => 'open',
            'is_league_match' => false,
        ]);

        $response = $this->actingAs($this->adminUser)->postJson("/api/schedules/{$schedule->id}/release");

        $response->assertStatus(200);
        $response->assertJson([
            'schedule' => [
                'id' => $schedule->id,
                'status' => 'released',
            ],
        ]);

        // Verify schedule status updated in database
        $this->assertDatabaseHas('play_schedules', [
            'id' => $schedule->id,
            'status' => 'released',
        ]);

        // Verify invitations were created for eligible members
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember1->id,
            'status' => 'open',
        ]);
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember2->id,
            'status' => 'open',
        ]);
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $this->juniorMember->id,
            'status' => 'open',
        ]);

        // Verify the background email notification job was pushed
        Queue::assertPushed(SendPlayScheduleReleaseNotifications::class, function ($job) use ($schedule) {
            return $job->scheduleId === $schedule->id
                && count($job->releaseNotifications) === 3;
        });
    }

    public function test_background_job_executes_and_sends_emails(): void
    {
        Mail::fake();

        $schedule = PlaySchedule::create([
            'id' => 'ps_test_release_2',
            'name' => 'Open Play Session',
            'date' => now()->addDays(3)->format('Y-m-d H:i:s'),
            'location' => 'Court 1',
            'courts' => 1,
            'players' => 8,
            'slot_hours' => 2,
            'slot_duration' => '2 hrs',
            'session_rate' => 12.0,
            'hall_rate' => 0.0,
            'status' => 'released',
            'is_league_match' => false,
        ]);

        $job = new SendPlayScheduleReleaseNotifications(
            $schedule->id,
            [
                ['member_id' => $this->adultMember1->id, 'status' => 'open'],
                ['member_id' => $this->adultMember2->id, 'status' => 'open'],
            ]
        );

        $job->handle();

        // Verify 2 emails sent via GenericMailable
        Mail::assertSent(\App\Mail\GenericMailable::class, 2);
    }

    public function test_league_match_release_auto_accepts_capacity_and_queues_debit_notifications(): void
    {
        Queue::fake();

        $group = LeagueGroup::create([
            'id' => 'lg_test_1',
            'name' => 'Division 1',
        ]);

        DB::table('league_group_member')->insert([
            ['league_group_id' => $group->id, 'member_id' => $this->adultMember1->id],
            ['league_group_id' => $group->id, 'member_id' => $this->adultMember2->id],
        ]);

        $schedule = PlaySchedule::create([
            'id' => 'ps_test_league_1',
            'name' => 'League Clash',
            'date' => now()->addDays(1)->format('Y-m-d H:i:s'),
            'location' => 'Court 1',
            'courts' => 1,
            'players' => 1, // Only 1 can be accepted up to capacity
            'slot_hours' => 2,
            'slot_duration' => '2 hrs',
            'session_rate' => 20.0,
            'hall_rate' => 0.0,
            'status' => 'open',
            'is_league_match' => true,
            'league_group_ids' => [$group->id],
        ]);

        $response = $this->actingAs($this->adminUser)->postJson("/api/schedules/{$schedule->id}/release");

        $response->assertStatus(200);

        // Player 1 auto-accepted and debited $20
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember1->id,
            'status' => 'accepted',
            'debited' => true,
        ]);
        $this->assertEquals(80.0, $this->adultMember1->fresh()->credit);

        // Player 2 waiting
        $this->assertDatabaseHas('play_invitations', [
            'schedule_id' => $schedule->id,
            'member_id' => $this->adultMember2->id,
            'status' => 'waiting',
        ]);

        // Job queued with 1 transaction notification and 2 release notifications
        Queue::assertPushed(SendPlayScheduleReleaseNotifications::class, function ($job) use ($schedule) {
            return $job->scheduleId === $schedule->id
                && count($job->releaseNotifications) === 2
                && count($job->transactionNotifications) === 1;
        });
    }

    public function test_releasing_already_released_schedule_does_not_duplicate_invitations(): void
    {
        $schedule = PlaySchedule::create([
            'id' => 'ps_test_re_release',
            'name' => 'Double Release Test',
            'date' => now()->addDays(4)->format('Y-m-d H:i:s'),
            'location' => 'Court 1',
            'courts' => 1,
            'players' => 10,
            'slot_hours' => 2,
            'slot_duration' => '2 hrs',
            'session_rate' => 10.0,
            'hall_rate' => 0.0,
            'status' => 'open',
            'is_league_match' => false,
        ]);

        // First release
        $res1 = $this->actingAs($this->adminUser)->postJson("/api/schedules/{$schedule->id}/release");
        $res1->assertStatus(200);

        $firstCount = PlayInvitation::where('schedule_id', $schedule->id)->count();

        // Second release
        $res2 = $this->actingAs($this->adminUser)->postJson("/api/schedules/{$schedule->id}/release");
        $res2->assertStatus(200);

        $secondCount = PlayInvitation::where('schedule_id', $schedule->id)->count();

        $this->assertEquals($firstCount, $secondCount);
        $this->assertEquals(3, $secondCount);
    }
}
