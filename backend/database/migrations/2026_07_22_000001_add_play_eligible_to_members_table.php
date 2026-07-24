<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('members', function (Blueprint $table) {
            $table->boolean('play_eligible')->default(false)->after('training_eligible');
        });

        // Opt-in for juniors on approve; adults use club membership for play.
        DB::table('members')->update(['play_eligible' => false]);
    }

    public function down(): void
    {
        Schema::table('members', function (Blueprint $table) {
            $table->dropColumn('play_eligible');
        });
    }
};
