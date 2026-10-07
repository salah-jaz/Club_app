<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\User;
use App\Models\Member;
use App\Models\Transaction;
use App\Models\PlaySchedule;
use App\Models\Training;
use App\Helpers\MailHelper;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;
use App\Mail\GenericMailable;
use Illuminate\Support\Str;
use Carbon\Carbon;

class EmailTemplateToggleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    private function setTemplateState(string $type, bool $isEnabled)
    {
        $templates = MailHelper::getDefaultTemplates();
        $templates[$type]['is_enabled'] = $isEnabled;
        
        Setting::updateOrCreate(
            ['key' => 'email_templates'],
            ['value' => json_encode($templates)]
        );
    }

    public function test_approval_email_toggles()
    {
        $user = User::factory()->create();

        // ON
        $this->setTemplateState('approval', true);
        MailHelper::sendApprovalEmail($user);
        Mail::assertSent(GenericMailable::class, 1);

        // OFF
        Mail::fake();
        $this->setTemplateState('approval', false);
        MailHelper::sendApprovalEmail($user);
        Mail::assertNothingSent();
    }

    public function test_rejection_email_toggles()
    {
        $user = User::factory()->create();

        // ON
        $this->setTemplateState('rejection', true);
        MailHelper::sendRejectionEmail($user);
        Mail::assertSent(GenericMailable::class, 1);

        // OFF
        Mail::fake();
        $this->setTemplateState('rejection', false);
        MailHelper::sendRejectionEmail($user);
        Mail::assertNothingSent();
    }

    public function test_transaction_email_toggles()
    {
        $user = User::factory()->create();
        $member = new Member([
            'id' => 'm_' . Str::random(8),
            'user_id' => $user->id,
            'first_name' => 'John',
            'last_name' => 'Doe',
            'email' => 'member@example.com',
            'member_type' => 'adult',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'status' => 'active',
            'credit' => 100,
            'grade' => 'A',
            'bi_member_id' => 'test'
        ]);
        $transaction = new Transaction([
            'id' => 'tx_' . Str::random(8),
            'member_id' => $member->id,
            'type' => 'credit',
            'amount' => 100,
            'description' => 'Test Transaction',
            'date' => now()
        ]);

        // ON
        $this->setTemplateState('transaction', true);
        MailHelper::sendTransactionEmail($member, $transaction);
        Mail::assertSent(GenericMailable::class, 1);

        // OFF
        Mail::fake();
        $this->setTemplateState('transaction', false);
        MailHelper::sendTransactionEmail($member, $transaction);
        Mail::assertNothingSent();
    }

    public function test_schedule_email_toggles()
    {
        $user = User::factory()->create();
        $member = new Member([
            'id' => 'm_' . Str::random(8),
            'user_id' => $user->id,
            'first_name' => 'John',
            'last_name' => 'Doe',
            'email' => 'member@example.com',
            'member_type' => 'adult',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'status' => 'active',
            'credit' => 100,
            'grade' => 'A',
            'bi_member_id' => 'test'
        ]);
        $schedule = new PlaySchedule([
            'id' => 's_' . Str::random(8),
            'parent_id' => 's_parent',
            'repeat_weeks' => 1,
            'name' => 'Test Schedule',
            'date' => now()->addDays(2),
            'courts' => 2,
            'players' => 10,
            'slot_hours' => 2,
            'slot_duration' => '2 Hours',
            'session_rate' => 10,
            'hall_rate' => 50,
            'location' => 'Main Hall',
            'status' => 'open'
        ]);

        // ON
        $this->setTemplateState('schedule', true);
        MailHelper::sendScheduleNotification($member, $schedule, 'accepted', 'release');
        Mail::assertSent(GenericMailable::class, 1);

        // OFF
        Mail::fake();
        $this->setTemplateState('schedule', false);
        MailHelper::sendScheduleNotification($member, $schedule, 'accepted', 'release');
        Mail::assertNothingSent();
    }

    public function test_training_email_toggles()
    {
        $user = User::factory()->create();
        $member = new Member([
            'id' => 'm_' . Str::random(8),
            'user_id' => $user->id,
            'first_name' => 'John',
            'last_name' => 'Doe',
            'email' => 'member@example.com',
            'member_type' => 'adult',
            'sex' => 'male',
            'dob' => '1990-01-01',
            'status' => 'active',
            'credit' => 100,
            'grade' => 'A',
            'bi_member_id' => 'test'
        ]);
        $training = new Training([
            'id' => 'tr_' . Str::random(8),
            'name' => 'Test Training',
            'start_date' => now()->addDays(2),
            'end_date' => now()->addDays(10),
            'sessions' => 4,
            'slots' => 10,
            'duration' => '1 Hour',
            'fees' => 100,
            'coach' => 'Coach Lee',
            'location' => 'Main Hall',
            'status' => 'open'
        ]);

        // ON
        $this->setTemplateState('training', true);
        MailHelper::sendTrainingNotification($member, [$training], 'open', 'release');
        Mail::assertSent(GenericMailable::class, 1);

        // OFF
        Mail::fake();
        $this->setTemplateState('training', false);
        MailHelper::sendTrainingNotification($member, [$training], 'open', 'release');
        Mail::assertNothingSent();
    }

    public function test_registration_email_toggles()
    {
        $user = User::factory()->create();

        // ON
        $this->setTemplateState('registration', true);
        MailHelper::sendRegistrationEmail($user);
        Mail::assertSent(GenericMailable::class, 1);

        // OFF
        Mail::fake();
        $this->setTemplateState('registration', false);
        MailHelper::sendRegistrationEmail($user);
        Mail::assertNothingSent();
    }

    public function test_reset_password_otp_email_toggles()
    {
        $user = User::factory()->create();

        // ON
        $this->setTemplateState('reset_password', true);
        MailHelper::sendPasswordResetOtpEmail($user, '123456');
        Mail::assertSent(GenericMailable::class, 1);

        // OFF
        Mail::fake();
        $this->setTemplateState('reset_password', false);
        MailHelper::sendPasswordResetOtpEmail($user, '123456');
        Mail::assertNothingSent();
    }

    public function test_reset_password_success_email_toggles()
    {
        $user = User::factory()->create();

        // ON
        $this->setTemplateState('reset_password_success', true);
        MailHelper::sendPasswordResetSuccessEmail($user);
        Mail::assertSent(GenericMailable::class, 1);

        // OFF
        Mail::fake();
        $this->setTemplateState('reset_password_success', false);
        MailHelper::sendPasswordResetSuccessEmail($user);
        Mail::assertNothingSent();
    }
}
