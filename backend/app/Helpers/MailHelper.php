<?php

namespace App\Helpers;

use App\Models\Setting;
use Illuminate\Support\Facades\Mail;
use App\Mail\GenericMailable;

class MailHelper
{
    /**
     * Helper to render custom HTML wrapped in the global email template.
     */
    public static function renderWithTemplate($subject, $content)
    {
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubConnect';
        $primaryColor = Setting::where('key', 'email_primary_color')->value('value') ?? '#10B981';
        $bgColor = Setting::where('key', 'email_bg_color')->value('value') ?? '#0C0F0E';
        $textColor = Setting::where('key', 'email_text_color')->value('value') ?? '#E8F0EE';
        $cardBgColor = Setting::where('key', 'email_card_bg_color')->value('value') ?? '#131916';
        $footerText = Setting::where('key', 'email_footer_text')->value('value') ?? ("© " . date('Y') . " " . $appName . ". All rights reserved.");

        // Global base template wrapper with placeholder for logo
        $template = "
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset=\"utf-8\">
            <title>$subject</title>
        </head>
        <body style=\"margin: 0; padding: 0; background-color: $bgColor; color: $textColor; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;\">
            <table align=\"center\" border=\"0\" cellpadding=\"0\" cellspacing=\"0\" width=\"100%\" style=\"max-width: 600px; margin: 40px auto; padding: 20px;\">
                <tr>
                    <td align=\"center\" style=\"padding-bottom: 30px;\">
                        <!--APP_LOGO_HTML-->
                        <h1 style=\"font-size: 22px; margin-top: 15px; margin-bottom: 5px; font-weight: normal; color: $textColor;\">$appName</h1>
                    </td>
                </tr>
                <tr>
                    <td style=\"background-color: $cardBgColor; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; padding: 30px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);\">
                        $content
                    </td>
                </tr>
                <tr>
                    <td align=\"center\" style=\"padding-top: 30px; font-size: 11px; color: #8A9E98; line-height: 1.5;\">
                        $footerText
                    </td>
                </tr>
            </table>
        </body>
        </html>
        ";

        return $template;
    }

    public static function applySmtpSettings($customSettings = null)
    {
        if (app()->environment('testing')) {
            return;
        }
        $host = $customSettings ? ($customSettings['mailHost'] ?? null) : Setting::where('key', 'mail_host')->value('value');
        if ($host) {
            $port = $customSettings ? ($customSettings['mailPort'] ?? null) : Setting::where('key', 'mail_port')->value('value');
            $encryption = $customSettings ? ($customSettings['mailEncryption'] ?? null) : Setting::where('key', 'mail_encryption')->value('value');
            $username = $customSettings ? ($customSettings['mailUsername'] ?? null) : Setting::where('key', 'mail_username')->value('value');
            $password = $customSettings ? ($customSettings['mailPassword'] ?? null) : Setting::where('key', 'mail_password')->value('value');
            $fromAddress = $customSettings ? ($customSettings['mailFromAddress'] ?? null) : Setting::where('key', 'mail_from_address')->value('value');
            $fromName = $customSettings ? ($customSettings['mailFromName'] ?? null) : Setting::where('key', 'mail_from_name')->value('value');

            config([
                'mail.default' => 'smtp',
                'mail.mailers.smtp.transport' => 'smtp',
                'mail.mailers.smtp.host' => $host,
                'mail.mailers.smtp.port' => (int) ($port ?? 587),
                'mail.mailers.smtp.encryption' => $encryption ?? 'tls',
                'mail.mailers.smtp.username' => $username,
                'mail.mailers.smtp.password' => $password,
                'mail.from.address' => $fromAddress ?? 'noreply@clubconnect.com',
                'mail.from.name' => $fromName ?? 'ClubConnect',
            ]);
        }
    }

    public static function sendEmail($to, $subject, $content)
    {
        self::applySmtpSettings();
        $html = self::renderWithTemplate($subject, $content);
        
        Mail::to($to)->send(new GenericMailable($subject, $html));
    }

