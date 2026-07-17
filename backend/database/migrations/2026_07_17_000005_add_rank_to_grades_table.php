<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('grades', function (Blueprint $table) {
            $table->unsignedInteger('rank')->default(0)->after('type');
        });

        foreach (['adult', 'junior'] as $type) {
            $grades = DB::table('grades')
                ->where('type', $type)
                ->orderBy('id')
                ->get();

            $rank = 1;
            foreach ($grades as $grade) {
                DB::table('grades')
                    ->where('id', $grade->id)
                    ->update(['rank' => $rank]);
                $rank++;
            }
        }
    }

    public function down(): void
    {
        Schema::table('grades', function (Blueprint $table) {
            $table->dropColumn('rank');
        });
    }
};
