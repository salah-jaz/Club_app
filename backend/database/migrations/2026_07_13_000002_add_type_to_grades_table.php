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
        Schema::table('grades', function (Blueprint $table) {
            $table->string('type')->default('adult')->after('name');
        });

        // Set type for existing junior grades
        DB::table('grades')
            ->whereIn('name', ['Beginner', 'Intermediate', 'Advanced'])
            ->update(['type' => 'junior']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('grades', function (Blueprint $table) {
            $table->dropColumn('type');
        });
    }
};
