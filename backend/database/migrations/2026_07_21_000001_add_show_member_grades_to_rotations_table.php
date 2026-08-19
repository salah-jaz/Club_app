<?php

use App\Models\Setting;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rotations', function (Blueprint $table) {
            $table->boolean('show_member_grades')->default(false)->after('rounds');
        });

        // Preserve current club preference on existing rotations
        $show = Setting::where('key', 'show_grade_in_court_rotation')->value('value') === 'true';
        if ($show) {
            DB::table('rotations')->update(['show_member_grades' => true]);
        }
    }

    public function down(): void
    {
        Schema::table('rotations', function (Blueprint $table) {
            $table->dropColumn('show_member_grades');
        });
    }
};
