<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Location;
use App\Models\Grade;
use App\Models\Holiday;

class SettingController extends Controller
{
    public function index()
    {
        return response()->json([
            'locations' => Location::pluck('name')->toArray(),
            'grades' => Grade::pluck('name')->toArray(),
            'holidays' => Holiday::pluck('date')->toArray(),
        ]);
    }
}
