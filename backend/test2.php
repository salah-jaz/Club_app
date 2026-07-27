<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

$m = App\Models\Member::where('first_name', 'not like', '%REFERENCE%')->orderBy('created_at', 'desc')->skip(1)->first();
echo json_encode($m ? $m->toArray() : []);
