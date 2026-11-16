<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Automated Backup Schedule Time
    |--------------------------------------------------------------------------
    |
    | The daily time at which the automated database backup should run.
    | Default is '02:00' (2:00 AM server time).
    |
    */
    'daily_time' => env('BACKUP_DAILY_TIME', '02:00'),

    /*
    |--------------------------------------------------------------------------
    | Backup Retention (Days)
    |--------------------------------------------------------------------------
    |
    | Number of days to keep automated backup files. Backups older than this
    | will be automatically pruned. Default is 30 days.
    | Strict Rule: Retention cleanup ONLY executes AFTER a new backup has been
    | successfully generated and verified.
    |
    */
    'retention_days' => (int) env('BACKUP_RETENTION_DAYS', 30),

    /*
    |--------------------------------------------------------------------------
    | Storage Disks
    |--------------------------------------------------------------------------
    |
    | Primary storage disk for backups (defined in config/filesystems.php).
    | Backups are stored in 'storage/app/backups' by default.
    | An optional secondary disk (e.g., 's3', 'ftp', 'sftp') can be configured
    | to maintain offsite / remote secondary copies.
    |
    */
    'disk' => env('BACKUP_DISK', 'local'),
    'directory' => env('BACKUP_DIRECTORY', 'backups'),
    'secondary_disk' => env('BACKUP_SECONDARY_DISK', null),
    'secondary_directory' => env('BACKUP_SECONDARY_DIRECTORY', 'backups'),

    /*
    |--------------------------------------------------------------------------
    | Compression
    |--------------------------------------------------------------------------
    |
    | Enable gzip compression (.sql.gz). Saves ~80-90% disk space.
    |
    */
    'compression' => (bool) env('BACKUP_COMPRESSION', true),
    'compression_level' => (int) env('BACKUP_COMPRESSION_LEVEL', 9),

    /*
    |--------------------------------------------------------------------------
    | Binary Paths
    |--------------------------------------------------------------------------
    |
    | Optional custom paths to mysqldump and mysql binaries. If null, the
    | service will search PATH and standard system installation directories.
    |
    */
    'mysqldump_path' => env('DB_DUMP_PATH', env('MYSQLDUMP_PATH', null)),
    'mysql_path' => env('DB_RESTORE_PATH', env('MYSQL_PATH', null)),

    /*
    |--------------------------------------------------------------------------
    | Timeout (Seconds)
    |--------------------------------------------------------------------------
    |
    | Maximum execution time for dump and restore operations.
    |
    */
    'timeout' => (int) env('BACKUP_TIMEOUT', 600),

    /*
    |--------------------------------------------------------------------------
    | Application Maintenance Mode During Restore
    |--------------------------------------------------------------------------
    |
    | Put the application in maintenance mode during database restore to
    | prevent concurrent writes and race conditions.
    |
    */
    'maintenance_during_restore' => (bool) env('BACKUP_MAINTENANCE_DURING_RESTORE', true),

    /*
    |--------------------------------------------------------------------------
    | Logging Channel
    |--------------------------------------------------------------------------
    |
    | Log channel to record backup and restore operations.
    |
    */
    'log_channel' => env('BACKUP_LOG_CHANNEL', 'backup'),
];

