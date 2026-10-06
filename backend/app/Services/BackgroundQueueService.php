<?php

namespace App\Services;

class BackgroundQueueService
{
    /**
     * Trigger background queue processing if not running in tests.
     * This ensures queued jobs (such as email notifications) execute
     * even if a persistent queue worker is not running in local dev.
     */
    public static function runBackgroundQueue(): void
    {
        if (app()->environment('testing')) {
            return;
        }

        try {
            $phpBinary = (new \Symfony\Component\Process\PhpExecutableFinder())->find() ?: 'php';
            $basePath = base_path();

            if (PHP_OS_FAMILY === 'Windows') {
                $cmd = 'powershell -WindowStyle Hidden -Command "Start-Process \'' . addslashes($phpBinary) . '\' -ArgumentList \'artisan queue:work --stop-when-empty --tries=1\' -WorkingDirectory \'' . addslashes($basePath) . '\' -NoNewWindow"';
                @pclose(@popen($cmd, 'r'));
            } else {
                $cmd = 'nohup "' . $phpBinary . '" artisan queue:work --stop-when-empty --tries=1 > /dev/null 2>&1 &';
                @pclose(@popen($cmd, 'r'));
            }
        } catch (\Throwable $e) {
            logger()->error('Failed to launch background queue worker: ' . $e->getMessage());
        }
    }
}
