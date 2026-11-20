<?php

namespace Tests\Feature;

use App\Mail\GenericMailable;
use App\Models\Grade;
use App\Models\Location;
use App\Models\Member;
use App\Models\Training;
use App\Models\TrainingInvitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

class TrainingAcceptReminderTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected Member $pendingMember;
    protected Member $acceptedMember;

    protected function setUp(): void
    {
        parent::setUp();

        Location::firstOrCreate(['name' => 'Main Hall']);
        $grade = Grade::firstOrCreate(['name' => 'Grade Adult'], ['type' => 'adult']);

        $this->admin = User::create([
            'id' => 'u_admin_remind_' . Str::random(5),
            'first_name' => 'Admin',
            'last_name' => 'User',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'email' => 'admin_remind_' . Str::random(5) . '@test.com',
            'mobile' => '+1234567890',
            'address' => 'Test Address',
            'password' => bcrypt('password'),
            'role' => 'admin',
            'is_super_admin' => true,
            'status' => 'active',
        ]);

        $pendingUser = User::create([
            'id' => 'u_pending_' . Str::random(5),
            'first_name' => 'Pending',
            'last_name' => 'Member',
            'sex' => 'male',
            'dob' => '1995-05-15',
            'email' => 'pending_' . Str::random(5) . '@example.com',
            'mobile' => '+1999888777',
            'address' => 'Member Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->pendingMember = Member::create([
            'id' => 'm_pending_' . Str::random(5),
            'user_id' => $pendingUser->id,
            'first_name' => 'Pending',
            'last_name' => 'Member',
            'sex' => 'male',
            'dob' => '1995-05-15',
            'email' => $pendingUser->email,
            'mobile' => '+1999888777',
            'status' => 'active',
            'member_type' => 'adult',
            'grade_id' => $grade->id,
            'grade' => 'Grade Adult',
            'credit' => 100.00,
        ]);

        $acceptedUser = User::create([
            'id' => 'u_accepted_' . Str::random(5),
            'first_name' => 'Accepted',
            'last_name' => 'Member',
            'sex' => 'female',
            'dob' => '1994-01-01',
            'email' => 'accepted_' . Str::random(5) . '@example.com',
            'mobile' => '+1555000111',
            'address' => 'Accepted Address',
            'password' => bcrypt('password'),
            'role' => 'member',
            'status' => 'active',
        ]);

        $this->acceptedMember = Member::create([
            'id' => 'm_accepted_' . Str::random(5),
            'user_id' => $acceptedUser->id,
            'first_name' => 'Accepted',
            'last_name' => 'Member',
            'sex' => 'female',
            'dob' => '1994-01-01',
            'email' => $acceptedUser->email,
            'mobile' => '+1555000111',
            'status' => 'active',
            'member_type' => 'adult',
            'grade_id' => $grade->id,
            'grade' => 'Grade Adult',
            'credit' => 100.00,
        ]);
    }

    public function test_send_accept_reminders_emails_only_yet_to_accept_members(): void
    {
        Mail::fake();

        $tr = Training::create([
            'id' => 'tr_remind_' . Str::random(5),
            'name' => 'Reminder Coaching Session',
            'start_date' => now()->addDays(4)->format('Y-m-d H:i:s'),
            'end_date' => now()->addDays(4)->addHours(1)->format('Y-m-d H:i:s'),
            'sessions' => 1,
            'duration' => '1 hr',
            'slots' => 10,
            'fees' => 30.00,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'open',
            'target_type' => 'adult',
        ]);

        TrainingInvitation::create([
            'id' => 'ti_open_' . Str::random(5),
            'training_id' => $tr->id,
            'member_id' => $this->pendingMember->id,
            'status' => 'open',
        ]);

        TrainingInvitation::create([
            'id' => 'ti_acc_' . Str::random(5),
            'training_id' => $tr->id,
            'member_id' => $this->acceptedMember->id,
            'status' => 'accepted',
        ]);

        $pendingEmail = $this->pendingMember->email;

        $response = $this->actingAs($this->admin)->postJson("/api/trainings/{$tr->id}/send-accept-reminders");
        $response->assertStatus(200)->assertJsonFragment(['sentCount' => 1]);

        Mail::assertSentCount(1);
        Mail::assertSent(GenericMailable::class, function ($mail) use ($pendingEmail) {
            return str_contains($mail->customSubject, 'Reminder: Accept Reminder Coaching Session')
                && str_contains($mail->htmlContent, 'You have not yet accepted')
                && str_contains($mail->htmlContent, 'Time Remaining:')
                && str_contains($mail->htmlContent, 'YET TO ACCEPT')
                && $mail->hasTo($pendingEmail);
        });
    }

    public function test_send_accept_reminders_does_not_change_invitation_status(): void
    {
        Mail::fake();

        $tr = Training::create([
            'id' => 'tr_remind_status_' . Str::random(5),
            'name' => 'Status Stable Coaching',
            'start_date' => now()->addDays(5)->format('Y-m-d H:i:s'),
            'end_date' => now()->addDays(5)->addHours(1)->format('Y-m-d H:i:s'),
            'sessions' => 1,
            'duration' => '1 hr',
            'slots' => 10,
            'fees' => 30.00,
            'coach' => 'Coach Smith',
            'location' => 'Main Hall',
            'status' => 'open',
            'target_type' => 'adult',
        ]);

        $invite = TrainingInvitation::create([
            'id' => 'ti_open_status_' . Str::random(5),
            'training_id' => $tr->id,
            'member_id' => $this->pendingMember->id,
            'status' => 'open',
        ]);

        $this->actingAs($this->admin)
            ->postJson("/api/trainings/{$tr->id}/send-accept-reminders")
            ->assertStatus(200)
            ->assertJsonFragment(['sentCount' => 1]);

        $this->assertSame('open', $invite->fresh()->status);
    }
}