    public static function compileTemplateHtml(string $type, array $tpl): string
    {
        $primaryColor = Setting::where('key', 'email_primary_color')->value('value') ?? '#10B981';
        $heading = $tpl['heading'] ?? '';
        $message = $tpl['message'] ?? '';
        $buttonText = $tpl['button_text'] ?? ($tpl['buttonText'] ?? '');

        if (empty(trim($message))) {
            return $tpl['body'] ?? '';
        }

        $paragraphs = array_filter(array_map('trim', explode("\n\n", str_replace("\r\n", "\n", $message))));
        $paragraphsHtml = '';
        foreach ($paragraphs as $p) {
            $paragraphsHtml .= '<p style="margin: 12px 0; line-height: 1.6;">' . nl2br(htmlspecialchars($p, ENT_NOQUOTES, 'UTF-8')) . '</p>' . "\n";
        }

        $headingColor = $type === 'rejection' ? '#EF4444' : ($type === 'transaction' ? '{type_color}' : $primaryColor);
        $headingHtml = !empty(trim($heading)) ? '<h2 style="color: ' . $headingColor . '; font-size: 18px; margin-top: 0; font-weight: bold;">' . htmlspecialchars($heading, ENT_NOQUOTES, 'UTF-8') . '</h2>' . "\n" : '';

        $extraHtml = '';
        if ($type === 'approval') {
            $btn = $buttonText ?: 'Log In to Portal';
            $extraHtml = "\n" . '<div style="margin-top: 25px; text-align: center;"><a href="{portal_url}" style="display: inline-block; background-color: ' . $primaryColor . '; color: #0C0F0E; font-weight: bold; text-decoration: none; padding: 10px 20px; border-radius: 4px;">' . htmlspecialchars($btn, ENT_NOQUOTES, 'UTF-8') . '</a></div>';
        } else if ($type === 'transaction') {
            $extraHtml = "\n" . '<table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;">Description:</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;">{description}</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;">Type:</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold; color: {type_color};">{type}</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;">Amount:</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;">{amount}</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;">Account Balance:</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;">{balance}</td></tr>
</table>';
        } else if ($type === 'schedule') {
            $extraHtml = "\n" . '<table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;">Date:</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;">{date}</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;">Location:</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;">{location}</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;">Session Fee:</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;">{fee}</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;">Status:</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold; text-transform: uppercase;">{status}</td></tr>
</table>';
        } else if ($type === 'training') {
            $extraHtml = "\n" . '<table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98; vertical-align: top;">Coach:</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;">{coach}</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98; vertical-align: top;">Location:</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;">{location}</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98; vertical-align: top;">{date_label}</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">{dates_html}</td></tr>
    <tr><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98; vertical-align: top;">Status:</td><td style="padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold; text-transform: uppercase;">{status}</td></tr>
</table>';
        } else if ($type === 'reset_password') {
            $extraHtml = "\n" . '<div style="margin: 20px 0; text-align: center; background: rgba(255,255,255,0.03); padding: 16px; border-radius: 6px; border: 1px dashed ' . $primaryColor . ';"><span style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: ' . $primaryColor . ';">{otp}</span></div><p style="font-size: 12px; color: #8A9E98; margin-top: 15px;">This OTP code will expire in 15 minutes. If you did not request a password reset, please ignore this email.</p>';
        } else if ($type === 'reset_password_success') {
            $btn = $buttonText ?: 'Sign In to Account';
            $extraHtml = "\n" . '<div style="margin-top: 25px; text-align: center;"><a href="{portal_url}" style="display: inline-block; background-color: ' . $primaryColor . '; color: #0C0F0E; font-weight: bold; text-decoration: none; padding: 10px 20px; border-radius: 4px;">' . htmlspecialchars($btn, ENT_NOQUOTES, 'UTF-8') . '</a></div><p style="font-size: 12px; color: #8A9E98; margin-top: 20px;">If you did not perform this action, please contact the club administrator immediately.</p>';
        }

        return $headingHtml . $paragraphsHtml . $extraHtml;
    }

