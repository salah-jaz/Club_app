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
            $table->boolean('auto_accept_league')->default(false)->after('league_group_ids');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('play_schedules', function (Blueprint $table) {
            $table->dropColumn('auto_accept_league');
        });
    }
};
