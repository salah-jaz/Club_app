<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('fixtures', function (Blueprint $table) {
            $table->string('status', 50)->default('Created')->change();
            if (!Schema::hasColumn('fixtures', 'club_location')) {
                $table->string('club_location')->nullable()->after('team_name');
            }
            if (!Schema::hasColumn('fixtures', 'home_captain_email')) {
                $table->text('home_captain_email')->nullable()->after('club_location');
            }
            if (!Schema::hasColumn('fixtures', 'opposition_captain_email')) {
                $table->text('opposition_captain_email')->nullable()->after('home_captain_email');
            }
        });

        // Migrate existing status records safely to new statuses
        DB::table('fixtures')->where('status', 'Opened')->update(['status' => 'Created']);
        DB::table('fixtures')->where('status', 'In Progress')->update(['status' => 'Scheduled']);
        DB::table('fixtures')->where('status', 'Closed')->update(['status' => 'Completed']);
    }

    public function down(): void
    {
        // Revert status migration
        DB::table('fixtures')->where('status', 'Created')->update(['status' => 'Opened']);
        DB::table('fixtures')->where('status', 'Scheduled')->update(['status' => 'In Progress']);
        DB::table('fixtures')->where('status', 'Completed')->update(['status' => 'Closed']);

        Schema::table('fixtures', function (Blueprint $table) {
            $table->enum('status', ['Opened', 'In Progress', 'Closed'])->default('Opened')->change();
            $table->dropColumn([
                'club_location',
                'home_captain_email',
                'opposition_captain_email',
            ]);
        });
    }
};
