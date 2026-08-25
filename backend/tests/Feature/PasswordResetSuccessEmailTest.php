<?php

namespace Tests\Feature;

use App\Models\User;
use App\Helpers\MailHelper;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class PasswordResetSuccessEmailTest extends TestCase
{
    use DatabaseTransactions;

    public function test_send_password_reset_success_email_sends_mail_with_correct_subject_and_content()
    {
        Mail::fake();

        $user = User::factory()->create([
            'first_name' => 'John',
            'email' => 'john.test@example.com',
        ]);

        MailHelper::sendPasswordResetSuccessEmail($user);

        Mail::assertSent(\App\Helpers\GenericMailable::class, function ($mail) use ($user) {
            return $mail->hasTo($user->email) &&
                   $mail->customSubject === 'Password Reset Successfully' &&
                   str_contains($mail->htmlContent, 'Password Reset Successfully') &&
                   str_contains($mail->htmlContent, 'Your password for your account has been successfully reset.');
        });
    }

    public function test_reset_password_api_triggers_success_email()
    {
        Mail::fake();

        $user = User::factory()->create([
            'email' => 'reset.test@example.com',
            'password' => Hash::make('oldpassword123'),
        ]);

        $otp = '123456';
        DB::table('password_reset_tokens')->updateOrInsert(
            ['email' => $user->email],
            [
                'token' => Hash::make($otp),
                'created_at' => now(),
            ]
        );

        $response = $this->postJson('/api/reset-password', [
            'email' => $user->email,
            'otp' => $otp,
            'password' => 'newpassword123',
            'password_confirmation' => 'newpassword123',
        ]);

        $response->assertStatus(200);
        $response->assertJson(['message' => 'Password reset successfully. You can now sign in with your new password.']);

        $this->assertTrue(Hash::check('newpassword123', $user->fresh()->password));

        Mail::assertSent(\App\Helpers\GenericMailable::class, function ($mail) use ($user) {
            return $mail->hasTo($user->email) &&
                   $mail->customSubject === 'Password Reset Successfully';
        });
    }
}
