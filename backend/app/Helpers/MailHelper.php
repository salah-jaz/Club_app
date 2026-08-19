<?php

namespace App\Helpers;

use App\Models\Setting;
use Illuminate\Support\Facades\Mail;
use Illuminate\Mail\Mailable;

class GenericMailable extends Mailable
{
    public string $customSubject;
    public string $htmlContent;

    public function __construct(string $customSubject, string $htmlContent)
    {
        $this->customSubject = $customSubject;
        $this->htmlContent = $htmlContent;
    }

    public function build()
    {
        return $this->subject($this->customSubject)->html($this->htmlContent);
    }
}

class MailHelper
{
    /**
     * Helper to render custom HTML wrapped in the global email template.
     */
    public static function renderWithTemplate($subject, $content)
    {
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubConnect';
        $appLogoText = Setting::where('key', 'app_logo_text')->value('value') ?? 'C';
        $appLogoBase64 = Setting::where('key', 'app_logo_base64')->value('value') ?? null;
        $primaryColor = Setting::where('key', 'email_primary_color')->value('value') ?? '#10B981';
        $bgColor = Setting::where('key', 'email_bg_color')->value('value') ?? '#0C0F0E';
        $textColor = Setting::where('key', 'email_text_color')->value('value') ?? '#E8F0EE';
        $cardBgColor = Setting::where('key', 'email_card_bg_color')->value('value') ?? '#131916';
        $footerText = Setting::where('key', 'email_footer_text')->value('value') ?? ("© " . date('Y') . " " . $appName . ". All rights reserved.");

        // Logo HTML
        $logoHtml = '';
        if ($appLogoBase64) {
            $logoHtml = "<img src=\"$appLogoBase64\" alt=\"$appName\" style=\"max-height: 48px; display: block; margin: 0 auto;\" />";
        } else {
            $logoHtml = "<div style=\"display: inline-block; padding: 8px 16px; background: $primaryColor; color: #000; font-weight: bold; font-size: 20px; border-radius: 4px; font-family: sans-serif;\">$appLogoText</div>";
        }

        // Global base template wrapper
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
                        $logoHtml
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

    public static function sendApprovalEmail($user)
    {
        $subject = "Your Account Has Been Approved!";
        $content = "
            <h2 style=\"color: #34D399; font-size: 18px; margin-top: 0;\">Account Approved</h2>
            <p>Hello {$user->first_name},</p>
            <p>Great news! Your account has been reviewed and approved by the club administrator.</p>
            <p>You can now log in to the club portal and access the dashboard, book schedules, and join training sessions.</p>
            <div style=\"margin-top: 25px; text-align: center;\">
                <a href=\"" . url('/') . "\" style=\"display: inline-block; background-color: #10B981; color: #0C0F0E; font-weight: bold; text-decoration: none; padding: 10px 20px; border-radius: 4px;\">Log In to Portal</a>
            </div>
        ";
        self::sendEmail($user->email, $subject, $content);
    }

    public static function sendRejectionEmail($user)
    {
        $subject = "Account Registration Status";
        $content = "
            <h2 style=\"color: #EF4444; font-size: 18px; margin-top: 0;\">Account Registration</h2>
            <p>Hello {$user->first_name},</p>
            <p>Thank you for your interest. We regret to inform you that your registration request has been declined at this time.</p>
            <p>If you have any questions or believe this was in error, please contact the club administrator.</p>
        ";
        self::sendEmail($user->email, $subject, $content);
    }

    public static function sendTransactionEmail($member, $transaction)
    {
        $subject = "New Account Transaction Alert";
        $isRefund = $transaction->type === 'refund';
        $isInflow = in_array($transaction->type, ['credit', 'refund'], true);
        $typeLabel = $isRefund ? 'Refunded' : ($isInflow ? 'Credited' : 'Debited');
        $color = $isInflow ? '#34D399' : '#EF4444';
        
        $content = "
            <h2 style=\"color: $color; font-size: 18px; margin-top: 0;\">Transaction Alert</h2>
            <p>Hello {$member->first_name},</p>
            <p>A new transaction has been recorded on your member account.</p>
            <table style=\"width: 100%; border-collapse: collapse; margin-top: 15px;\">
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Description:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;\">{$transaction->description}</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Type:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold; color: $color;\">$typeLabel</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Amount:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;\">\${$transaction->amount}</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Account Balance:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;\">\${$member->credit}</td>
                </tr>
            </table>
        ";
        self::sendEmail($member->email, $subject, $content);
    }

    public static function sendScheduleNotification($member, $schedule, $status, $actionType = 'update')
    {
        $isUpdate = in_array($actionType, ['update', 'update_request'], true);
        $subject = $isUpdate
            ? "Play Schedule Update Notification: " . $schedule->name
            : "Play Schedule Notification: " . $schedule->name;
        $title = $actionType === 'release' ? 'New Schedule Released' : 'Schedule Updated';
        $actionVerb = $actionType === 'release' ? 'released' : 'updated';
        
        $estimatedFee = FeeHelper::playSessionFee(
            (float)$schedule->session_rate,
            0,
            1,
            $member
        );
        $feeFormatted = '$' . number_format($estimatedFee, 2);

        $content = "
            <h2 style=\"color: #34D399; font-size: 18px; margin-top: 0;\">$title</h2>
            <p>Hello {$member->first_name},</p>
            <p>The play schedule <strong>{$schedule->name}</strong> has been {$actionVerb} by the club.</p>
            <table style=\"width: 100%; border-collapse: collapse; margin-top: 15px;\">
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Date:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;\">{$schedule->date}</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Location:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;\">{$schedule->location}</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Session Fee:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;\">{$feeFormatted}</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Status:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold; text-transform: uppercase;\">$status</td>
                </tr>
            </table>
        ";
        self::sendEmail($member->email, $subject, $content);
    }

    public static function sendRegistrationEmail($user)
    {
        $subject = "Account Registration Received";
        $content = "
            <h2 style=\"color: #34D399; font-size: 18px; margin-top: 0;\">Registration Received</h2>
            <p>Hello {$user->first_name},</p>
            <p>Thank you for registering your account with ClubConnect.</p>
            <p>Your registration details have been received and are currently awaiting review by the club administrator. You will receive another email notification once your account is reviewed.</p>
        ";
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

        $isUpdate = in_array($actionType, ['update', 'update_request'], true);

        if ($isUpdate) {
            $subject = "Training Session Update Notification: " . $programName;
            $title = $actionType === 'update_request' ? 'Training Session Update Requested' : 'Training Session Updated';
            $actionVerb = 'updated';
        } else {
            $subject = "Training Session Notification: " . $programName;
            $title = 'New Training Session Released';
            $actionVerb = 'released';
        }

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

        $content = "
            <h2 style=\"color: #34D399; font-size: 18px; margin-top: 0;\">$title</h2>
            <p>Hello {$member->first_name},</p>
            <p>The training course <strong>{$programName}</strong> has been {$actionVerb} by the club.</p>
            <table style=\"width: 100%; border-collapse: collapse; margin-top: 15px;\">
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98; vertical-align: top;\">Coach:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;\">{$coach}</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98; vertical-align: top;\">Location:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;\">{$location}</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98; vertical-align: top;\">{$dateLabel}</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06);\">{$datesHtml}</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98; vertical-align: top;\">Status:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold; text-transform: uppercase;\">$status</td>
                </tr>
            </table>
        ";

        self::sendEmail($member->email, $subject, $content);
    }
}
