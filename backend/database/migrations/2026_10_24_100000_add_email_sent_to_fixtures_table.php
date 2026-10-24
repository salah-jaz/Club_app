<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fixtures', function (Blueprint $table) {
            if (!Schema::hasColumn('fixtures', 'email_sent')) {
                $table->boolean('email_sent')->default(false)->after('opposition_captain_email');
            }
            if (!Schema::hasColumn('fixtures', 'email_sent_at')) {
                $table->timestamp('email_sent_at')->nullable()->after('email_sent');
            }
        });
    }

    public function down(): void
    {
        Schema::table('fixtures', function (Blueprint $table) {
            if (Schema::hasColumn('fixtures', 'email_sent_at')) {
                $table->dropColumn('email_sent_at');
            }
            if (Schema::hasColumn('fixtures', 'email_sent')) {
                $table->dropColumn('email_sent');
            }
        });
    }
};
