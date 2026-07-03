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
            $table->boolean('training_eligible')->default(true)->after('league');
        });

        DB::table('members')->where('member_type', 'adult')->update(['training_eligible' => false]);
        DB::table('members')->where('member_type', 'junior')->update(['training_eligible' => true]);
    }

    public function down(): void
    {
        Schema::table('members', function (Blueprint $table) {
            $table->dropColumn('training_eligible');
        });
    }
};