    public static function getDefaultTemplates(): array
    {
        $primaryColor = Setting::where('key', 'email_primary_color')->value('value') ?? '#10B981';

        $defaults = [
            'registration' => [
                'name' => 'Registration Received',
                'description' => 'Sent to newly registered members notifying them their account is pending review.',
                'subject' => 'Account Registration Received',
                'heading' => 'Registration Received',
                'message' => "Hello {name},\n\nThank you for registering your account with {app_name}.\n\nYour registration details have been received and are currently awaiting review by the club administrator. You will receive another email notification once your account is reviewed.",
                'variables' => ['name', 'first_name', 'email', 'app_name', 'portal_url'],
            ],
            'approval' => [
                'name' => 'Account Approved',
                'description' => 'Sent to member when admin approves their registration request.',
                'subject' => 'Your Account Has Been Approved!',
                'heading' => 'Account Approved',
                'message' => "Hello {name},\n\nGreat news! Your account has been reviewed and approved by the club administrator.\n\nYou can now log in to the club portal and access the dashboard, book schedules, and join training sessions.",
                'button_text' => 'Log In to Portal',
                'variables' => ['name', 'first_name', 'email', 'app_name', 'portal_url'],
            ],
            'rejection' => [
                'name' => 'Account Rejected',
                'description' => 'Sent to applicant when admin declines their registration.',
                'subject' => 'Account Registration Status',
                'heading' => 'Account Registration',
                'message' => "Hello {name},\n\nThank you for your interest. We regret to inform you that your registration request has been declined at this time.\n\nIf you have any questions or believe this was in error, please contact the club administrator.",
                'variables' => ['name', 'first_name', 'email', 'app_name', 'portal_url'],
            ],
            'transaction' => [
                'name' => 'Transaction Alert',
                'description' => 'Sent to member when wallet credit recharge, debit, or refund is recorded.',
                'subject' => 'New Account Transaction Alert',
                'heading' => 'Transaction Alert',
                'message' => "Hello {name},\n\nA new transaction has been recorded on your member account.",
                'variables' => ['name', 'first_name', 'description', 'type', 'amount', 'balance', 'currency', 'app_name', 'portal_url'],
            ],
            'schedule' => [
                'name' => 'Play Schedule Notification',
                'description' => 'Sent to accepted/invited members when play schedules are released or updated.',
                'subject' => 'Play Schedule Notification: {schedule_name}',
                'heading' => '{title}',
                'message' => "Hello {name},\n\nThe play schedule {schedule_name} has been {action_verb} by the club.",
                'variables' => ['name', 'first_name', 'schedule_name', 'date', 'location', 'fee', 'status', 'title', 'action_verb', 'app_name', 'portal_url'],
            ],
            'training' => [
                'name' => 'Training Session Notification',
                'description' => 'Sent to members when training programs are released or updated.',
                'subject' => 'Training Session Notification: {program_name}',
                'heading' => '{title}',
                'message' => "Hello {name},\n\nThe training course {program_name} has been {action_verb} by the club.",
                'variables' => ['name', 'first_name', 'program_name', 'coach', 'location', 'dates_html', 'date_label', 'status', 'title', 'action_verb', 'app_name', 'portal_url'],
            ],
            'reset_password' => [
                'name' => 'Password Reset Verification (OTP)',
                'description' => 'Sent to users requesting password reset with a 6-digit OTP code.',
                'subject' => 'Password Reset Verification Code',
                'heading' => 'Reset Password Request',
                'message' => "Hello {name},\n\nWe received a request to reset your password for your account.\n\nYour 6-digit verification code (OTP) is:",
                'variables' => ['name', 'first_name', 'otp', 'app_name', 'portal_url'],
            ],
            'reset_password_success' => [
                'name' => 'Password Reset Success',
                'description' => 'Sent to users confirming their password was changed successfully.',
                'subject' => 'Password Reset Successfully',
                'heading' => 'Password Reset Successfully',
                'message' => "Hello {name},\n\nYour password for your account has been successfully reset.\n\nYou can now sign in to your account using your new password.",
                'button_text' => 'Sign In to Account',
                'variables' => ['name', 'first_name', 'app_name', 'portal_url'],
            ],
        ];

        foreach ($defaults as $type => &$def) {
            $def['body'] = self::compileTemplateHtml($type, $def);
        }

        return $defaults;
    }

    public static function getTemplate(string $type): array
    {
        $defaults = self::getDefaultTemplates();
        $default = $defaults[$type] ?? [
            'name' => $type,
            'description' => '',
            'subject' => 'Notification',
            'heading' => 'Notification',
            'message' => 'Hello {name},',
            'body' => '<p>Hello {name},</p>',
            'variables' => ['name', 'first_name', 'app_name', 'portal_url'],
        ];

        $raw = Setting::where('key', 'email_templates')->value('value');
        if ($raw) {
            $saved = json_decode($raw, true);
            if (is_array($saved) && isset($saved[$type]) && is_array($saved[$type])) {
                $custom = $saved[$type];
                $merged = [
                    'name' => $default['name'],
                    'description' => $default['description'],
                    'subject' => !empty(trim($custom['subject'] ?? '')) ? $custom['subject'] : $default['subject'],
                    'heading' => isset($custom['heading']) ? $custom['heading'] : ($default['heading'] ?? ''),
                    'message' => isset($custom['message']) ? $custom['message'] : ($default['message'] ?? ''),
                    'button_text' => $custom['button_text'] ?? ($custom['buttonText'] ?? ($default['button_text'] ?? '')),
                    'variables' => $default['variables'],
                ];

                if (!empty(trim($merged['message']))) {
                    $merged['body'] = self::compileTemplateHtml($type, $merged);
                } else {
                    $merged['body'] = !empty(trim($custom['body'] ?? '')) ? $custom['body'] : $default['body'];
                }

                return $merged;
            }
        }

        return $default;
    }

