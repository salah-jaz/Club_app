<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('training_invitations', function (Blueprint $table) {
            $table->decimal('accepted_monthly_fee', 10, 2)->nullable()->after('status');
            $table->integer('accepted_repeat_weeks')->nullable()->after('accepted_monthly_fee');
            $table->decimal('accepted_per_session_fee', 10, 2)->nullable()->after('accepted_repeat_weeks');
            $table->decimal('accepted_amount', 10, 2)->nullable()->after('accepted_per_session_fee');
        });
    }

    public function down(): void
    {
        Schema::table('training_invitations', function (Blueprint $table) {
            $table->dropColumn([
                'accepted_monthly_fee',
                'accepted_repeat_weeks',
                'accepted_per_session_fee',
                'accepted_amount',
            ]);
        });
    }
};
