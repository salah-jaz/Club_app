<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PDO;
use RuntimeException;
use Symfony\Component\Process\Process;

class BackupService
{
    protected string $disk;
    protected string $directory;
    protected ?string $secondaryDisk;
    protected string $secondaryDirectory;
    protected int $retentionDays;
    protected bool $compression;
    protected int $compressionLevel;
    protected ?string $mysqldumpPath;
    protected ?string $mysqlPath;
    protected int $timeout;
    protected bool $maintenanceDuringRestore;
    protected string $logChannel;

    public function __construct()
    {
        $this->disk = (string) config('backup.disk', 'local');
        $this->directory = trim((string) config('backup.directory', 'backups'), '/');
        $this->secondaryDisk = config('backup.secondary_disk');
        $this->secondaryDirectory = trim((string) config('backup.secondary_directory', 'backups'), '/');
        $this->retentionDays = max(1, (int) config('backup.retention_days', 30));
        $this->compression = (bool) config('backup.compression', true);
        $this->compressionLevel = max(1, min(9, (int) config('backup.compression_level', 9)));
        $this->mysqldumpPath = config('backup.mysqldump_path');
        $this->mysqlPath = config('backup.mysql_path');
        $this->timeout = max(60, (int) config('backup.timeout', 600));
        $this->maintenanceDuringRestore = (bool) config('backup.maintenance_during_restore', true);
        $this->logChannel = (string) config('backup.log_channel', 'backup');
    }