    public static function interpolate(string $text, array $variables): string
    {
        foreach ($variables as $key => $value) {
            $val = is_scalar($value) ? (string)$value : '';
            $text = str_replace(["{{$key}}", "{ {$key} }"], $val, $text);
        }
        return $text;
    }

    public static function sendApprovalEmail($user)
    {
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubConnect';
        $tpl = self::getTemplate('approval');
        $vars = [
            'name' => trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')),
            'first_name' => $user->first_name ?? 'Member',
            'email' => $user->email ?? '',
            'app_name' => $appName,
            'portal_url' => url('/'),
        ];
        $subject = self::interpolate($tpl['subject'], $vars);
        $content = self::interpolate($tpl['body'], $vars);
        self::sendEmail($user->email, $subject, $content);
    }

    public static function sendRejectionEmail($user)
    {
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubConnect';
        $tpl = self::getTemplate('rejection');
        $vars = [
            'name' => trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')),
            'first_name' => $user->first_name ?? 'Member',
            'email' => $user->email ?? '',
            'app_name' => $appName,
            'portal_url' => url('/'),
        ];
        $subject = self::interpolate($tpl['subject'], $vars);
        $content = self::interpolate($tpl['body'], $vars);
        self::sendEmail($user->email, $subject, $content);
    }

    public static function sendTransactionEmail($member, $transaction)
    {
        $currency = Setting::where('key', 'currency')->value('value') ?? '$';
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubConnect';
        $isRefund = $transaction->type === 'refund';
        $isInflow = in_array($transaction->type, ['credit', 'refund'], true);
        $typeLabel = $isRefund ? 'Refunded' : ($isInflow ? 'Credited' : 'Debited');
        $color = $isInflow ? '#34D399' : '#EF4444';
        
        $tpl = self::getTemplate('transaction');
        $vars = [
            'name' => trim(($member->first_name ?? '') . ' ' . ($member->last_name ?? '')),
            'first_name' => $member->first_name ?? 'Member',
            'description' => $transaction->description ?? 'Wallet transaction',
            'type' => $typeLabel,
            'type_color' => $color,
            'amount' => $currency . number_format((float)($transaction->amount ?? 0), 2),
            'balance' => $currency . number_format((float)($member->credit ?? 0), 2),
            'currency' => $currency,
            'app_name' => $appName,
            'portal_url' => url('/'),
        ];
        $subject = self::interpolate($tpl['subject'], $vars);
        $content = self::interpolate($tpl['body'], $vars);
        self::sendEmail($member->email, $subject, $content);
    }

    public static function sendScheduleNotification($member, $schedule, $status, $actionType = 'update')
    {
        $currency = Setting::where('key', 'currency')->value('value') ?? '$';
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubConnect';
        $isUpdate = in_array($actionType, ['update', 'update_request'], true);
        $title = $actionType === 'release' ? 'New Schedule Released' : 'Schedule Updated';
        $actionVerb = $actionType === 'release' ? 'released' : 'updated';
        
        $estimatedFee = FeeHelper::playSessionFee(
            (float)($schedule->session_rate ?? 0),
            0,
            1,
            $member
        );
        $feeFormatted = $currency . number_format($estimatedFee, 2);

        $tpl = self::getTemplate('schedule');
        $vars = [
            'name' => trim(($member->first_name ?? '') . ' ' . ($member->last_name ?? '')),
            'first_name' => $member->first_name ?? 'Member',
            'schedule_name' => $schedule->name ?? 'Play Schedule',
            'date' => $schedule->date ?? '',
            'location' => $schedule->location ?? '',
            'fee' => $feeFormatted,
            'status' => $status,
            'title' => $title,
            'action_verb' => $actionVerb,
            'app_name' => $appName,
            'portal_url' => url('/'),
        ];
        $subject = self::interpolate($tpl['subject'], $vars);
        $content = self::interpolate($tpl['body'], $vars);
        self::sendEmail($member->email, $subject, $content);
    }

