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

        return response()->json([
            'locations' => Location::pluck('name')->toArray(),
            'grades' => Grade::pluck('name')->toArray(),
            'holidays' => Holiday::pluck('date')->toArray(),
            'appName' => $appName,
            'appLogoText' => $appLogoText,
            'appLogoBase64' => $appLogoBase64,
            'currency' => $currency,
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
