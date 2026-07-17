<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('members', function (Blueprint $table) {
            $table->string('parent_member_id')->nullable()->after('user_id');
            $table->foreign('parent_member_id')
                ->references('id')
                ->on('members')
                ->nullOnDelete();
        });

        // Backfill family links for existing data
        $adults = DB::table('members')->where('member_type', 'adult')->get();
        $juniors = DB::table('members')->where('member_type', 'junior')->whereNull('parent_member_id')->get();

        $adultsByUser = [];
        $adultsByLast = [];
        $adultsByBiNum = [];
        foreach ($adults as $a) {
            if ($a->user_id) {
                $adultsByUser[$a->user_id] = $a;
            }
            $ln = strtolower(trim((string) $a->last_name));
            if ($ln !== '') {
                $adultsByLast[$ln] = $adultsByLast[$ln] ?? [];
                $adultsByLast[$ln][] = $a;
            }
            if (preg_match('/(\d+)/', (string) $a->bi_member_id, $m)) {
                $adultsByBiNum[(int) $m[1]] = $a;
            }
        }

        foreach ($juniors as $j) {
            $parent = null;

            // 1) Same login account as an adult
            if ($j->user_id && isset($adultsByUser[$j->user_id])) {
                $parent = $adultsByUser[$j->user_id];
            }

            // 2) Same last name (family surname)
            if (!$parent) {
                $ln = strtolower(trim((string) $j->last_name));
                if ($ln !== '' && !empty($adultsByLast[$ln])) {
                    $parent = $adultsByLast[$ln][0];
                }
            }

            // 3) Template-style BI pairing: BI-11 → BI-01, BI-12 → BI-02, …
            if (!$parent && preg_match('/(\d+)/', (string) $j->bi_member_id, $m)) {
                $num = (int) $m[1];
                if ($num > 10 && isset($adultsByBiNum[$num - 10])) {
                    $parent = $adultsByBiNum[$num - 10];
                }
            }

            if (!$parent) {
                continue;
            }

            DB::table('members')->where('id', $j->id)->update([
                'parent_member_id' => $parent->id,
                // Attach junior to the parent's login so family features keep working
                'user_id' => $parent->user_id ?: $j->user_id,
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('members', function (Blueprint $table) {
            $table->dropForeign(['parent_member_id']);
            $table->dropColumn('parent_member_id');
        });
    }
};
