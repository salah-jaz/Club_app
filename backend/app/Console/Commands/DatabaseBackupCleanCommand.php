<?php

namespace App\Console\Commands;

use App\Services\BackupService;
use Illuminate\Console\Command;

class DatabaseBackupCleanCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:backup:clean
                            {--days= : Override configured retention days}
                            {--force : Force cleanup without confirmation}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Clean up expired database backups based on retention policy (default: 30 days)';

    /**
     * Execute the console command.
     */
    public function handle(BackupService $backupService): int
    {
        $retentionDays = $this->option('days') !== null
            ? (int) $this->option('days')
            : (int) config('backup.retention_days', 30);

        $this->info("Scanning for backups older than {$retentionDays} days...");

        if (!$this->option('force')) {
            $confirmed = $this->confirm(
                "Are you sure you want to prune backups older than {$retentionDays} days?",
                true
            );

            if (!$confirmed) {
                $this->info('Cleanup aborted.');
                return Command::SUCCESS;
            }
        }

        $pruned = $backupService->enforceRetentionPolicy($retentionDays);

        if (empty($pruned)) {
            $this->info('No expired backups found to prune. All backups are within the retention window.');
        } else {
            $this->info("Successfully pruned " . count($pruned) . " expired backup(s):");
            foreach ($pruned as $file) {
                $this->line("  - {$file}");
            }
        }

        return Command::SUCCESS;
    }
}