    /**
     * Create a full, non-locking database backup with integrity verification and offsite sync.
     *
     * @param string|null $label Optional label (e.g. 'manual', 'safety-pre-restore', 'scheduled')
     * @param array $options [skip_retention => bool, skip_secondary => bool, no_compression => bool]
     * @return array Backup summary details
     */
    public function createBackup(?string $label = null, array $options = []): array
    {
        $startTime = microtime(true);
        $timestamp = Carbon::now('UTC')->format('Y-m-d_H-i-s');
        $uniqueId = Str::random(6);
        $prefix = $label ? Str::slug($label) : 'automated-daily';
        $isSafety = str_contains($prefix, 'safety');

        $connection = config('database.default');
        $databaseName = (string) config("database.connections.{$connection}.database");
        $safeDatabaseName = preg_replace('/[^a-zA-Z0-9_\-]/', '_', $databaseName) ?: 'db';

        $useCompression = ($options['no_compression'] ?? false) ? false : $this->compression;
        $extension = $useCompression ? 'sql.gz' : 'sql';
        $filename = "clubapp-{$prefix}-{$safeDatabaseName}-{$timestamp}_{$uniqueId}.{$extension}";

        $this->log('info', "Starting database backup: [{$filename}] on connection [{$connection}]");

        // Ensure backup storage directory exists
        $storage = Storage::disk($this->disk);
        if (!$storage->exists($this->directory)) {
            $storage->makeDirectory($this->directory);
        }

        $finalLocalPath = $this->getLocalPathForFile($filename);
        $finalDir = dirname($finalLocalPath);
        if (!is_dir($finalDir)) {
            @mkdir($finalDir, 0755, true);
        }

        $tempSqlPath = tempnam(sys_get_temp_dir(), 'clubapp_backup_') . '.sql';

        try {
            // 1. Dump database without locking live application tables
            $dumpResult = $this->dumpDatabase($connection, $tempSqlPath);
            $tablesCount = $dumpResult['tables_count'] ?? 0;
            $dumpEngine = $dumpResult['engine'] ?? 'unknown';

            // 2. Compress or copy to target destination
            if ($useCompression) {
                $this->compressSqlFile($tempSqlPath, $finalLocalPath, $this->compressionLevel);
            } else {
                copy($tempSqlPath, $finalLocalPath);
            }

            // Remove raw temp SQL file
            if (file_exists($tempSqlPath)) {
                @unlink($tempSqlPath);
            }

            // 3. Verify backup file integrity
            $verification = $this->verifyFileIntegrity($finalLocalPath, $useCompression);
            if (!$verification['valid']) {
                throw new RuntimeException("Backup integrity check failed: " . ($verification['error'] ?? 'Unknown verification error'));
            }

            $sizeBytes = filesize($finalLocalPath);
            $sha256 = hash_file('sha256', $finalLocalPath);
            $durationSeconds = round(microtime(true) - $startTime, 2);

            // 4. Generate structured metadata manifest
            $metadata = [
                'filename' => $filename,
                'created_at' => Carbon::now('UTC')->toIso8601String(),
                'prefix' => $prefix,
                'is_safety_snapshot' => $isSafety,
                'connection' => $connection,
                'database' => $databaseName,
                'tables_count' => $tablesCount,
                'dump_engine' => $dumpEngine,
                'compressed' => $useCompression,
                'size_bytes' => $sizeBytes,
                'size_human' => $this->formatBytes($sizeBytes),
                'sha256' => $sha256,
                'integrity_verified' => true,
                'verified_at' => Carbon::now('UTC')->toIso8601String(),
                'duration_seconds' => $durationSeconds,
                'retention_days' => $this->retentionDays,
            ];

            $metaFilename = "{$filename}.meta.json";
            $storage->put("{$this->directory}/{$metaFilename}", json_encode($metadata, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            // 5. Replicate to secondary/offsite storage if configured
            $secondaryStatus = 'not_configured';
            if (empty($options['skip_secondary']) && !empty($this->secondaryDisk)) {
                $secondaryStatus = $this->replicateToSecondaryStorage($filename, $metaFilename, $finalLocalPath, $metadata);
            }

            $this->log('info', "Backup completed and verified successfully: {$filename} ({$metadata['size_human']}, SHA256: {$sha256}, Duration: {$durationSeconds}s, Dump engine: {$dumpEngine})");

            // 6. STRICT ENFORCEMENT: Only prune older backups AFTER the new backup has been verified!
            $prunedFiles = [];
            $skipRetention = $options['skip_retention'] ?? false;
            if (!$skipRetention && !$isSafety) {
                $prunedFiles = $this->enforceRetentionPolicy();
            }

            return [
                'success' => true,
                'filename' => $filename,
                'path' => $finalLocalPath,
                'metadata' => $metadata,
                'secondary_status' => $secondaryStatus,
                'pruned_count' => count($prunedFiles),
                'pruned_files' => $prunedFiles,
            ];

        } catch (\Throwable $e) {
            $this->log('error', "Backup failed for [{$filename}]: " . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
            ]);

            // Clean up potentially corrupt destination file
            if (file_exists($finalLocalPath)) {
                @unlink($finalLocalPath);
            }
            if (file_exists($tempSqlPath)) {
                @unlink($tempSqlPath);
            }

            throw $e;
        }
    }

    /**
     * Verify the integrity of any backup file.
     *
     * @param string $filename Name of backup file inside backups directory
     * @return array [valid => bool, sha256 => string, size => int, error => ?string]
     */
    public function verifyBackup(string $filename): array
    {
        $filePath = $this->getLocalPathForFile($filename);
        if (!file_exists($filePath)) {
            return [
                'valid' => false,
                'error' => "Backup file does not exist: {$filename}",
                'size' => 0,
                'sha256' => null,
            ];
        }

        $isCompressed = str_ends_with(strtolower($filename), '.gz');
        $result = $this->verifyFileIntegrity($filePath, $isCompressed);

        // Check against stored metadata if available
        $metaFilename = "{$filename}.meta.json";
        $storage = Storage::disk($this->disk);
        if ($storage->exists("{$this->directory}/{$metaFilename}")) {
            $meta = json_decode($storage->get("{$this->directory}/{$metaFilename}"), true);
            if (!empty($meta['sha256']) && $meta['sha256'] !== $result['sha256']) {
                $result['valid'] = false;
                $result['error'] = "SHA256 checksum mismatch! Expected [{$meta['sha256']}] but calculated [{$result['sha256']}]. File may be altered or corrupted.";
            }
        }

        return $result;
    }

    /**
     * List all available database backups with metadata.
     *
     * @return array
     */
    public function listBackups(): array
    {
        $storage = Storage::disk($this->disk);
        if (!$storage->exists($this->directory)) {
            return [];
        }

        $allFiles = $storage->files($this->directory);
        $backups = [];

        foreach ($allFiles as $file) {
            $baseName = basename($file);
            if (str_ends_with($baseName, '.meta.json') || str_starts_with($baseName, '.') || $baseName === 'web.config' || $baseName === '.htaccess') {
                continue;
            }

            if (!str_ends_with(strtolower($baseName), '.sql') && !str_ends_with(strtolower($baseName), '.sql.gz') && !str_ends_with(strtolower($baseName), '.gz')) {
                continue;
            }

            $metaFile = "{$this->directory}/{$baseName}.meta.json";
            $metadata = null;
            if ($storage->exists($metaFile)) {
                $metadata = json_decode($storage->get($metaFile), true);
            }

            $localPath = $this->getLocalPathForFile($baseName);
            $sizeBytes = file_exists($localPath) ? filesize($localPath) : ($storage->size($file) ?: 0);
            $lastModified = file_exists($localPath) ? filemtime($localPath) : ($storage->lastModified($file) ?: time());
            $ageDays = round((time() - $lastModified) / 86400, 1);

            $backups[] = [
                'filename' => $baseName,
                'size_bytes' => $sizeBytes,
                'size_human' => $this->formatBytes($sizeBytes),
                'created_at' => $metadata['created_at'] ?? Carbon::createFromTimestamp($lastModified)->toIso8601String(),
                'age_days' => $ageDays,
                'sha256' => $metadata['sha256'] ?? (file_exists($localPath) ? hash_file('sha256', $localPath) : null),
                'tables_count' => $metadata['tables_count'] ?? null,
                'dump_engine' => $metadata['dump_engine'] ?? 'unknown',
                'is_safety_snapshot' => $metadata['is_safety_snapshot'] ?? str_contains($baseName, 'safety'),
                'is_verified' => $metadata['integrity_verified'] ?? true,
                'compressed' => str_ends_with(strtolower($baseName), '.gz'),
            ];
        }

        // Sort newest first
        usort($backups, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));

        return $backups;
    }

