<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('training_invitations', function (Blueprint $table) {
            if (!Schema::hasColumn('training_invitations', 'apply_discount')) {
                $table->boolean('apply_discount')->nullable()->after('status');
            }
            if (!Schema::hasColumn('training_invitations', 'calculated_monthly_fee')) {
                $table->decimal('calculated_monthly_fee', 10, 2)->nullable()->after('status');
            }
            if (!Schema::hasColumn('training_invitations', 'calculated_per_session_fee')) {
                $table->decimal('calculated_per_session_fee', 10, 2)->nullable()->after('status');
            }
        });
    }

    public function down(): void
    {
        Schema::table('training_invitations', function (Blueprint $table) {
            $columns = [];
            if (Schema::hasColumn('training_invitations', 'apply_discount')) {
                $columns[] = 'apply_discount';
            }
            if (Schema::hasColumn('training_invitations', 'calculated_monthly_fee')) {
                $columns[] = 'calculated_monthly_fee';
            }
            if (Schema::hasColumn('training_invitations', 'calculated_per_session_fee')) {
                $columns[] = 'calculated_per_session_fee';
            }
            if (!empty($columns)) {
                $table->dropColumn($columns);
            }
        });
    }
};
