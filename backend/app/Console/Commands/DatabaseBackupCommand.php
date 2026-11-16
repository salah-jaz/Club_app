<?php

namespace App\Console\Commands;

use App\Services\BackupService;
use Illuminate\Console\Command;

class DatabaseBackupCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'db:backup
                            {--label= : Optional label or prefix for this backup}
                            {--skip-secondary : Skip replicating to secondary offsite disk}
                            {--skip-retention : Skip automated retention pruning}
                            {--no-compression : Generate uncompressed .sql dump}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Perform an automated, non-locking, verified database backup with retention enforcement';

    /**
     * Execute the console command.
     */
    public function handle(BackupService $backupService): int
    {
        $this->info('Starting database backup for ClubApp...');

        $label = $this->option('label');
        $options = [
            'skip_secondary' => (bool) $this->option('skip-secondary'),
            'skip_retention' => (bool) $this->option('skip-retention'),
            'no_compression' => (bool) $this->option('no-compression'),
        ];

        try {
            $result = $backupService->createBackup($label, $options);
            $meta = $result['metadata'];

            $this->newLine();
            $this->info('======================================================');
            $this->info('  DATABASE BACKUP COMPLETED & VERIFIED SUCCESSFULLY   ');
            $this->info('======================================================');
            $this->table(
                ['Property', 'Value'],
                [
                    ['Filename', $result['filename']],
                    ['Database', $meta['database'] . " ({$meta['connection']})"],
                    ['File Size', $meta['size_human'] . " ({$meta['size_bytes']} bytes)"],
                    ['SHA256 Checksum', $meta['sha256']],
                    ['Tables Dumped', $meta['tables_count']],
                    ['Dump Engine', $meta['dump_engine']],
                    ['Integrity Verified', 'PASSED (Gzip stream & SQL header validated)'],
                    ['Duration', "{$meta['duration_seconds']}s"],
                    ['Secondary Offsite Sync', $result['secondary_status']],
                    ['Retention Pruned', $result['pruned_count'] . ' expired backup(s) cleaned'],
                ]
            );

            if (!empty($result['pruned_files'])) {
                $this->line('<comment>Pruned older backups:</comment>');
                foreach ($result['pruned_files'] as $f) {
                    $this->line("  - {$f}");
                }
            }

            $this->newLine();
            return Command::SUCCESS;

        } catch (\Throwable $e) {
            $this->newLine();
            $this->error('======================================================');
            $this->error('             DATABASE BACKUP FAILED                   ');
            $this->error('======================================================');
            $this->error('Error: ' . $e->getMessage());
            $this->newLine();

            return Command::FAILURE;
        }
    }
}

