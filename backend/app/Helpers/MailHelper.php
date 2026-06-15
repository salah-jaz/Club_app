<?php

namespace App\Helpers;

use App\Models\Setting;
use Illuminate\Support\Facades\Mail;

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

    public static function sendEmail($to, $subject, $content)
    {
        $html = self::renderWithTemplate($subject, $content);
        
        Mail::html($html, function ($message) use ($to, $subject) {
            $message->to($to)->subject($subject);
        });
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
        $typeLabel = $transaction->type === 'credit' ? 'Credited' : 'Debited';
        $color = $transaction->type === 'credit' ? '#34D399' : '#EF4444';
        
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
        $subject = "Play Schedule Notification: " . $schedule->name;
        $title = $actionType === 'release' ? 'New Schedule Released' : 'Schedule Updated';
        
        $content = "
            <h2 style=\"color: #34D399; font-size: 18px; margin-top: 0;\">$title</h2>
            <p>Hello {$member->first_name},</p>
            <p>The play schedule <strong>{$schedule->name}</strong> has been {$actionType}d by the club.</p>
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
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Status:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold; text-transform: uppercase;\">$status</td>
                </tr>
            </table>
        ";
        self::sendEmail($member->email, $subject, $content);
    }

    public static function sendTrainingNotification($member, $training, $status, $actionType = 'update')
    {
        $subject = "Training Session Notification: " . $training->name;
        $title = $actionType === 'release' ? 'New Training Session Released' : 'Training Session Updated';
        
        $content = "
            <h2 style=\"color: #34D399; font-size: 18px; margin-top: 0;\">$title</h2>
            <p>Hello {$member->first_name},</p>
            <p>The training course <strong>{$training->name}</strong> has been {$actionType}d by the club.</p>
            <table style=\"width: 100%; border-collapse: collapse; margin-top: 15px;\">
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Coach:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;\">{$training->coach}</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Start Date:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;\">{$training->start_date}</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Location:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold;\">{$training->location}</td>
                </tr>
                <tr>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #8A9E98;\">Status:</td>
                    <td style=\"padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); font-weight: bold; text-transform: uppercase;\">$status</td>
                </tr>
            </table>
        ";
        self::sendEmail($member->email, $subject, $content);
    }
}
