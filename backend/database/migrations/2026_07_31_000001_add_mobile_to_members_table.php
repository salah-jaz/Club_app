<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('members', 'mobile')) {
            Schema::table('members', function (Blueprint $table) {
                $table->string('mobile')->nullable()->after('email');
            });
        }

        // Backfill members.mobile from users.mobile if user_id exists
        try {
            DB::statement("UPDATE members JOIN users ON members.user_id = users.id SET members.mobile = users.mobile WHERE (members.mobile IS NULL OR members.mobile = '') AND users.mobile IS NOT NULL AND users.mobile != ''");
        } catch (\Throwable $e) {
            // Log fallback if DB engine differs
            logger()->warning("Could not backfill members.mobile via JOIN: " . $e->getMessage());
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('members', 'mobile')) {
            Schema::table('members', function (Blueprint $table) {
                $table->dropColumn('mobile');
            });
        }
    }
};
