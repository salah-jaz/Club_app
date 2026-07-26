<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class SyncController extends Controller
{
    public function index(Request $request)
    {
        $memberCtrl   = app(MemberController::class);
        $scheduleCtrl = app(PlayScheduleController::class);
        $trainingCtrl = app(TrainingController::class);
        $settingCtrl  = app(SettingController::class);
        $creditCtrl    = app(CreditRequestController::class);
        $leagueCtrl   = app(LeagueGroupController::class);
        $userCtrl     = app(UserController::class);

        $users = [];
        try {
            $usersResponse = $userCtrl->index($request);
            $users = $usersResponse->getData(true);
        } catch (\Throwable $e) {
            $users = [];
        }

        return response()->json([
            'members'           => $memberCtrl->index($request)->getData(true),
            'schedules'         => $scheduleCtrl->index()->getData(true),
            'playInvites'       => $scheduleCtrl->listInvitations()->getData(true),
            'trainings'         => $trainingCtrl->index()->getData(true),
            'trainingInvites'   => $trainingCtrl->listInvitations()->getData(true),
            'settings'          => $settingCtrl->index()->getData(true),
            'creditRequests'    => $creditCtrl->index()->getData(true),
            'leagueGroups'      => $leagueCtrl->index($request)->getData(true),
            'users'             => $users,
        ]);
    }
}
