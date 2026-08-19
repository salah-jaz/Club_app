<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('league_group_member', function (Blueprint $table) {
            $table->string('position')->nullable()->after('member_id');
            $table->foreign('position')->references('name')->on('player_positions')->onUpdate('cascade')->onDelete('restrict');
        });
    }

    public function down(): void
    {
        Schema::table('league_group_member', function (Blueprint $table) {
            $table->dropForeign(['position']);
            $table->dropColumn('position');
        });
    }
};
