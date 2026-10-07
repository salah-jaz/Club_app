<?php
require __DIR__.'/vendor/autoload.php';
$app = require __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$t = json_decode(\App\Models\Setting::where('key', 'email_templates')->value('value'), true);
$t['registration']['is_enabled'] = false;
$t['approval']['is_enabled'] = false;
\App\Models\Setting::where('key', 'email_templates')->update(['value' => json_encode($t)]);

$controller = app()->make(\App\Http\Controllers\Api\SettingController::class);
$data = $controller->index()->getData(true);
echo json_encode(['registration' => $data['emailTemplates']['registration'], 'approval' => $data['emailTemplates']['approval']]);
