<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trainings', function (Blueprint $table) {
            $table->integer('repeat_weeks')->default(3)->after('end_date');
            $table->integer('repeat_months')->default(1)->after('repeat_weeks');
        });
    }

    public function down(): void
    {
        Schema::table('trainings', function (Blueprint $table) {
            $table->dropColumn(['repeat_weeks', 'repeat_months']);
        });
    }
};