    public static function sendRegistrationEmail($user)
    {
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubConnect';
        $tpl = self::getTemplate('registration');
        $vars = [
            'name' => trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')),
            'first_name' => $user->first_name ?? 'Member',
            'email' => $user->email ?? '',
            'app_name' => $appName,
            'portal_url' => url('/'),
        ];
        $subject = self::interpolate($tpl['subject'], $vars);
        $content = self::interpolate($tpl['body'], $vars);
        self::sendEmail($user->email, $subject, $content);
    }

    public static function sendTrainingNotification($member, $trainings, $status = 'open', $actionType = 'release')
    {
        if (empty($trainings)) {
            return;
        }

        if ($trainings instanceof \Illuminate\Support\Collection) {
            $trainingsList = $trainings->all();
        } elseif (is_array($trainings)) {
            $trainingsList = $trainings;
        } else {
            $trainingsList = [$trainings];
        }

        if (count($trainingsList) === 0) {
            return;
        }

        $firstTraining = $trainingsList[0];
        if (count($trainingsList) === 1) {
            $programName = $firstTraining->name ?: \Carbon\Carbon::parse($firstTraining->start_date)->format('l · M j, Y · g:i A');
        } else {
            $parentId = $firstTraining->parent_id ?: $firstTraining->id;
            $parentObj = \App\Models\Training::find($parentId);
            $programName = ($parentObj ? $parentObj->name : $firstTraining->name) ?: \Carbon\Carbon::parse($firstTraining->start_date)->format('l · M j, Y · g:i A');
        }

        $coach = $firstTraining->coach ?: 'N/A';
        $location = $firstTraining->location ?: 'N/A';
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubConnect';

        $isUpdate = in_array($actionType, ['update', 'update_request'], true);
        $title = $actionType === 'update_request' ? 'Training Session Update Requested' : ($isUpdate ? 'Training Session Updated' : 'New Training Session Released');
        $actionVerb = $isUpdate ? 'updated' : 'released';

        if (count($trainingsList) === 1) {
            $dateFormatted = \Carbon\Carbon::parse($firstTraining->start_date)->format('l · M j, Y · g:i A');
            $datesHtml = "<span style=\"font-weight: bold;\">{$dateFormatted}</span>";
        } else {
            $dateItems = [];
            foreach ($trainingsList as $tr) {
                $dStr = \Carbon\Carbon::parse($tr->start_date)->format('l · M j, Y · g:i A');
                $dateItems[] = "<li style=\"margin-bottom: 4px; color: #34D399;\"><strong style=\"color: #E8F0EE;\">{$dStr}</strong></li>";
            }
            $datesHtml = "<ul style=\"margin: 4px 0 0 0; padding-left: 18px;\">" . implode('', $dateItems) . "</ul>";
        }

        $dateLabel = count($trainingsList) > 1 ? 'Checked Session Dates:' : 'Date:';

        $tpl = self::getTemplate('training');
        $vars = [
            'name' => trim(($member->first_name ?? '') . ' ' . ($member->last_name ?? '')),
            'first_name' => $member->first_name ?? 'Member',
            'program_name' => $programName,
            'coach' => $coach,
            'location' => $location,
            'date_label' => $dateLabel,
            'dates_html' => $datesHtml,
            'status' => $status,
            'title' => $title,
            'action_verb' => $actionVerb,
            'app_name' => $appName,
            'portal_url' => url('/'),
        ];
        $subject = self::interpolate($tpl['subject'], $vars);
        $content = self::interpolate($tpl['body'], $vars);
        self::sendEmail($member->email, $subject, $content);
    }

    public static function sendPasswordResetOtpEmail($user, $otp)
    {
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubConnect';
        $tpl = self::getTemplate('reset_password');
        $vars = [
            'name' => trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')),
            'first_name' => $user->first_name ?? 'Member',
            'otp' => $otp,
            'app_name' => $appName,
            'portal_url' => url('/'),
        ];
        $subject = self::interpolate($tpl['subject'], $vars);
        $content = self::interpolate($tpl['body'], $vars);
        self::sendEmail($user->email, $subject, $content);
    }

    public static function sendPasswordResetSuccessEmail($user)
    {
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubConnect';
        $tpl = self::getTemplate('reset_password_success');
        $vars = [
            'name' => trim(($user->first_name ?? '') . ' ' . ($user->last_name ?? '')),
            'first_name' => $user->first_name ?? 'Member',
            'app_name' => $appName,
            'portal_url' => url('/'),
        ];
        $subject = self::interpolate($tpl['subject'], $vars);
        $content = self::interpolate($tpl['body'], $vars);
        self::sendEmail($user->email, $subject, $content);
    }
}

