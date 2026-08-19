<?php

namespace Tests\Feature;

use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\User;
use App\Models\Member;
use App\Models\Location;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class TrainingInvitationSingleEmailTest extends TestCase
{
    use DatabaseTransactions;

    protected User $admin;
    protected Member $adultMember;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        $grade = \App\Models\Grade::firstOrCreate(['name' => 'Grade Adult'], ['type' => 'adult']);

        $this->admin = User::firstOrCreate(
            ['id' => 'u_admin_mail_test'],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'admin_mail@test.com',
                'mobile' => '+1234567890',
                'address' => 'Test Address',
                'password' => bcrypt('password'),
                'role' => 'admin',
                'status' => 'active',
            ]
        );

        $user = User::create([
            'id' => 'u_member_mail_test_' . \Illuminate\Support\Str::random(5),
            'first_name' => 'John',
            'last_name' => 'Doe',
            'sex' => 'male',
            'dob' => '1995-05-15',
            'email' => 'john_mail_test_' . \Illuminate\Support\Str::random(5) . '@example.com',
            'mobile' => '+1999888777',
            'address' => 'Member Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->adultMember = Member::create([
            'id' => 'm_member_mail_test_' . \Illuminate\Support\Str::random(5),
            'user_id' => $user->id,
            'first_name' => 'John',
            'last_name' => 'Doe',
            'sex' => 'male',
            'dob' => '1995-05-15',
            'email' => $user->email,
            'mobile' => '+1999888777',
            'status' => 'active',
            'member_type' => 'adult',
            'grade_id' => $grade->id,
            'grade' => 'Grade Adult',
            'credit' => 100.00,
        ]);
    }

    public function test_user_registration_sends_registration_received_email(): void
    {
        Mail::fake();

        $response = $this->postJson('/api/register', [
            'firstName' => 'Alice',
            'lastName' => 'Smith',
            'sex' => 'female',
            'dob' => '1998-03-20',
            'email' => 'alice_register_' . \Illuminate\Support\Str::random(5) . '@example.com',
            'mobile' => '+1555444333',
            'address' => '123 Main St',
            'password' => 'secret123',
        ]);

        $response->assertStatus(201);

        Mail::assertSent(\App\Helpers\GenericMailable::class, function ($mail) {
            return $mail->customSubject === 'Account Registration Received';
        });
    }

    public function test_updating_member_invitation_with_multiple_weeks_sends_only_one_email(): void
    {
        Mail::fake();

        $startDate1 = now()->addDays(2)->format('Y-m-d H:i:s');
        $startDate2 = now()->addDays(9)->format('Y-m-d H:i:s');

        $parentId = 'tr_series_' . \Illuminate\Support\Str::random(5);

        $tr1 = Training::create([
            'id' => $parentId,
            'parent_id' => $parentId,
            'name' => '2 Weeks Training Session 1',
            'start_date' => $startDate1,
            'end_date' => now()->addDays(2)->addHours(1)->format('Y-m-d H:i:s'),
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'sessions' => 2,
            'slots' => 10,
            'duration' => '1 hr',
            'fees' => 50.00,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'status' => 'created',
            'target_type' => 'adult',
        ]);

        $tr2 = Training::create([
            'id' => 'tr_series_sub_' . \Illuminate\Support\Str::random(5),
            'parent_id' => $parentId,
            'name' => '2 Weeks Training Session 2',
            'start_date' => $startDate2,
            'end_date' => now()->addDays(9)->addHours(1)->format('Y-m-d H:i:s'),
            'repeat_weeks' => 2,
            'repeat_months' => 1,
            'sessions' => 2,
            'slots' => 10,
            'duration' => '1 hr',
            'fees' => 50.00,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'status' => 'created',
            'target_type' => 'adult',
        ]);

        // Coach updates invitation for member checking BOTH dates ($tr1->id and $tr2->id)
        $response = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr1->id}/update-member-invitation", [
            'memberId' => $this->adultMember->id,
            'sessionIds' => [$tr1->id, $tr2->id],
        ]);

        $response->assertStatus(200);

        // Verify invitations were created for both sessions
        $this->assertEquals(2, TrainingInvitation::where('member_id', $this->adultMember->id)->count());

        // Verify exactly ONE initial notification mail was sent to the member
        Mail::assertSentCount(1);
        Mail::assertSent(\App\Helpers\GenericMailable::class, function ($mail) {
            return str_contains($mail->customSubject, 'Training Session Notification') &&
                !str_contains($mail->customSubject, 'Update') &&
                str_contains($mail->htmlContent, 'New Training Session Released') &&
                str_contains($mail->htmlContent, 'Checked Session Dates:');
        });

        // Now test updating the member's invitation (subsequent change)
        Mail::fake();

        $updateResponse = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr1->id}/update-member-invitation", [
            'memberId' => $this->adultMember->id,
            'sessionIds' => [$tr1->id],
        ]);
        $updateResponse->assertStatus(200);

        Mail::assertSentCount(1);
        Mail::assertSent(\App\Helpers\GenericMailable::class, function ($mail) {
            return str_contains($mail->customSubject, 'Training Session Update Notification') &&
                str_contains($mail->htmlContent, 'Training Session Updated') &&
                str_contains($mail->htmlContent, 'has been updated by the club');
        });
    }

    public function test_training_update_mail_contains_update_subject_and_title(): void
    {
        Mail::fake();

        $startDate = now()->addDays(5)->format('Y-m-d H:i:s');
        $tr = Training::create([
            'id' => 'tr_single_' . \Illuminate\Support\Str::random(5),
            'name' => 'Tuesday · Sep 1, 2026 · 7:00 PM',
            'start_date' => $startDate,
            'end_date' => now()->addDays(5)->addHours(1)->format('Y-m-d H:i:s'),
            'sessions' => 1,
            'duration' => '1 hr',
            'slots' => 10,
            'fees' => 30.00,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'created',
            'target_type' => 'adult',
        ]);

        \App\Helpers\MailHelper::sendTrainingNotification($this->adultMember, $tr, 'open', 'update');

        Mail::assertSent(\App\Helpers\GenericMailable::class, function ($mail) {
            return $mail->customSubject === 'Training Session Update Notification: Tuesday · Sep 1, 2026 · 7:00 PM' &&
                str_contains($mail->htmlContent, 'Training Session Updated') &&
                str_contains($mail->htmlContent, 'has been updated by the club.');
        });
    }

    public function test_training_first_time_mail_contains_release_subject_and_title(): void
    {
        Mail::fake();

        $startDate = now()->addDays(5)->format('Y-m-d H:i:s');
        $tr = Training::create([
            'id' => 'tr_single_rel_' . \Illuminate\Support\Str::random(5),
            'name' => 'Tuesday · Sep 1, 2026 · 7:00 PM',
            'start_date' => $startDate,
            'end_date' => now()->addDays(5)->addHours(1)->format('Y-m-d H:i:s'),
            'sessions' => 1,
            'duration' => '1 hr',
            'slots' => 10,
            'fees' => 30.00,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'created',
            'target_type' => 'adult',
        ]);

        \App\Helpers\MailHelper::sendTrainingNotification($this->adultMember, $tr, 'open', 'release');

        Mail::assertSent(\App\Helpers\GenericMailable::class, function ($mail) {
            return $mail->customSubject === 'Training Session Notification: Tuesday · Sep 1, 2026 · 7:00 PM' &&
                str_contains($mail->htmlContent, 'New Training Session Released') &&
                str_contains($mail->htmlContent, 'has been released by the club.');
        });
    }

    public function test_send_button_with_preexisting_pending_invitations_sends_notification_not_update_notification(): void
    {
        Mail::fake();

        $startDate = now()->addDays(5)->format('Y-m-d H:i:s');
        $tr = Training::create([
            'id' => 'tr_single_pend_' . \Illuminate\Support\Str::random(5),
            'name' => 'Tuesday · Sep 1, 2026 · 7:00 PM',
            'start_date' => $startDate,
            'end_date' => now()->addDays(5)->addHours(1)->format('Y-m-d H:i:s'),
            'sessions' => 1,
            'duration' => '1 hr',
            'slots' => 10,
            'fees' => 30.00,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'created',
            'target_type' => 'adult',
        ]);

        // Pre-create pending invitation as sync service does
        TrainingInvitation::create([
            'id' => 'ti_pend_' . \Illuminate\Support\Str::random(5),
            'training_id' => $tr->id,
            'member_id' => $this->adultMember->id,
            'status' => 'pending',
        ]);

        // 1st time: Clicking "Send" button in training
        $response = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/update-member-invitation", [
            'memberId' => $this->adultMember->id,
            'sessionIds' => [$tr->id],
        ]);
        $response->assertStatus(200);

        // Should receive initial "Training Session Notification" (without "Update")
        Mail::assertSent(\App\Helpers\GenericMailable::class, function ($mail) {
            return $mail->customSubject === 'Training Session Notification: Tuesday · Sep 1, 2026 · 7:00 PM' &&
                str_contains($mail->htmlContent, 'New Training Session Released');
        });

        // Reset mail fake for 2nd click (Update button)
        Mail::fake();

        // 2nd time: Clicking "Update" button in training
        $response2 = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/update-member-invitation", [
            'memberId' => $this->adultMember->id,
            'sessionIds' => [$tr->id],
        ]);
        $response2->assertStatus(200);

        // Should receive "Training Session Update Notification" (with "Update")
        Mail::assertSent(\App\Helpers\GenericMailable::class, function ($mail) {
            return $mail->customSubject === 'Training Session Update Notification: Tuesday · Sep 1, 2026 · 7:00 PM' &&
                str_contains($mail->htmlContent, 'Training Session Updated');
        });
    }
}
