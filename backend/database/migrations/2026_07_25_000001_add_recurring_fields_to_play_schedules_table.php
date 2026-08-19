<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('play_schedules', function (Blueprint $table) {
            $table->string('parent_id')->nullable()->index();
            $table->integer('repeat_weeks')->nullable()->default(1);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('play_schedules', function (Blueprint $table) {
            $table->dropColumn(['parent_id', 'repeat_weeks']);
        });
    }
};
