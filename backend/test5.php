<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
echo "Total members: " . App\Models\Member::count() . "\n";
echo "Total without REFERENCE: " . App\Models\Member::where('first_name', 'not like', '%REFERENCE%')->count() . "\n";
