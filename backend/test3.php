<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();
$counts = App\Models\Member::select('skip_credit_consumption', \DB::raw('count(*) as total'))->groupBy('skip_credit_consumption')->get();
echo json_encode($counts);
