<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // MySQL treated the first `timestamp` column as ON UPDATE CURRENT_TIMESTAMP,
        // so any schedule save (e.g. generate rotation) overwrote the session date with NOW().
        Schema::table('play_schedules', function (Blueprint $table) {
            $table->dateTime('date')->nullable(false)->change();
        });

        // Best-effort restore from names like "Thursday · Jul 30, 2026 · 6:13 PM"
        $schedules = DB::table('play_schedules')->select('id', 'name', 'date')->get();
        foreach ($schedules as $sch) {
            $parsed = $this->parseScheduleNameDate($sch->name);
            if ($parsed === null) {
                continue;
            }

            // Only rewrite when the stored date looks like it was clobbered (differs from name)
            $stored = \Carbon\Carbon::parse($sch->date);
            if (abs($stored->diffInMinutes($parsed)) >= 2) {
                DB::table('play_schedules')->where('id', $sch->id)->update(['date' => $parsed]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('play_schedules', function (Blueprint $table) {
            $table->timestamp('date')->nullable(false)->change();
        });
    }

    private function parseScheduleNameDate(string $name): ?\Carbon\Carbon
    {
        // "Thursday · Jul 30, 2026 · 6:13 PM" or "Tuesday · 21 Jul 2026 · 11:36 AM"
        if (!preg_match('/·\s*(.+?)\s*·\s*(.+)$/u', $name, $m)) {
            return null;
        }

        $datePart = trim($m[1]);
        $timePart = trim($m[2]);
        try {
            return \Carbon\Carbon::parse($datePart . ' ' . $timePart);
        } catch (\Throwable $e) {
            return null;
        }
    }
};
