<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Models\Grade;
use App\Models\Holiday;
use App\Models\Setting;
use Illuminate\Http\Request;

class SettingController extends Controller
{
    public function index()
    {
        $appName = Setting::where('key', 'app_name')->value('value') ?? 'ClubApp';
        $appLogoText = Setting::where('key', 'app_logo_text')->value('value') ?? 'C';
        $appLogoBase64 = Setting::where('key', 'app_logo_base64')->value('value') ?? null;
        $currency = Setting::where('key', 'currency')->value('value') ?? '$';

        $mailHost = Setting::where('key', 'mail_host')->value('value') ?? '';
        $mailPort = Setting::where('key', 'mail_port')->value('value') ?? '';
        $mailUsername = Setting::where('key', 'mail_username')->value('value') ?? '';
        $mailPassword = Setting::where('key', 'mail_password')->value('value') ?? '';
        $mailEncryption = Setting::where('key', 'mail_encryption')->value('value') ?? '';
        $mailFromAddress = Setting::where('key', 'mail_from_address')->value('value') ?? '';
        $mailFromName = Setting::where('key', 'mail_from_name')->value('value') ?? '';

        $emailPrimaryColor = Setting::where('key', 'email_primary_color')->value('value') ?? '#10B981';
        $emailBgColor = Setting::where('key', 'email_bg_color')->value('value') ?? '#0C0F0E';
        $emailTextColor = Setting::where('key', 'email_text_color')->value('value') ?? '#E8F0EE';
        $emailCardBgColor = Setting::where('key', 'email_card_bg_color')->value('value') ?? '#131916';
        $emailFooterText = Setting::where('key', 'email_footer_text')->value('value') ?? '';

        return response()->json([
            'locations' => Location::pluck('name')->toArray(),
            'grades' => Grade::pluck('name')->toArray(),
            'holidays' => Holiday::pluck('date')->toArray(),
            'appName' => $appName,
            'appLogoText' => $appLogoText,
            'appLogoBase64' => $appLogoBase64,
            'currency' => $currency,
            'mailHost' => $mailHost,
            'mailPort' => $mailPort,
            'mailUsername' => $mailUsername,
            'mailPassword' => $mailPassword,
            'mailEncryption' => $mailEncryption,
            'mailFromAddress' => $mailFromAddress,
            'mailFromName' => $mailFromName,
            'emailPrimaryColor' => $emailPrimaryColor,
            'emailBgColor' => $emailBgColor,
            'emailTextColor' => $emailTextColor,
            'emailCardBgColor' => $emailCardBgColor,
            'emailFooterText' => $emailFooterText,
        ]);
    }

    public function update(Request $request)
    {
        // Only admin can update settings
        if ($request->user()->role !== 'admin') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $request->validate([
            'appName' => 'sometimes|required|string|max:50',
            'appLogoText' => 'sometimes|required|string|max:10',
            'appLogoBase64' => 'nullable|string',
            'currency' => 'sometimes|required|string|max:10',
            'locations' => 'nullable|array',
            'locations.*' => 'required|string',
            'grades' => 'nullable|array',
            'grades.*' => 'required|string',
            'holidays' => 'nullable|array',
            'holidays.*' => 'required|date_format:Y-m-d',
            'mailHost' => 'nullable|string',
            'mailPort' => 'nullable|string',
            'mailUsername' => 'nullable|string',
            'mailPassword' => 'nullable|string',
            'mailEncryption' => 'nullable|string',
            'mailFromAddress' => 'nullable|string',
            'mailFromName' => 'nullable|string',
            'emailPrimaryColor' => 'nullable|string',
            'emailBgColor' => 'nullable|string',
            'emailTextColor' => 'nullable|string',
            'emailCardBgColor' => 'nullable|string',
            'emailFooterText' => 'nullable|string',
        ]);

        if ($request->has('appName')) {
            Setting::updateOrCreate(['key' => 'app_name'], ['value' => $request->appName]);
        }

        if ($request->has('appLogoText')) {
            Setting::updateOrCreate(['key' => 'app_logo_text'], ['value' => $request->appLogoText]);
        }

        if ($request->has('appLogoBase64')) {
            // Can be null if removing the image logo
            Setting::updateOrCreate(['key' => 'app_logo_base64'], ['value' => $request->appLogoBase64]);
        }

        if ($request->has('currency')) {
            Setting::updateOrCreate(['key' => 'currency'], ['value' => $request->currency]);
        }

        if ($request->has('mailHost')) {
            Setting::updateOrCreate(['key' => 'mail_host'], ['value' => $request->mailHost]);
        }

        if ($request->has('mailPort')) {
            Setting::updateOrCreate(['key' => 'mail_port'], ['value' => $request->mailPort]);
        }

        if ($request->has('mailUsername')) {
            Setting::updateOrCreate(['key' => 'mail_username'], ['value' => $request->mailUsername]);
        }

        if ($request->has('mailPassword')) {
            Setting::updateOrCreate(['key' => 'mail_password'], ['value' => $request->mailPassword]);
        }

        if ($request->has('mailEncryption')) {
            Setting::updateOrCreate(['key' => 'mail_encryption'], ['value' => $request->mailEncryption]);
        }

        if ($request->has('mailFromAddress')) {
            Setting::updateOrCreate(['key' => 'mail_from_address'], ['value' => $request->mailFromAddress]);
        }

        if ($request->has('mailFromName')) {
            Setting::updateOrCreate(['key' => 'mail_from_name'], ['value' => $request->mailFromName]);
        }

        if ($request->has('emailPrimaryColor')) {
            Setting::updateOrCreate(['key' => 'email_primary_color'], ['value' => $request->emailPrimaryColor]);
        }

        if ($request->has('emailBgColor')) {
            Setting::updateOrCreate(['key' => 'email_bg_color'], ['value' => $request->emailBgColor]);
        }

        if ($request->has('emailTextColor')) {
            Setting::updateOrCreate(['key' => 'email_text_color'], ['value' => $request->emailTextColor]);
        }

        if ($request->has('emailCardBgColor')) {
            Setting::updateOrCreate(['key' => 'email_card_bg_color'], ['value' => $request->emailCardBgColor]);
        }

        if ($request->has('emailFooterText')) {
            Setting::updateOrCreate(['key' => 'email_footer_text'], ['value' => $request->emailFooterText]);
        }

        // Synchronize Locations
        if ($request->has('locations')) {
            $newLocations = $request->locations;
            // Delete locations not in list
            Location::whereNotIn('name', $newLocations)->delete();
            // Create missing locations
            foreach ($newLocations as $name) {
                Location::firstOrCreate(['name' => $name]);
            }
        }

        // Synchronize Grades
        if ($request->has('grades')) {
            $newGrades = $request->grades;
            Grade::whereNotIn('name', $newGrades)->delete();
            foreach ($newGrades as $name) {
                Grade::firstOrCreate(['name' => $name]);
            }
        }

        // Synchronize Holidays
        if ($request->has('holidays')) {
            $newHolidays = $request->holidays;
            Holiday::whereNotIn('date', $newHolidays)->delete();
            foreach ($newHolidays as $date) {
                Holiday::firstOrCreate(['date' => $date], ['name' => 'Holiday']);
            }
        }

        return $this->index();
    }
}
