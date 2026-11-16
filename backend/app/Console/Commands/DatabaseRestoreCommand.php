<?php

namespace App\Console\Commands;

use App\Services\BackupService;
use Illuminate\Console\Command;

class DatabaseRestoreCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:restore
                            {filename? : Filename of the backup to restore}
                            {--force : Force restore without interactive confirmation}
                            {--skip-safety-backup : Bypass automated pre-restore safety snapshot (NOT RECOMMENDED)}
                            {--no-maintenance : Do not toggle application maintenance mode during restore}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Safely restore the database from a verified backup (with automatic pre-restore safety snapshot)';

    /**
     * Execute the console command.
     */
    public function handle(BackupService $backupService): int
    {
        $filename = $this->argument('filename');

        if (!$filename) {
            $backups = $backupService->listBackups();
            if (empty($backups)) {
                $this->error('No backups found in storage directory.');
                return Command::FAILURE;
            }

            $choices = [];
            foreach ($backups as $b) {
                $label = "{$b['filename']} | {$b['size_human']} | {$b['created_at']} (" . ($b['is_safety_snapshot'] ? 'Safety Snapshot' : 'Standard') . ")";
                $choices[$b['filename']] = $label;
            }

            $selected = $this->choice('Select the backup file to restore', array_values($choices));
            $filename = array_search($selected, $choices, true);
        }

        $connection = config('database.default');
        $databaseName = config("database.connections.{$connection}.database");

        $this->warn('======================================================');
        $this->warn('              SAFE DATABASE RESTORE                   ');
        $this->warn('======================================================');
        $this->line("Target Database: <fg=cyan>{$databaseName}</> (Connection: {$connection})");
        $this->line("Source Backup:   <fg=cyan>{$filename}</>");
        $this->newLine();

        if (!$this->option('force')) {
            $confirmed = $this->confirm(
                'WARNING: This will replace current database tables with data from the backup. An automated pre-restore safety snapshot will be taken first. Do you want to proceed?',
                false
            );

            if (!$confirmed) {
                $this->info('Restore aborted by user.');
                return Command::SUCCESS;
            }
        }

        $options = [
            'skip_safety_backup' => (bool) $this->option('skip-safety-backup'),
            'no_maintenance' => (bool) $this->option('no-maintenance'),
        ];

        try {
            $result = $backupService->restoreBackup($filename, $options);

            $this->newLine();
            $this->info('======================================================');
            $this->info('       DATABASE RESTORE COMPLETED SUCCESSFULLY        ');
            $this->info('======================================================');
            $this->table(
                ['Property', 'Value'],
                [
                    ['Database', $result['database'] . " ({$result['connection']})"],
                    ['Restored From', $result['source_backup']],
                    ['Duration', "{$result['duration_seconds']}s"],
                    ['Pre-Restore Safety Snapshot', $result['safety_backup'] ? $result['safety_backup']['filename'] . " ({$result['safety_backup']['size_human']})" : 'Skipped by flag'],
                ]
            );

            if ($result['safety_backup']) {
                $this->comment("Tip: If you ever need to rollback, restore using: php artisan db:restore {$result['safety_backup']['filename']} --force");
            }

            $this->newLine();
            return Command::SUCCESS;

        } catch (\Throwable $e) {
            $this->newLine();
            $this->error('======================================================');
            $this->error('              DATABASE RESTORE FAILED                 ');
            $this->error('======================================================');
            $this->error('Error: ' . $e->getMessage());
            $this->newLine();

            return Command::FAILURE;
        }
    }
}

