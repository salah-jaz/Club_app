<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('training_update_requests', function (Blueprint $table) {
            $table->decimal('previously_paid_amount', 10, 2)->default(0.00)->after('new_session_ids');
            $table->decimal('updated_monthly_fee', 10, 2)->default(0.00)->after('previously_paid_amount');
            $table->decimal('new_per_session_fee', 10, 2)->default(0.00)->after('updated_monthly_fee');
        });
    }

    public function down(): void
    {
        Schema::table('training_update_requests', function (Blueprint $table) {
            $table->dropColumn([
                'previously_paid_amount',
                'updated_monthly_fee',
                'new_per_session_fee',
            ]);
        });
    }
};
