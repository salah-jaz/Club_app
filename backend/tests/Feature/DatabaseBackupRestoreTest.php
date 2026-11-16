<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\BackupService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class DatabaseBackupRestoreTest extends TestCase
{
    use RefreshDatabase;

    protected BackupService $backupService;
    protected User $adminUser;

    protected function setUp(): void
    {
        parent::setUp();

        $this->backupService = app(BackupService::class);

        $this->adminUser = User::firstOrCreate(
            ['id' => 'u_backup_test_admin'],
            [
                'first_name' => 'Backup',
                'last_name' => 'Admin',
                'sex' => 'male',
                'dob' => '1990-01-01',
                'email' => 'backup_admin@test.com',
                'mobile' => '+1234567890',
                'address' => 'Admin HQ',
                'role' => 'admin',
                'is_super_admin' => true,
                'status' => 'active',
                'password' => bcrypt('password123'),
            ]
        );
    }

    protected function tearDown(): void
    {
        // Clean up any test backup files generated during test execution
        $storage = Storage::disk(config('backup.disk', 'local'));
        $dir = config('backup.directory', 'backups');
        if ($storage->exists($dir)) {
            foreach ($storage->files($dir) as $f) {
                if (str_contains($f, '_memory_') || str_contains($f, 'unit-test') || str_contains($f, 'verify-valid') || str_contains($f, 'baseline-restore') || str_contains($f, 'artisan-test') || str_contains($f, 'api-test')) {
                    $storage->delete($f);
                }
            }
        }

        parent::tearDown();
    }

    public function test_backup_service_creates_verified_backup_with_metadata(): void
    {
        $result = $this->backupService->createBackup(label: 'unit-test');

        $this->assertTrue($result['success']);
        $this->assertFileExists($result['path']);
        $this->assertGreaterThan(512, filesize($result['path']));

        $meta = $result['metadata'];
        $this->assertEquals($result['filename'], $meta['filename']);
        $this->assertTrue($meta['integrity_verified']);
        $this->assertNotEmpty($meta['sha256']);
        $this->assertEquals(hash_file('sha256', $result['path']), $meta['sha256']);
        $this->assertGreaterThanOrEqual(1, $meta['tables_count']);

        // Check companion .meta.json file exists
        $storage = Storage::disk(config('backup.disk', 'local'));
        $metaPath = config('backup.directory', 'backups') . '/' . $result['filename'] . '.meta.json';
        $this->assertTrue($storage->exists($metaPath));
    }

    public function test_verify_backup_detects_valid_and_corrupt_files(): void
    {
        // 1. Valid backup verification
        $result = $this->backupService->createBackup(label: 'verify-valid');
        $verifyResult = $this->backupService->verifyBackup($result['filename']);

        $this->assertTrue($verifyResult['valid']);
        $this->assertNull($verifyResult['error']);
        $this->assertEquals($result['metadata']['sha256'], $verifyResult['sha256']);

        // 2. Corrupt / altered file verification
        $corruptFilename = 'clubapp-corrupt-test.sql.gz';
        $corruptPath = $this->backupService->getLocalPathForFile($corruptFilename);

        // Write junk data that is not a valid gzip file
        file_put_contents($corruptPath, str_repeat('THIS_IS_CORRUPT_NON_GZIP_GARBAGE_', 32));

        $corruptVerify = $this->backupService->verifyBackup($corruptFilename);
        $this->assertFalse($corruptVerify['valid']);
        $this->assertNotNull($corruptVerify['error']);

        // Clean up
        @unlink($corruptPath);
    }

    public function test_retention_policy_prunes_only_expired_files_and_preserves_safety_snapshots(): void
    {
        $storage = Storage::disk(config('backup.disk', 'local'));
        $dir = config('backup.directory', 'backups');

        // Create an expired standard backup (45 days ago)
        $oldFile = 'clubapp-automated-daily-test-old.sql.gz';
        $oldPath = $this->backupService->getLocalPathForFile($oldFile);
        file_put_contents($oldPath, gzencode("-- Old Backup\nCREATE TABLE test_old (id INT);", 9));
        touch($oldPath, Carbon::now()->subDays(45)->timestamp);
        $storage->put("{$dir}/{$oldFile}.meta.json", json_encode(['filename' => $oldFile]));

        // Create a recent standard backup (5 days ago)
        $recentFile = 'clubapp-automated-daily-test-recent.sql.gz';
        $recentPath = $this->backupService->getLocalPathForFile($recentFile);
        file_put_contents($recentPath, gzencode("-- Recent Backup\nCREATE TABLE test_recent (id INT);", 9));
        touch($recentPath, Carbon::now()->subDays(5)->timestamp);
        $storage->put("{$dir}/{$recentFile}.meta.json", json_encode(['filename' => $recentFile]));

        // Create an expired safety snapshot (45 days ago - should NOT be pruned by retention)
        $oldSafetyFile = 'clubapp-safety-pre-restore-test-old.sql.gz';
        $oldSafetyPath = $this->backupService->getLocalPathForFile($oldSafetyFile);
        file_put_contents($oldSafetyPath, gzencode("-- Old Safety\nCREATE TABLE test_safety (id INT);", 9));
        touch($oldSafetyPath, Carbon::now()->subDays(45)->timestamp);
        $storage->put("{$dir}/{$oldSafetyFile}.meta.json", json_encode(['filename' => $oldSafetyFile]));

        // Run retention policy with 30 days
        $pruned = $this->backupService->enforceRetentionPolicy(30);

        // Assertions
        $this->assertContains($oldFile, $pruned);
        $this->assertNotContains($recentFile, $pruned);
        $this->assertNotContains($oldSafetyFile, $pruned);

        $this->assertFileDoesNotExist($oldPath);
        $this->assertFileExists($recentPath);
        $this->assertFileExists($oldSafetyPath);

        // Clean up
        @unlink($recentPath);
        @unlink("{$recentPath}.meta.json");
        @unlink($oldSafetyPath);
        @unlink("{$oldSafetyPath}.meta.json");
    }

    public function test_safe_restore_creates_safety_snapshot_before_modifying_database(): void
    {
        // 1. Create a baseline backup
        $baseline = $this->backupService->createBackup(label: 'baseline-restore-test');
        $this->assertTrue($baseline['success']);

        // 2. Perform safe restore
        $restoreResult = $this->backupService->restoreBackup($baseline['filename'], [
            'skip_safety_backup' => false,
            'no_maintenance' => true,
        ]);

        $this->assertTrue($restoreResult['success']);
        $this->assertNotNull($restoreResult['safety_backup']);

        // Verify safety snapshot exists on disk
        $safetyFilename = $restoreResult['safety_backup']['filename'];
        $safetyPath = $this->backupService->getLocalPathForFile($safetyFilename);
        $this->assertFileExists($safetyPath);
        $this->assertStringContainsString('safety-pre-restore', $safetyFilename);
    }

    public function test_artisan_backup_commands_execute_cleanly(): void
    {
        // 1. db:backup command
        $exitCode = Artisan::call('db:backup', ['--label' => 'artisan-test']);
        $this->assertEquals(Command::SUCCESS, $exitCode);

        // 2. db:backup:list command
        $exitCodeList = Artisan::call('db:backup:list');
        $this->assertEquals(Command::SUCCESS, $exitCodeList);

        // 3. db:backup:clean command
        $exitCodeClean = Artisan::call('db:backup:clean', ['--force' => true]);
        $this->assertEquals(Command::SUCCESS, $exitCodeClean);
    }

    public function test_admin_api_endpoints_work_properly(): void
    {
        // 1. Unauthenticated user is blocked
        $unauthResponse = $this->getJson('/api/backups');
        $unauthResponse->assertStatus(401);

        // 2. List backups (authenticated admin)
        $response = $this->actingAs($this->adminUser)->getJson('/api/backups');
        $response->assertStatus(200)
            ->assertJsonStructure([
                'backups',
                'summary' => [
                    'total_count',
                    'retention_days',
                    'daily_time',
                    'compression',
                ],
            ]);

        // 3. Trigger manual backup via API
        $createResponse = $this->actingAs($this->adminUser)->postJson('/api/backups', [
            'label' => 'api-test',
        ]);
        $createResponse->assertStatus(201)
            ->assertJsonStructure([
                'message',
                'backup' => ['filename', 'sha256', 'size_human', 'integrity_verified'],
            ]);

        $createdFilename = $createResponse->json('backup.filename');

        // 4. Verify backup via API
        $verifyResponse = $this->actingAs($this->adminUser)->postJson("/api/backups/{$createdFilename}/verify");
        $verifyResponse->assertStatus(200)
            ->assertJson([
                'filename' => $createdFilename,
                'valid' => true,
            ]);
    }
}
