<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('play_invitations') || Schema::hasColumn('play_invitations', 'debited_amount')) {
            return;
        }

        Schema::table('play_invitations', function (Blueprint $table) {
            // Snapshot of the exact amount charged when the invite was debited,
            // so refunds return what was actually paid even if rates/discounts change.
            $table->decimal('debited_amount', 10, 2)->nullable();
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('play_invitations') || !Schema::hasColumn('play_invitations', 'debited_amount')) {
            return;
        }

        Schema::table('play_invitations', function (Blueprint $table) {
            $table->dropColumn('debited_amount');
        });
    }
};