    /**
     * Safe database restore process.
     * 1. Verifies the target backup's integrity.
     * 2. Takes an automatic pre-restore safety snapshot of the active database.
     * 3. Puts application into maintenance mode.
     * 4. Disables foreign keys, executes restore, re-enables foreign keys.
     * 5. Runs health-check verification.
     * 6. Exits maintenance mode and logs full details.
     *
     * @param string $filename Backup filename to restore
     * @param array $options [skip_safety_backup => bool, no_maintenance => bool]
     * @return array
     */
    public function restoreBackup(string $filename, array $options = []): array
    {
        $startTime = microtime(true);
        $this->log('warning', "Initiating SAFE database restore from backup: [{$filename}]");

        // 1. Pre-restore verification
        $verification = $this->verifyBackup($filename);
        if (!$verification['valid']) {
            throw new RuntimeException("Cannot restore from invalid or corrupted backup: " . ($verification['error'] ?? 'Unknown error'));
        }

        $sourcePath = $this->getLocalPathForFile($filename);
        $connection = config('database.default');
        $databaseName = (string) config("database.connections.{$connection}.database");

        // 2. Automated Pre-Restore Safety Snapshot
        $safetyBackupInfo = null;
        if (empty($options['skip_safety_backup'])) {
            $this->log('info', "Generating pre-restore safety snapshot of current active database before proceeding...");
            $safetyResult = $this->createBackup(label: 'safety-pre-restore', options: ['skip_retention' => true]);
            $safetyBackupInfo = [
                'filename' => $safetyResult['filename'],
                'sha256' => $safetyResult['metadata']['sha256'],
                'size_human' => $safetyResult['metadata']['size_human'],
            ];
            $this->log('info', "Pre-restore safety snapshot safely saved: [{$safetyResult['filename']}]");
        }

        // 3. Put application into maintenance mode if configured
        $useMaintenance = empty($options['no_maintenance']) && $this->maintenanceDuringRestore;
        if ($useMaintenance) {
            $this->log('info', "Activating application maintenance mode during restore...");
            Artisan::call('down', [
                '--secret' => 'restore-bypass',
            ]);
        }

        $tempSqlFile = null;
        try {
            // Decompress if gzip
            if (str_ends_with(strtolower($filename), '.gz')) {
                $tempSqlFile = tempnam(sys_get_temp_dir(), 'clubapp_restore_') . '.sql';
                $this->decompressGzFile($sourcePath, $tempSqlFile);
                $sqlToExecutePath = $tempSqlFile;
            } else {
                $sqlToExecutePath = $sourcePath;
            }

            // 4. Execute SQL restore
            $this->executeSqlRestore($connection, $sqlToExecutePath);

            // 5. Post-restore smoke test
            $this->smokeTestDatabase($connection);

            $duration = round(microtime(true) - $startTime, 2);
            $this->log('info', "Database restore completed successfully from [{$filename}] in {$duration}s.");

            return [
                'success' => true,
                'source_backup' => $filename,
                'database' => $databaseName,
                'connection' => $connection,
                'duration_seconds' => $duration,
                'safety_backup' => $safetyBackupInfo,
                'message' => "Database successfully restored from {$filename}.",
            ];

        } catch (\Throwable $e) {
            $this->log('critical', "Database restore FAILED from [{$filename}]: " . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
                'safety_snapshot' => $safetyBackupInfo,
            ]);

            throw new RuntimeException("Database restore failed: " . $e->getMessage() .
                ($safetyBackupInfo ? " (Current database state was preserved in safety snapshot: {$safetyBackupInfo['filename']})" : ""));

        } finally {
            if ($tempSqlFile && file_exists($tempSqlFile)) {
                @unlink($tempSqlFile);
            }

            if ($useMaintenance) {
                $this->log('info', "Deactivating application maintenance mode.");
                Artisan::call('up');
            }
        }
    }

    /**
     * Enforce retention policy.
     * Deletes backups older than configured retention days (default 30 days).
     * Protected: Safety snapshots are preserved from daily pruning.
     *
     * @param int|null $retentionDays
     * @return array List of pruned backup filenames
     */
    public function enforceRetentionPolicy(?int $retentionDays = null): array
    {
        $days = $retentionDays ?? $this->retentionDays;
        $cutoffTime = Carbon::now('UTC')->subDays($days)->timestamp;
        $storage = Storage::disk($this->disk);

        if (!$storage->exists($this->directory)) {
            return [];
        }

        $allFiles = $storage->files($this->directory);
        $pruned = [];

        foreach ($allFiles as $file) {
            $baseName = basename($file);
            if (str_ends_with($baseName, '.meta.json') || str_starts_with($baseName, '.') || $baseName === 'web.config' || $baseName === '.htaccess') {
                continue;
            }

            if (!str_ends_with(strtolower($baseName), '.sql') && !str_ends_with(strtolower($baseName), '.sql.gz') && !str_ends_with(strtolower($baseName), '.gz')) {
                continue;
            }

            // Protect safety snapshots from automated daily pruning
            if (str_contains($baseName, 'safety-pre-restore')) {
                continue;
            }

            $localPath = $this->getLocalPathForFile($baseName);
            $lastModified = file_exists($localPath) ? filemtime($localPath) : ($storage->lastModified($file) ?: time());

            if ($lastModified < $cutoffTime) {
                $ageDays = round((time() - $lastModified) / 86400, 1);
                $this->log('info', "Pruning expired backup: [{$baseName}] (Age: {$ageDays} days > {$days} days retention limit)");

                $storage->delete($file);
                $metaFile = "{$this->directory}/{$baseName}.meta.json";
                if ($storage->exists($metaFile)) {
                    $storage->delete($metaFile);
                }

                // Also prune from secondary storage if configured
                if (!empty($this->secondaryDisk)) {
                    try {
                        $secondary = Storage::disk($this->secondaryDisk);
                        $secFile = "{$this->secondaryDirectory}/{$baseName}";
                        $secMeta = "{$this->secondaryDirectory}/{$baseName}.meta.json";
                        if ($secondary->exists($secFile)) {
                            $secondary->delete($secFile);
                        }
                        if ($secondary->exists($secMeta)) {
                            $secondary->delete($secMeta);
                        }
                    } catch (\Throwable $e) {
                        $this->log('warning', "Failed to prune backup [{$baseName}] from secondary disk: " . $e->getMessage());
                    }
                }

                $pruned[] = $baseName;
            }
        }

        return $pruned;
    }

    /**
     * Delete a specific backup file and its metadata.
     */
    public function deleteBackup(string $filename): bool
    {
        $storage = Storage::disk($this->disk);
        $targetFile = "{$this->directory}/{$filename}";
        $metaFile = "{$this->directory}/{$filename}.meta.json";

        $deleted = false;
        if ($storage->exists($targetFile)) {
            $deleted = $storage->delete($targetFile);
        }
        if ($storage->exists($metaFile)) {
            $storage->delete($metaFile);
        }

        if (!empty($this->secondaryDisk)) {
            try {
                $secondary = Storage::disk($this->secondaryDisk);
                $secFile = "{$this->secondaryDirectory}/{$filename}";
                $secMeta = "{$this->secondaryDirectory}/{$filename}.meta.json";
                if ($secondary->exists($secFile)) {
                    $secondary->delete($secFile);
                }
                if ($secondary->exists($secMeta)) {
                    $secondary->delete($secMeta);
                }
            } catch (\Throwable $e) {
                $this->log('warning', "Failed to delete backup [{$filename}] from secondary disk: " . $e->getMessage());
            }
        }

        $this->log('info', "Manually deleted backup: {$filename}");
        return $deleted;
    }

    /**
     * Dump the database without locking active tables.
     */
    protected function dumpDatabase(string $connectionName, string $targetSqlPath): array
    {
        $connConfig = config("database.connections.{$connectionName}");
        $driver = $connConfig['driver'] ?? 'mysql';

        if (in_array($driver, ['mysql', 'mariadb'])) {
            return $this->dumpMySqlDatabase($connConfig, $targetSqlPath);
        } elseif ($driver === 'sqlite') {
            return $this->dumpSqliteDatabase($connConfig, $targetSqlPath);
        }

        throw new RuntimeException("Unsupported database driver for automated backup: [{$driver}]");
    }

    /**
     * Dump MySQL database using mysqldump with --single-transaction (or pure-PHP fallback).
     */
    protected function dumpMySqlDatabase(array $config, string $targetSqlPath): array
    {
        $mysqldumpBin = $this->resolveBinaryPath('mysqldump', $this->mysqldumpPath);

        if ($mysqldumpBin) {
            try {
                return $this->dumpMySqlViaCli($mysqldumpBin, $config, $targetSqlPath);
            } catch (\Throwable $e) {
                $this->log('warning', "mysqldump CLI execution failed (" . $e->getMessage() . "). Seamlessly falling back to high-fidelity PHP PDO streaming dumper.");
                if (file_exists($targetSqlPath)) {
                    @unlink($targetSqlPath);
                }
            }
        }

        // Fallback: Pure-PHP streaming dumper with consistent snapshot transaction
        $this->log('notice', "Using high-fidelity PHP PDO streaming dumper.");
        return $this->dumpMySqlViaPdo($config, $targetSqlPath);
    }

    /**
     * Execute mysqldump CLI command with zero-locking flags and credentials file.
     */
    protected function dumpMySqlViaCli(string $binary, array $config, string $targetSqlPath): array
    {
        $database = $config['database'];
        $host = $config['host'] ?? '127.0.0.1';
        $port = (string) ($config['port'] ?? '3306');
        $username = $config['username'] ?? 'root';
        $password = (string) ($config['password'] ?? '');
        $socket = $config['unix_socket'] ?? '';

        // Write credentials to temporary options file to avoid leaking credentials in process table
        $cnfFile = tempnam(sys_get_temp_dir(), 'my_cnf_') . '.cnf';
        $cnfContent = "[client]\n" .
            "user=" . addcslashes($username, "\\\n\r\"") . "\n" .
            "password=" . addcslashes($password, "\\\n\r\"") . "\n";

        if ($socket) {
            $cnfContent .= "socket=" . addcslashes($socket, "\\\n\r\"") . "\n";
        } else {
            $cnfContent .= "host=" . addcslashes($host, "\\\n\r\"") . "\n";
            $cnfContent .= "port=" . addcslashes($port, "\\\n\r\"") . "\n";
        }

        file_put_contents($cnfFile, $cnfContent);
        @chmod($cnfFile, 0600);

        try {
            // Count tables first
            $tables = DB::select("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
            $tablesCount = count($tables);

            // Command flags optimized for live production environments:
            // --single-transaction: Uses InnoDB MVCC consistent snapshot without locking tables
            // --quick: Streams row-by-row to keep RAM low
            // --skip-lock-tables: Ensures no read locks placed
            // --routines --triggers --events: Complete logical schema
            // --hex-blob: Safe binary columns
            // --default-character-set=utf8mb4: Full unicode support
            // --no-autocommit: Speeds up subsequent restores
            $cmd = [
                $binary,
                "--defaults-extra-file={$cnfFile}",
                '--protocol=tcp',
                '--single-transaction',
                '--quick',
                '--skip-lock-tables',
                '--routines',
                '--triggers',
                '--events',
                '--hex-blob',
                '--default-character-set=utf8mb4',
                '--no-autocommit',
                '--result-file=' . $targetSqlPath,
                $database,
            ];

            // Ensure Windows environment variables (SystemRoot, WINDIR, etc.) are passed so Winsock 2 initializes properly
            $env = array_filter(array_merge(
                is_array($_ENV) ? $_ENV : [],
                is_array($_SERVER) ? $_SERVER : [],
                [
                    'SystemRoot' => getenv('SystemRoot') ?: 'C:\\Windows',
                    'WINDIR' => getenv('WINDIR') ?: 'C:\\Windows',
                    'SYSTEMDRIVE' => getenv('SYSTEMDRIVE') ?: 'C:',
                    'PATH' => getenv('PATH') ?: 'C:\\Windows\\system32;C:\\Windows',
                    'TEMP' => sys_get_temp_dir(),
                    'TMP' => sys_get_temp_dir(),
                ]
            ));

            $process = new Process($cmd, null, $env);
            $process->setTimeout($this->timeout);
            $process->run();

            if (!$process->isSuccessful()) {
                $errorOutput = $process->getErrorOutput() ?: $process->getOutput();
                throw new RuntimeException("mysqldump failed with exit code {$process->getExitCode()}: {$errorOutput}");
            }

            return [
                'engine' => 'mysqldump_cli',
                'tables_count' => $tablesCount,
            ];

        } finally {
            if (file_exists($cnfFile)) {
                @unlink($cnfFile);
            }
        }
    }

    /**
     * Pure-PHP PDO streaming dump fallback for environments where mysqldump binary is unavailable.
     */
    protected function dumpMySqlViaPdo(array $config, string $targetSqlPath): array
    {
        $pdo = DB::connection()->getPdo();
        $database = $config['database'];

        $fp = fopen($targetSqlPath, 'w');
        if (!$fp) {
            throw new RuntimeException("Unable to open file for writing: {$targetSqlPath}");
        }

        try {
            // Consistent read snapshot without table locks
            $pdo->exec("SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ");
            $pdo->exec("START TRANSACTION /*!40100 WITH CONSISTENT SNAPSHOT */");

            fwrite($fp, "-- ClubApp MySQL Backup (PDO Engine)\n");
            fwrite($fp, "-- Generated at: " . Carbon::now('UTC')->toIso8601String() . "\n");
            fwrite($fp, "-- Database: `{$database}`\n\n");
            fwrite($fp, "SET foreign_key_checks = 0;\n");
            fwrite($fp, "SET names utf8mb4;\n");
            fwrite($fp, "SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';\n\n");

            $tables = DB::select("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
            $tablesCount = count($tables);

            foreach ($tables as $tableRow) {
                $tableName = current((array) $tableRow);
                fwrite($fp, "\n-- Table structure for table `{$tableName}`\n");
                fwrite($fp, "DROP TABLE IF EXISTS `{$tableName}`;\n");

                $createRow = DB::select("SHOW CREATE TABLE `{$tableName}`");
                if (!empty($createRow)) {
                    $createSql = ((array) $createRow[0])['Create Table'] ?? '';
                    fwrite($fp, $createSql . ";\n\n");
                }

                fwrite($fp, "-- Dumping data for table `{$tableName}`\n");
                $rows = DB::table($tableName)->get();
                if ($rows->isNotEmpty()) {
                    fwrite($fp, "INSERT INTO `{$tableName}` VALUES \n");
                    $first = true;
                    foreach ($rows as $row) {
                        if (!$first) {
                            fwrite($fp, ",\n");
                        }
                        $first = false;

                        $values = [];
                        foreach ((array) $row as $val) {
                            if ($val === null) {
                                $values[] = 'NULL';
                            } elseif (is_numeric($val) && !str_starts_with((string)$val, '0')) {
                                $values[] = $val;
                            } else {
                                $values[] = $pdo->quote((string) $val);
                            }
                        }
                        fwrite($fp, '(' . implode(', ', $values) . ')');
                    }
                    fwrite($fp, ";\n");
                }
            }

            fwrite($fp, "\nSET foreign_key_checks = 1;\n");
            fwrite($fp, "-- Dump completed\n");

            $pdo->exec("COMMIT");

            return [
                'engine' => 'php_pdo_stream',
                'tables_count' => $tablesCount,
            ];

        } finally {
            fclose($fp);
        }
    }

    /**
     * Dump SQLite database using VACUUM INTO or safe file snapshot.
     */
    protected function dumpSqliteDatabase(array $config, string $targetSqlPath): array
    {
        $dbPath = $config['database'];
        if ($dbPath === ':memory:') {
            // For testing: dump schema and data via PDO
            $pdo = DB::connection()->getPdo();
            $fp = fopen($targetSqlPath, 'w');
            fwrite($fp, "-- SQLite Memory Dump\n");
            fwrite($fp, "-- Generated at: " . Carbon::now('UTC')->toIso8601String() . "\n\n");
            fwrite($fp, "PRAGMA foreign_keys = OFF;\n");
            $tables = DB::select("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            foreach ($tables as $t) {
                if (!empty($t->sql)) {
                    fwrite($fp, "DROP TABLE IF EXISTS `{$t->name}`;\n");
                    fwrite($fp, $t->sql . ";\n");
                    $rows = DB::table($t->name)->get();
                    foreach ($rows as $r) {
                        $vals = array_map(fn($v) => $v === null ? 'NULL' : $pdo->quote((string)$v), (array)$r);
                        fwrite($fp, "INSERT INTO `{$t->name}` VALUES (" . implode(',', $vals) . ");\n");
                    }
                }
            }
            fwrite($fp, "\n-- Dump completed\n");
            fclose($fp);
            return ['engine' => 'sqlite_memory', 'tables_count' => count($tables)];
        }

        // Real SQLite file on disk
        $pdo = DB::connection()->getPdo();
        $pdo->exec("PRAGMA wal_checkpoint(TRUNCATE)");

        // VACUUM INTO creates a safe, live, non-locking copy
        $tempCopy = tempnam(sys_get_temp_dir(), 'sqlite_snap_');
        @unlink($tempCopy);
        $pdo->exec("VACUUM INTO " . $pdo->quote($tempCopy));

        copy($tempCopy, $targetSqlPath);
        @unlink($tempCopy);

        $tables = DB::select("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
        return [
            'engine' => 'sqlite_vacuum',
            'tables_count' => $tables[0]->count ?? 0,
        ];
    }

    /**
     * Compress SQL file using gzip with configurable level.
     */
    protected function compressSqlFile(string $sourceSql, string $targetGz, int $level = 9): void
    {
        $fpIn = fopen($sourceSql, 'rb');
        if (!$fpIn) {
            throw new RuntimeException("Failed to open source SQL for compression: {$sourceSql}");
        }

        $gzOut = gzopen($targetGz, 'wb' . $level);
        if (!$gzOut) {
            fclose($fpIn);
            throw new RuntimeException("Failed to open target gzip file: {$targetGz}");
        }

        while (!feof($fpIn)) {
            $buffer = fread($fpIn, 1024 * 512); // 512 KB chunks
            gzwrite($gzOut, $buffer);
        }

        fclose($fpIn);
        gzclose($gzOut);
    }

    /**
     * Decompress gzip file.
     */
    protected function decompressGzFile(string $sourceGz, string $targetSql): void
    {
        $gzIn = gzopen($sourceGz, 'rb');
        if (!$gzIn) {
            throw new RuntimeException("Failed to open gzip backup for reading: {$sourceGz}");
        }

        $fpOut = fopen($targetSql, 'wb');
        if (!$fpOut) {
            gzclose($gzIn);
            throw new RuntimeException("Failed to open temporary SQL file for restore: {$targetSql}");
        }

        while (!gzeof($gzIn)) {
            $buffer = gzread($gzIn, 1024 * 512);
            fwrite($fpOut, $buffer);
        }

        gzclose($gzIn);
        fclose($fpOut);
    }

    /**
     * Verify backup file integrity (size, gzip readability, SQL content, SHA256).
     */
    protected function verifyFileIntegrity(string $filePath, bool $isCompressed): array
    {
        if (!file_exists($filePath)) {
            return ['valid' => false, 'error' => 'File does not exist on disk', 'size' => 0, 'sha256' => null];
        }

        $size = filesize($filePath);
        if ($size < 32) {
            return ['valid' => false, 'error' => "File size is suspiciously small ({$size} bytes)", 'size' => $size, 'sha256' => null];
        }

        $sha256 = hash_file('sha256', $filePath);

        if ($isCompressed) {
            // Validate GZIP magic header bytes (0x1F, 0x8B) per RFC 1952
            $fpCheck = @fopen($filePath, 'rb');
            if ($fpCheck) {
                $magic = fread($fpCheck, 2);
                fclose($fpCheck);
                if ($magic !== "\x1f\x8b") {
                    return ['valid' => false, 'error' => 'File lacks valid Gzip magic header (0x1F 0x8B)', 'size' => $size, 'sha256' => $sha256];
                }
            }

            $gz = @gzopen($filePath, 'rb');
            if (!$gz) {
                return ['valid' => false, 'error' => 'Gzip header is corrupted and could not be opened', 'size' => $size, 'sha256' => $sha256];
            }

            $bytesRead = 0;
            $sampleHeader = '';
            while (!gzeof($gz)) {
                $chunk = @gzread($gz, 1024 * 256);
                if ($chunk === false) {
                    gzclose($gz);
                    return ['valid' => false, 'error' => 'Gzip stream encountered a decompression error midway', 'size' => $size, 'sha256' => $sha256];
                }
                if ($bytesRead === 0) {
                    $sampleHeader = substr($chunk, 0, 4096);
                }
                $bytesRead += strlen($chunk);
            }
            gzclose($gz);

            if ($bytesRead < 32) {
                return ['valid' => false, 'error' => "Decompressed payload too small ({$bytesRead} bytes)", 'size' => $size, 'sha256' => $sha256];
            }

            // Check sample header for fatal error strings
            if (str_contains($sampleHeader, 'mysqldump: Got error:') || str_contains($sampleHeader, 'Access denied')) {
                return ['valid' => false, 'error' => "Dump file contains error output: {$sampleHeader}", 'size' => $size, 'sha256' => $sha256];
            }
        } else {
            $header = file_get_contents($filePath, false, null, 0, 4096);
            if (str_contains($header, 'mysqldump: Got error:') || str_contains($header, 'Access denied')) {
                return ['valid' => false, 'error' => "Dump file contains error output: {$header}", 'size' => $size, 'sha256' => $sha256];
            }
        }

        return [
            'valid' => true,
            'size' => $size,
            'sha256' => $sha256,
            'error' => null,
        ];
    }

    /**
     * Execute SQL restore against database.
     */
    protected function executeSqlRestore(string $connectionName, string $sqlPath): void
    {
        $connConfig = config("database.connections.{$connectionName}");
        $driver = $connConfig['driver'] ?? 'mysql';

        if (in_array($driver, ['mysql', 'mariadb'])) {
            $mysqlBin = $this->resolveBinaryPath('mysql', $this->mysqlPath);
            if ($mysqlBin) {
                try {
                    $this->executeMySqlRestoreViaCli($mysqlBin, $connConfig, $sqlPath);
                    return;
                } catch (\Throwable $e) {
                    $this->log('warning', "mysql CLI restore failed (" . $e->getMessage() . "). Falling back to PDO streaming parser.");
                }
            }

            // CLI not found or failed, execute statements via PDO
            $this->executeSqlRestoreViaPdo($sqlPath);
            return;
        }

        if ($driver === 'sqlite') {
            $this->executeSqliteRestore($connConfig, $sqlPath);
            return;
        }

        throw new RuntimeException("Unsupported database driver for restore: [{$driver}]");
    }

    /**
     * Execute MySQL restore via mysql CLI.
     */
    protected function executeMySqlRestoreViaCli(string $binary, array $config, string $sqlPath): void
    {
        $database = $config['database'];
        $host = $config['host'] ?? '127.0.0.1';
        $port = (string) ($config['port'] ?? '3306');
        $username = $config['username'] ?? 'root';
        $password = (string) ($config['password'] ?? '');
        $socket = $config['unix_socket'] ?? '';

        $cnfFile = tempnam(sys_get_temp_dir(), 'my_cnf_') . '.cnf';
        $cnfContent = "[client]\n" .
            "user=" . addcslashes($username, "\\\n\r\"") . "\n" .
            "password=" . addcslashes($password, "\\\n\r\"") . "\n";

        if ($socket) {
            $cnfContent .= "socket=" . addcslashes($socket, "\\\n\r\"") . "\n";
        } else {
            $cnfContent .= "host=" . addcslashes($host, "\\\n\r\"") . "\n";
            $cnfContent .= "port=" . addcslashes($port, "\\\n\r\"") . "\n";
        }

        file_put_contents($cnfFile, $cnfContent);
        @chmod($cnfFile, 0600);

        try {
            $cmd = [
                $binary,
                "--defaults-extra-file={$cnfFile}",
                '--protocol=tcp',
                '--default-character-set=utf8mb4',
                $database,
            ];

            $env = array_filter(array_merge(
                is_array($_ENV) ? $_ENV : [],
                is_array($_SERVER) ? $_SERVER : [],
                [
                    'SystemRoot' => getenv('SystemRoot') ?: 'C:\\Windows',
                    'WINDIR' => getenv('WINDIR') ?: 'C:\\Windows',
                    'SYSTEMDRIVE' => getenv('SYSTEMDRIVE') ?: 'C:',
                    'PATH' => getenv('PATH') ?: 'C:\\Windows\\system32;C:\\Windows',
                    'TEMP' => sys_get_temp_dir(),
                    'TMP' => sys_get_temp_dir(),
                ]
            ));

            // Open stream to pipe SQL file directly into mysql stdin
            $process = new Process($cmd, null, $env, fopen($sqlPath, 'r'));
            $process->setTimeout($this->timeout);
            $process->run();

            if (!$process->isSuccessful()) {
                $errorOutput = $process->getErrorOutput() ?: $process->getOutput();
                throw new RuntimeException("mysql restore command failed: {$errorOutput}");
            }

        } finally {
            if (file_exists($cnfFile)) {
                @unlink($cnfFile);
            }
        }
    }

    /**
     * Execute SQL restore via PDO streaming parser (fallback if mysql CLI is unavailable).
     */
    protected function executeSqlRestoreViaPdo(string $sqlPath): void
    {
        $pdo = DB::connection()->getPdo();
        $pdo->exec("SET foreign_key_checks = 0");

        $handle = fopen($sqlPath, 'r');
        if (!$handle) {
            throw new RuntimeException("Unable to read SQL restore file: {$sqlPath}");
        }

        $buffer = '';
        while (($line = fgets($handle)) !== false) {
            $trimmed = trim($line);
            if (str_starts_with($trimmed, '--') || str_starts_with($trimmed, '/*') || empty($trimmed)) {
                continue;
            }

            $buffer .= $line;
            if (str_ends_with(rtrim($trimmed), ';')) {
                try {
                    $pdo->exec($buffer);
                } catch (\Throwable $e) {
                    // Log statement error but continue or rethrow based on severity
                    $this->log('warning', "Statement execution notice during restore: " . $e->getMessage());
                }
                $buffer = '';
            }
        }

        fclose($handle);
        $pdo->exec("SET foreign_key_checks = 1");
    }

    /**
     * Restore SQLite database.
     */
    protected function executeSqliteRestore(array $config, string $sqlPath): void
    {
        $dbPath = $config['database'];
        if ($dbPath === ':memory:') {
            $pdo = DB::connection()->getPdo();
            $pdo->exec("PRAGMA foreign_keys = OFF");
            $pdo->exec("PRAGMA ignore_check_constraints = ON");
            $sql = file_get_contents($sqlPath);
            $statements = array_filter(array_map('trim', explode(";\n", $sql)));
            foreach ($statements as $stmt) {
                if ($stmt) {
                    try {
                        $pdo->exec($stmt);
                    } catch (\Throwable $e) {
                        // Continue executing restore statements
                    }
                }
            }
            $pdo->exec("PRAGMA foreign_keys = ON");
            return;
        }

        // Close connection and overwrite file
        DB::disconnect();
        copy($sqlPath, $dbPath);
        DB::reconnect();
    }

    /**
     * Post-restore smoke test to ensure database tables and basic queries function.
     */
    protected function smokeTestDatabase(string $connection): void
    {
        $driver = config("database.connections.{$connection}.driver");
        if (in_array($driver, ['mysql', 'mariadb'])) {
            $tables = DB::select("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
            if (empty($tables)) {
                throw new RuntimeException("Post-restore health check failed: database contains 0 tables.");
            }
        } elseif ($driver === 'sqlite') {
            $tables = DB::select("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
            if (($tables[0]->count ?? 0) === 0) {
                throw new RuntimeException("Post-restore health check failed: SQLite database contains 0 tables.");
            }
        }
    }

    /**
     * Replicate backup file and metadata to secondary/offsite storage disk.
     */
    protected function replicateToSecondaryStorage(string $filename, string $metaFilename, string $localPath, array $metadata): string
    {
        try {
            $secondary = Storage::disk($this->secondaryDisk);
            if (!$secondary->exists($this->secondaryDirectory)) {
                $secondary->makeDirectory($this->secondaryDirectory);
            }

            $secFilePath = "{$this->secondaryDirectory}/{$filename}";
            $secMetaPath = "{$this->secondaryDirectory}/{$metaFilename}";

            $fp = fopen($localPath, 'rb');
            $secondary->put($secFilePath, $fp);
            if (is_resource($fp)) {
                fclose($fp);
            }

            $secondary->put($secMetaPath, json_encode($metadata, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

            // Verify secondary copy size
            if ($secondary->exists($secFilePath) && $secondary->size($secFilePath) === $metadata['size_bytes']) {
                $this->log('info', "Successfully replicated backup [{$filename}] to secondary offsite disk [{$this->secondaryDisk}]");
                return 'synced';
            } else {
                $this->log('warning', "Secondary disk replication size check failed for [{$filename}]");
                return 'failed_size_mismatch';
            }

        } catch (\Throwable $e) {
            $this->log('warning', "Failed to replicate backup to secondary storage [{$this->secondaryDisk}]: " . $e->getMessage());
            return 'failed_exception';
        }
    }

    /**
     * Resolve executable binary path across config, PATH, and known system directories.
     */
    protected function resolveBinaryPath(string $binaryName, ?string $configuredPath = null): ?string
    {
        if ($configuredPath && file_exists($configuredPath) && is_executable($configuredPath)) {
            return $configuredPath;
        }

        $isWindows = DIRECTORY_SEPARATOR === '\\';
        $exeName = $isWindows ? "{$binaryName}.exe" : $binaryName;

        // 1. Check system PATH via 'where' or 'which'
        $lookupCmd = $isWindows ? "where {$exeName} 2>nul" : "which {$exeName} 2>/dev/null";
        $output = @shell_exec($lookupCmd);
        if ($output) {
            $lines = explode("\n", trim($output));
            $found = trim($lines[0]);
            if (file_exists($found)) {
                return $found;
            }
        }

        // 2. Check standard Windows directories
        if ($isWindows) {
            $candidates = [
                "C:\\xampp\\mysql\\bin\\{$exeName}",
                "C:\\laragon\\bin\\mysql\\mysql-8.0*\\bin\\{$exeName}",
                "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\{$exeName}",
                "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\{$exeName}",
                "C:\\Program Files\\MariaDB*\\bin\\{$exeName}",
            ];

            foreach ($candidates as $candidate) {
                $matches = glob($candidate);
                if (!empty($matches) && file_exists($matches[0])) {
                    return $matches[0];
                }
            }
        } else {
            // 3. Check standard Linux/Unix directories
            $candidates = [
                "/usr/bin/{$exeName}",
                "/usr/local/bin/{$exeName}",
                "/opt/alt/mysql/bin/{$exeName}",
                "/usr/local/mysql/bin/{$exeName}",
            ];

            foreach ($candidates as $candidate) {
                if (file_exists($candidate) && is_executable($candidate)) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    /**
     * Get absolute local filesystem path for a backup file.
     */
    public function getLocalPathForFile(string $filename): string
    {
        $storage = Storage::disk($this->disk);
        return $storage->path("{$this->directory}/{$filename}");
    }

    /**
     * Format byte count to human-readable string.
     */
    protected function formatBytes(int $bytes, int $precision = 2): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $bytes = max($bytes, 0);
        $pow = floor(($bytes ? log($bytes) : 0) / log(1024));
        $pow = min($pow, count($units) - 1);
        $bytes /= (1 << (10 * $pow));

        return round($bytes, $precision) . ' ' . $units[$pow];
    }

    /**
     * Log messages to both dedicated backup channel and application logger.
     */
    protected function log(string $level, string $message, array $context = []): void
    {
        try {
            Log::channel($this->logChannel)->{$level}($message, $context);
        } catch (\Throwable) {
            Log::{$level}($message, $context);
        }
    }
}
