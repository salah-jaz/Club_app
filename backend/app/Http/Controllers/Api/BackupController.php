<?php

namespace App\Http\Controllers\Api;

use App\Helpers\PermissionHelper;
use App\Http\Controllers\Controller;
use App\Services\BackupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class BackupController extends Controller
{
    protected BackupService $backupService;

    public function __construct(BackupService $backupService)
    {
        $this->backupService = $backupService;
    }

    /**
     * List all database backups and configuration status.
     */
    public function index(Request $request): JsonResponse
    {
        if ($authCheck = PermissionHelper::authorizeAdmin($request)) {
            return $authCheck;
        }

        $backups = $this->backupService->listBackups();
        $totalBytes = array_sum(array_column($backups, 'size_bytes'));

        return response()->json([
            'backups' => $backups,
            'summary' => [
                'total_count' => count($backups),
                'total_size_bytes' => $totalBytes,
                'retention_days' => config('backup.retention_days', 30),
                'daily_time' => config('backup.daily_time', '02:00'),
                'compression' => config('backup.compression', true),
                'secondary_storage_configured' => !empty(config('backup.secondary_disk')),
                'secondary_disk' => config('backup.secondary_disk'),
            ],
        ]);
    }

    /**
     * Trigger an immediate manual database backup.
     */
    public function store(Request $request): JsonResponse
    {
        if ($authCheck = PermissionHelper::authorizeAdmin($request)) {
            return $authCheck;
        }

        $label = $request->input('label', 'manual');

        try {
            $result = $this->backupService->createBackup($label);

            return response()->json([
                'message' => 'Database backup completed and verified successfully.',
                'backup' => $result['metadata'],
                'pruned_count' => $result['pruned_count'],
            ], 201);

        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Backup failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Verify the integrity of a specific backup archive.
     */
    public function verify(Request $request, string $filename): JsonResponse
    {
        if ($authCheck = PermissionHelper::authorizeAdmin($request)) {
            return $authCheck;
        }

        $result = $this->backupService->verifyBackup($filename);

        return response()->json([
            'filename' => $filename,
            'valid' => $result['valid'],
            'sha256' => $result['sha256'] ?? null,
            'size' => $result['size'] ?? 0,
            'error' => $result['error'] ?? null,
        ], $result['valid'] ? 200 : 422);
    }

    /**
     * Restore database from a specific backup archive safely.
     */
    public function restore(Request $request, string $filename): JsonResponse
    {
        if ($authCheck = PermissionHelper::authorizeAdmin($request)) {
            return $authCheck;
        }

        // Require explicit confirmation parameter for destructive restore operation
        if (!$request->boolean('confirm')) {
            return response()->json([
                'message' => 'Restore confirmation required. Please confirm you understand this will restore the database to the selected backup.',
            ], 400);
        }

        try {
            $result = $this->backupService->restoreBackup($filename, [
                'skip_safety_backup' => false,
                'no_maintenance' => false,
            ]);

            return response()->json([
                'message' => 'Database successfully restored.',
                'result' => $result,
            ]);

        } catch (\Throwable $e) {
            return response()->json([
                'message' => 'Database restore failed: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Securely download a backup file.
     */
    public function download(Request $request, string $filename): BinaryFileResponse|JsonResponse
    {
        if ($authCheck = PermissionHelper::authorizeAdmin($request)) {
            return $authCheck;
        }

        // Sanitize filename to prevent directory traversal
        $filename = basename($filename);
        $localPath = $this->backupService->getLocalPathForFile($filename);

        if (!file_exists($localPath)) {
            return response()->json(['message' => 'Backup file not found.'], 404);
        }

        return response()->download($localPath, $filename, [
            'Content-Type' => 'application/gzip',
        ]);
    }

    /**
     * Delete a specific backup file.
     */
    public function destroy(Request $request, string $filename): JsonResponse
    {
        if ($authCheck = PermissionHelper::authorizeAdmin($request)) {
            return $authCheck;
        }

        $filename = basename($filename);
        $deleted = $this->backupService->deleteBackup($filename);

        if (!$deleted) {
            return response()->json(['message' => 'Backup file not found or could not be deleted.'], 404);
        }

        return response()->json([
            'message' => "Backup [{$filename}] deleted successfully.",
        ]);
    }
}

