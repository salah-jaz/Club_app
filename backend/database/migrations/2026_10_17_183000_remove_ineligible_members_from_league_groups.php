<?php

use App\Models\Member;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Automatically remove members whose club membership is OFF from all league groups
        DB::table('league_group_member')
            ->whereIn('member_id', Member::where('membership', false)->pluck('id'))
            ->delete();
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Deletions cannot be reversed automatically
    }
};
