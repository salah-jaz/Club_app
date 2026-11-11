<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('users', 'privacy_accepted_at')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('privacy_accepted_at')->nullable();
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('users', 'privacy_accepted_at')) {
            return;
        }

        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('privacy_accepted_at');
        });
    }
};
