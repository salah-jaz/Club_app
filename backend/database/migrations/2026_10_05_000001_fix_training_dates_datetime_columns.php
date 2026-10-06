<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Helpers\SessionTimingHelper;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Change columns from date to dateTime
        Schema::table('trainings', function (Blueprint $table) {
            $table->dateTime('start_date')->nullable(false)->change();
            $table->dateTime('end_date')->nullable(false)->change();
        });

        Schema::table('training_dates', function (Blueprint $table) {
            $table->dateTime('date')->nullable(false)->change();
        });

        // 2. Best-effort backfill times for existing trainings from name
        // e.g. "Tuesday · Oct 6, 2026 · 7:00 PM" or "Tuesday · 20 Oct 2026 · 7:00 PM"
        $trainings = DB::table('trainings')->get();

        foreach ($trainings as $tr) {
            $parsedTime = $this->parseTrainingNameTime($tr->name);

            // If this item doesn't have time in name, check sibling sessions with same parent_id
            if (!$parsedTime && !empty($tr->parent_id)) {
                $siblings = DB::table('trainings')
                    ->where('parent_id', $tr->parent_id)
                    ->where('id', '!=', $tr->id)
                    ->get();
                foreach ($siblings as $sib) {
                    $parsedTime = $this->parseTrainingNameTime($sib->name);
                    if ($parsedTime) {
                        break;
                    }
                }
            }

            $startDate = \Carbon\Carbon::parse($tr->start_date);
            if ($parsedTime) {
                $startDate->setTime($parsedTime['hour'], $parsedTime['minute'], $parsedTime['second']);
            }

            $durationMins = SessionTimingHelper::parseDurationMinutes($tr->duration ?? '1 hour');
            $endDate = $startDate->copy()->addMinutes($durationMins);

            DB::table('trainings')->where('id', $tr->id)->update([
                'start_date' => $startDate->format('Y-m-d H:i:s'),
                'end_date' => $endDate->format('Y-m-d H:i:s'),
            ]);
        }

        // 3. Update existing training_dates to match trainings start_date
        $trainingDates = DB::table('training_dates')->get();
        foreach ($trainingDates as $td) {
            $parentTr = DB::table('trainings')->where('id', $td->training_id)->first();
            if ($parentTr) {
                DB::table('training_dates')->where('id', $td->id)->update([
                    'date' => $parentTr->start_date,
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('training_dates', function (Blueprint $table) {
            $table->date('date')->nullable(false)->change();
        });

        Schema::table('trainings', function (Blueprint $table) {
            $table->date('start_date')->nullable(false)->change();
            $table->date('end_date')->nullable(false)->change();
        });
    }

    private function parseTrainingNameTime(string $name): ?array
    {
        if (!preg_match('/·\s*(.+?)\s*·\s*(.+)$/u', $name, $m)) {
            return null;
        }

        $datePart = trim($m[1]);
        $timePart = trim($m[2]);

        try {
            $dt = \Carbon\Carbon::parse($datePart . ' ' . $timePart);
            return [
                'hour' => $dt->hour,
                'minute' => $dt->minute,
                'second' => $dt->second,
            ];
        } catch (\Throwable $e) {
            return null;
        }
    }
};
