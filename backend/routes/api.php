<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\MemberController;
use App\Http\Controllers\Api\CreditRequestController;
use App\Http\Controllers\Api\TransactionController;
use App\Http\Controllers\Api\PlayScheduleController;
use App\Http\Controllers\Api\TrainingController;
use App\Http\Controllers\Api\SettingController;
use App\Http\Controllers\Api\LeagueGroupController;
use App\Http\Controllers\Api\AdminRoleController;
use App\Http\Controllers\Api\AdminUserController;
use App\Http\Controllers\Api\SyncController;
use Illuminate\Support\Facades\Route;

// Public auth routes
Route::post('/login', [AuthController::class, 'login']);
Route::post('/register', [AuthController::class, 'register']);
Route::get('/settings', [SettingController::class, 'index']);

// Authenticated API routes
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/sync-data', [SyncController::class, 'index']);
    // Session / Info
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    
    // Settings constants
    Route::post('/settings', [SettingController::class, 'update']);
    Route::post('/settings/test-smtp', [SettingController::class, 'testSmtp']);

    // User admin management
    Route::get('/users', [UserController::class, 'index']);
    Route::post('/users/{id}/approve', [UserController::class, 'approve']);
    Route::post('/users/{id}/reject', [UserController::class, 'reject']);
    Route::patch('/users/{id}/role', [UserController::class, 'setRole']);

    // Members CRUD
    Route::get('/members/next-bi-member-id', [MemberController::class, 'nextBiMemberId']);
    Route::get('/members', [MemberController::class, 'index']);
    Route::post('/members', [MemberController::class, 'store']);
    Route::post('/members/bulk-upload', [MemberController::class, 'bulkUpload']);
    Route::post('/members/bulk-delete', [MemberController::class, 'bulkDelete']);
    Route::post('/members/{id}/login-as', [MemberController::class, 'loginAs']);
    Route::post('/members/{id}/approve', [MemberController::class, 'approve']);
    Route::post('/members/{id}/reject', [MemberController::class, 'reject']);
    Route::patch('/members/{id}', [MemberController::class, 'update']);
    Route::delete('/members/{id}', [MemberController::class, 'destroy']);

    // Credit Requests
    Route::get('/credit-requests', [CreditRequestController::class, 'index']);
    Route::post('/credit-requests', [CreditRequestController::class, 'store']);
    Route::post('/credit-requests/{id}/approve', [CreditRequestController::class, 'approve']);
    Route::post('/credit-requests/{id}/reject', [CreditRequestController::class, 'reject']);
    Route::delete('/credit-requests/{id}', [CreditRequestController::class, 'destroy']);

    // Transactions
    Route::get('/transactions', [TransactionController::class, 'index']);
    Route::delete('/transactions/{id}', [TransactionController::class, 'destroy']);

    // Play Schedules & Rotations
    Route::get('/schedules', [PlayScheduleController::class, 'index']);
    Route::post('/schedules', [PlayScheduleController::class, 'store']);
    Route::patch('/schedules/{id}', [PlayScheduleController::class, 'update']);
    Route::delete('/schedules/{id}', [PlayScheduleController::class, 'destroy']);
    Route::post('/schedules/{id}/release', [PlayScheduleController::class, 'release']);
    Route::post('/schedules/{id}/close', [PlayScheduleController::class, 'close']);
    Route::post('/schedules/{id}/cancel', [PlayScheduleController::class, 'cancel']);
    Route::post('/schedules/{id}/rotate', [PlayScheduleController::class, 'rotate']);
    Route::post('/schedules/{id}/publish', [PlayScheduleController::class, 'publish']);
    Route::post('/schedules/{id}/revert-rotation', [PlayScheduleController::class, 'revertRotation']);
    Route::patch('/schedules/{id}/rotation', [PlayScheduleController::class, 'updateRotation']);
    Route::patch('/schedules/{id}/rotation/show-grades', [PlayScheduleController::class, 'updateRotationShowGrades']);
    Route::post('/schedules/{id}/enroll', [PlayScheduleController::class, 'enroll']);
    
    // Play Invitations
    Route::get('/play-invitations', [PlayScheduleController::class, 'listInvitations']);
    Route::post('/play-invitations/{id}/respond', [PlayScheduleController::class, 'respondInvitation']);
    Route::get('/rotations', [PlayScheduleController::class, 'listRotations']);

    // Trainings & Dates & Attendance
    Route::get('/trainings', [TrainingController::class, 'index']);
    Route::post('/trainings', [TrainingController::class, 'store']);
    Route::patch('/trainings/{id}', [TrainingController::class, 'update']);
    Route::delete('/trainings/{id}', [TrainingController::class, 'destroy']);
    Route::post('/trainings/{id}/release', [TrainingController::class, 'release']);
    Route::post('/trainings/{id}/update-member-invitation', [TrainingController::class, 'updateMemberInvitation']);
    Route::post('/trainings/{id}/enroll', [TrainingController::class, 'enroll']);
    Route::post('/trainings/{id}/cancel', [TrainingController::class, 'cancel']);
    
    // Training Invitations & Dates
    Route::get('/training-invitations', [TrainingController::class, 'listInvitations']);
    Route::post('/training-invitations/respond-bulk', [TrainingController::class, 'respondBulk']);
    Route::post('/training-invitations/{id}/respond', [TrainingController::class, 'respondInvitation']);
    Route::get('/training-dates', [TrainingController::class, 'listDates']);
    Route::patch('/training-dates/{id}/attendance', [TrainingController::class, 'markAttendance']);
    Route::post('/training-dates/{id}/process-refund', [TrainingController::class, 'processRefund']);
    // League Groups
    Route::get('/league-groups', [LeagueGroupController::class, 'index']);
    Route::post('/league-groups', [LeagueGroupController::class, 'store']);
    Route::patch('/league-groups/{id}', [LeagueGroupController::class, 'update']);
    Route::delete('/league-groups/{id}', [LeagueGroupController::class, 'destroy']);

    // Admin Roles CRUD
    Route::get('/admin-roles', [AdminRoleController::class, 'index']);
    Route::get('/admin-roles/permissions', [AdminRoleController::class, 'permissions']);
    Route::get('/admin-roles/{id}', [AdminRoleController::class, 'show']);
    Route::post('/admin-roles', [AdminRoleController::class, 'store']);
    Route::patch('/admin-roles/{id}', [AdminRoleController::class, 'update']);
    Route::delete('/admin-roles/{id}', [AdminRoleController::class, 'destroy']);

    // Admin Users CRUD
    Route::get('/admin-users', [AdminUserController::class, 'index']);
    Route::post('/admin-users', [AdminUserController::class, 'store']);
    Route::patch('/admin-users/{id}', [AdminUserController::class, 'update']);
    Route::delete('/admin-users/{id}', [AdminUserController::class, 'destroy']);
    Route::post('/admin-users/{id}/reset-password', [AdminUserController::class, 'resetPassword']);
});
