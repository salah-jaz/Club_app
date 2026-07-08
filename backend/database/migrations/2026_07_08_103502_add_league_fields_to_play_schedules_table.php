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
            $table->boolean('is_league_match')->default(false);
            $table->text('league_group_ids')->nullable(); // JSON list of IDs
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('play_schedules', function (Blueprint $table) {
            $table->dropColumn(['is_league_match', 'league_group_ids']);
        });
    }
};
