<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // For all members who are league participants, set membership to true
        DB::table('members')
            ->where('league', true)
            ->update(['membership' => true]);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // No down migration logic needed since we're just syncing data,
        // and cannot easily reverse which membership rows were previously league rows.
    }
};
