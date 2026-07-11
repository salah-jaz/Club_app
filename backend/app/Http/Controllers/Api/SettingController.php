<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Models\Grade;
use App\Models\Holiday;
use App\Models\PlayerPosition;
use App\Models\Setting;
use App\Helpers\MailHelper;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    private $settingKeys = [
        'appName' => 'app_name',
        'appLogoText' => 'app_logo_text',
        'appLogoBase64' => 'app_logo_base64',
        'currency' => 'currency',
        'skipCreditConsumption' => 'skip_credit_consumption',
        'mailHost' => 'mail_host',
        'mailPort' => 'mail_port',
        'mailUsername' => 'mail_username',
        'mailPassword' => 'mail_password',
        'mailEncryption' => 'mail_encryption',
        'mailFromAddress' => 'mail_from_address',
        'mailFromName' => 'mail_from_name',
        'emailPrimaryColor' => 'email_primary_color',
        'emailBgColor' => 'email_bg_color',
        'emailTextColor' => 'email_text_color',
        'emailCardBgColor' => 'email_card_bg_color',
        'emailFooterText' => 'email_footer_text',
        'cancellationLockHours' => 'cancellation_lock_hours',
        'debitTimingHours' => 'debit_timing_hours',
    ];

    public function index()
    {
        $dbSettings = Setting::all()->pluck('value', 'key');

        $data = [
            'locations'       => Location::pluck('name')->toArray(),
            'grades'          => Grade::pluck('name')->toArray(),
            'holidays'        => Holiday::pluck('date')->toArray(),
            'playerPositions' => PlayerPosition::pluck('name')->toArray(),
        ];

        foreach ($this->settingKeys as $camel => $snake) {
            $val = $dbSettings->get($snake);
            if ($camel === 'skipCreditConsumption') {
                $data[$camel] = $val === 'true';
            } else if ($camel === 'cancellationLockHours' || $camel === 'debitTimingHours') {
                $data[$camel] = $val !== null ? (int)$val : null;
            } else {
                $data[$camel] = $val;
            }
        }

        // Apply fallback defaults if not set in DB
        if (empty($data['appName'])) $data['appName'] = 'Connect App';
        if (empty($data['appLogoText'])) $data['appLogoText'] = 'C';
        if (empty($data['appLogoBase64'])) $data['appLogoBase64'] = '/logo.png';
        if (empty($data['currency'])) $data['currency'] = '$';
        if ($data['cancellationLockHours'] === null) $data['cancellationLockHours'] = 24;
        if ($data['debitTimingHours'] === null) $data['debitTimingHours'] = 24;

        return response()->json($data);
    }

    public function update(Request $request)
    {
        // 1. Save standard settings
        foreach ($this->settingKeys as $camel => $snake) {
            if ($request->has($camel)) {
                $val = $request->input($camel);
                if ($camel === 'skipCreditConsumption') {
                    $val = $val ? 'true' : 'false';
                }
                Setting::updateOrCreate(['key' => $snake], ['value' => $val]);
            }
        }

        // 2. Save lists if provided
        if ($request->has('locations')) {
            $newLocations = $request->locations ?? [];
            Location::whereNotIn('name', $newLocations)->delete();
            $now = now();
            foreach ($newLocations as $loc) {
                Location::firstOrCreate(['name' => $loc], ['created_at' => $now, 'updated_at' => $now]);
            }
        }

        if ($request->has('grades')) {
            $newGrades = $request->grades ?? [];
            Grade::whereNotIn('name', $newGrades)->delete();
            $now = now();
            foreach ($newGrades as $g) {
                Grade::firstOrCreate(['name' => $g], ['created_at' => $now, 'updated_at' => $now]);
            }
        }

        if ($request->has('holidays')) {
            Holiday::truncate();
            $now = now();
            foreach ($request->holidays as $h) {
                Holiday::create(['date' => $h, 'created_at' => $now, 'updated_at' => $now]);
            }
        }

        if ($request->has('playerPositions')) {
            $newPositions = $request->playerPositions ?? [];
            PlayerPosition::whereNotIn('name', $newPositions)->delete();
            $now = now();
            foreach ($newPositions as $pos) {
                PlayerPosition::firstOrCreate(['name' => $pos], ['created_at' => $now, 'updated_at' => $now]);
            }
        }

        return $this->index();
    }

    public function testSmtp(Request $request)
    {
        $request->validate([
            'mailHost' => 'required|string',
            'mailPort' => 'required',
            'mailUsername' => 'nullable|string',
            'mailPassword' => 'nullable|string',
            'mailEncryption' => 'nullable|string',
            'mailFromAddress' => 'required|email',
            'mailFromName' => 'required|string',
            'testEmail' => 'sometimes|email',
        ]);

        try {
            MailHelper::applySmtpSettings([
                'mailHost' => $request->mailHost,
                'mailPort' => $request->mailPort,
                'mailEncryption' => $request->mailEncryption,
                'mailUsername' => $request->mailUsername,
                'mailPassword' => $request->mailPassword,
                'mailFromAddress' => $request->mailFromAddress,
                'mailFromName' => $request->mailFromName,
            ]);

            $to = $request->input('testEmail', $request->user()->email);
            $subject = "SMTP Test Connection Success";
            $content = "
                <h2 style=\"color: #34D399; font-size: 18px; margin-top: 0;\">SMTP Connection Successful!</h2>
                <p>Hello,</p>
                <p>This is a test email sent from the club portal settings panel.</p>
                <p>If you are reading this email, it means your SMTP server configurations are correct and working perfectly.</p>
            ";

            MailHelper::sendEmail($to, $subject, $content);

            return response()->json([
                'status' => 'success',
                'message' => 'Test email sent successfully to ' . $to,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
