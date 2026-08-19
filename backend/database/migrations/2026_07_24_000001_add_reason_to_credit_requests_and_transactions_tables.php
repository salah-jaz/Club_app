<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('credit_requests', function (Blueprint $table) {
            if (!Schema::hasColumn('credit_requests', 'reason')) {
                $table->text('reason')->nullable()->after('status');
            }
        });

        Schema::table('transactions', function (Blueprint $table) {
            if (!Schema::hasColumn('transactions', 'reason')) {
                $table->text('reason')->nullable()->after('description');
            }
        });
    }

    public function down(): void
    {
        Schema::table('credit_requests', function (Blueprint $table) {
            if (Schema::hasColumn('credit_requests', 'reason')) {
                $table->dropColumn('reason');
            }
        });

        Schema::table('transactions', function (Blueprint $table) {
            if (Schema::hasColumn('transactions', 'reason')) {
                $table->dropColumn('reason');
            }
        });
    }
};
