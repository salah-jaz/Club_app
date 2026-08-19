<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('play_invitations', function (Blueprint $table) {
            $table->timestamp('accepted_at')->nullable()->after('status');
        });

        // Best-effort backfill for already-accepted invites
        DB::table('play_invitations')
            ->where('status', 'accepted')
            ->whereNull('accepted_at')
            ->update(['accepted_at' => DB::raw('updated_at')]);
    }

    public function down(): void
    {
        Schema::table('play_invitations', function (Blueprint $table) {
            $table->dropColumn('accepted_at');
        });
    }
};
