<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('training_dates', function (Blueprint $table) {
            $table->string('refund_status')->nullable()->after('attended');
            $table->decimal('refund_amount', 10, 2)->nullable()->after('refund_status');
        });
    }

    public function down(): void
    {
        Schema::table('training_dates', function (Blueprint $table) {
            $table->dropColumn(['refund_status', 'refund_amount']);
        });
    }
};
