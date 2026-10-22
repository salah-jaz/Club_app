<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fixtures', function (Blueprint $table) {
            $table->string('result')->nullable()->after('status');
            $table->string('home_team_name')->nullable()->after('result');
            $table->integer('home_total_matches')->nullable()->after('home_team_name');
            $table->integer('home_total_games')->nullable()->after('home_total_matches');
            $table->integer('home_total_points')->nullable()->after('home_total_games');
            $table->string('visiting_team_name')->nullable()->after('home_total_points');
            $table->integer('visiting_total_matches')->nullable()->after('visiting_team_name');
            $table->integer('visiting_total_games')->nullable()->after('visiting_total_matches');
            $table->integer('visiting_total_points')->nullable()->after('visiting_total_games');
        });
    }

    public function down(): void
    {
        Schema::table('fixtures', function (Blueprint $table) {
            $table->dropColumn([
                'result',
                'home_team_name',
                'home_total_matches',
                'home_total_games',
                'home_total_points',
                'visiting_team_name',
                'visiting_total_matches',
                'visiting_total_games',
                'visiting_total_points',
            ]);
        });
    }
};
