<?php

namespace App\Console\Commands;

use App\Services\BackupService;
use Illuminate\Console\Command;

class DatabaseBackupListCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:backup:list';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'List all available database backups, their file sizes, checksums, and ages';

    /**
     * Execute the console command.
     */
    public function handle(BackupService $backupService): int
    {
        $backups = $backupService->listBackups();

        $this->newLine();
        $this->info('======================================================');
        $this->info('                 CLUBAPP BACKUP ARCHIVE               ');
        $this->info('======================================================');

        if (empty($backups)) {
            $this->comment('No backup files found in backup storage.');
            $this->newLine();
            return Command::SUCCESS;
        }

        $tableRows = [];
        $totalBytes = 0;

        foreach ($backups as $b) {
            $totalBytes += $b['size_bytes'];
            $statusLabel = $b['is_verified'] ? '<fg=green>Verified</>' : '<fg=red>Unverified</>';
            $typeLabel = $b['is_safety_snapshot'] ? '<fg=yellow>Safety Snapshot</>' : '<fg=cyan>Standard Backup</>';
            $shaPrefix = $b['sha256'] ? substr($b['sha256'], 0, 10) . '...' : 'N/A';

            $tableRows[] = [
                $b['filename'],
                $b['size_human'],
                $b['created_at'],
                "{$b['age_days']} days",
                $shaPrefix,
                $statusLabel,
                $typeLabel,
            ];
        }

        $this->table(
            ['Filename', 'Size', 'Created At', 'Age', 'SHA256', 'Integrity', 'Type'],
            $tableRows
        );

        $totalFormatted = $this->formatBytes($totalBytes);
        $retentionDays = config('backup.retention_days', 30);
        $dailyTime = config('backup.daily_time', '02:00');

        $this->line("Total Backups: <fg=cyan>" . count($backups) . "</> | Total Storage: <fg=cyan>{$totalFormatted}</>");
        $this->line("Retention Policy: <fg=cyan>{$retentionDays} days</> | Scheduled Daily Time: <fg=cyan>{$dailyTime} server time</>");
        $this->newLine();

        return Command::SUCCESS;
    }

    protected function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        $bytes /= (1 << (10 * $pow));

        return round($bytes, 2) . ' ' . $units[$pow];
    }
}

