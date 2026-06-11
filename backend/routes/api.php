<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\MemberController;
use App\Http\Controllers\Api\CreditRequestController;
use App\Http\Controllers\Api\TransactionController;
use App\Http\Controllers\Api\PlayScheduleController;
use App\Http\Controllers\Api\TrainingController;
use App\Http\Controllers\Api\SettingController;
use Illuminate\Support\Facades\Route;

// Public auth routes
Route::post('/login', [AuthController::class, 'login']);
Route::post('/register', [AuthController::class, 'register']);

// Authenticated API routes
Route::middleware('auth:sanctum')->group(function () {
    // Session / Info
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    
    // Settings constants
    Route::get('/settings', [SettingController::class, 'index']);

    // User admin management
    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users/{id}/approve', [UserController::class, 'approve']);
    Route::post('/users/{id}/reject', [UserController::class, 'reject']);
    Route::patch('/users/{id}/role', [UserController::class, 'setRole']);

    // Members CRUD
    Route::get('/members', [MemberController::class, 'index']);
    Route::post('/members', [MemberController::class, 'store']);
    Route::patch('/members/{id}', [MemberController::class, 'update']);
    Route::delete('/members/{id}', [MemberController::class, 'destroy']);

    // Credit Requests
    Route::get('/credit-requests', [CreditRequestController::class, 'index']);
    Route::post('/credit-requests', [CreditRequestController::class, 'store']);
    Route::post('/credit-requests/{id}/approve', [CreditRequestController::class, 'approve']);
    Route::post('/credit-requests/{id}/reject', [CreditRequestController::class, 'reject']);

    // Transactions
    Route::get('/transactions', [TransactionController::class, 'index']);

    // Play Schedules & Rotations
    Route::get('/schedules', [PlayScheduleController::class, 'index']);
    Route::post('/schedules', [PlayScheduleController::class, 'store']);
    Route::patch('/schedules/{id}', [PlayScheduleController::class, 'update']);
    Route::post('/schedules/{id}/release', [PlayScheduleController::class, 'release']);
    Route::post('/schedules/{id}/close', [PlayScheduleController::class, 'close']);
    Route::post('/schedules/{id}/rotate', [PlayScheduleController::class, 'rotate']);
    
    // Play Invitations
    Route::get('/play-invitations', [PlayScheduleController::class, 'listInvitations']);
    Route::post('/play-invitations/{id}/respond', [PlayScheduleController::class, 'respondInvitation']);
    Route::get('/rotations', [PlayScheduleController::class, 'listRotations']);

    // Trainings & Dates & Attendance
    Route::get('/trainings', [TrainingController::class, 'index']);
    Route::post('/trainings', [TrainingController::class, 'store']);
    Route::patch('/trainings/{id}', [TrainingController::class, 'update']);
    Route::post('/trainings/{id}/release', [TrainingController::class, 'release']);
    
    // Training Invitations & Dates
    Route::get('/training-invitations', [TrainingController::class, 'listInvitations']);
    Route::post('/training-invitations/{id}/respond', [TrainingController::class, 'respondInvitation']);
    Route::get('/training-dates', [TrainingController::class, 'listDates']);
    Route::patch('/training-dates/{id}/attendance', [TrainingController::class, 'markAttendance']);
});
