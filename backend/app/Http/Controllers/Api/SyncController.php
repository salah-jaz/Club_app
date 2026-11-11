<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SyncController extends Controller
{
    /**
     * Safely extract JSON payload from a controller response.
     * Permission-denied or error responses become empty arrays so sync never 500s.
     */
    private function safeData(mixed $response, mixed $fallback = []): mixed
    {
        if (!$response instanceof JsonResponse) {
            return $fallback;
        }

        if ($response->getStatusCode() >= 400) {
            return $fallback;
        }

        try {
            return $response->getData(true);
        } catch (\Throwable $e) {
            return $fallback;
        }
    }

    public function index(Request $request)
    {
        $memberCtrl = app(MemberController::class);
        $scheduleCtrl = app(PlayScheduleController::class);
        $trainingCtrl = app(TrainingController::class);
        $settingCtrl = app(SettingController::class);
        $creditCtrl = app(CreditRequestController::class);
        $leagueCtrl = app(LeagueGroupController::class);
        $fixtureCtrl = app(FixtureController::class);
        $userCtrl = app(UserController::class);
        $txnCtrl = app(TransactionController::class);

        $users = [];
        try {
            $users = $this->safeData($userCtrl->index($request), []);
        } catch (\Throwable $e) {
            $users = [];
        }

        $fixtures = [];
        try {
            $fixtures = $this->safeData($fixtureCtrl->index($request), []);
        } catch (\Throwable $e) {
            $fixtures = [];
        }

        $members = [];
        try {
            $members = $this->safeData($memberCtrl->index($request), []);
        } catch (\Throwable $e) {
            $members = [];
        }

        $creditRequests = [];
        try {
            $creditRequests = $this->safeData($creditCtrl->index($request), []);
        } catch (\Throwable $e) {
            $creditRequests = [];
        }

        $transactions = [];
        try {
            $transactions = $this->safeData($txnCtrl->index($request), []);
        } catch (\Throwable $e) {
            $transactions = [];
        }

        return response()->json([
            'members' => $members,
            'schedules' => $this->safeData($scheduleCtrl->index($request), []),
            'upcomingPlaySessions' => $this->safeData($scheduleCtrl->upcomingDashboardPlaySessions($request), []),
            'playInvites' => $this->safeData($scheduleCtrl->listInvitations($request), []),
            'trainings' => $this->safeData($trainingCtrl->index($request), []),
            'trainingInvites' => $this->safeData($trainingCtrl->listInvitations($request), []),
            'trainingDates' => $this->safeData($trainingCtrl->listDates($request), []),
            'trainingUpdateRequests' => $this->safeData($trainingCtrl->listUpdateRequests($request), []),
            'uniqueTrainingsCount' => $trainingCtrl->getUniqueTrainingsCount($request),
            'settings' => $this->safeData($settingCtrl->index(), []),
            'creditRequests' => $creditRequests,
            'transactions' => $transactions,
            'leagueGroups' => $this->safeData($leagueCtrl->index($request), []),
            'fixtures' => $fixtures,
            'users' => $users,
        ]);
    }
}
