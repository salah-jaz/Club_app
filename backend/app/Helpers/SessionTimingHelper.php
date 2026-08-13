<?php

namespace App\Helpers;

use App\Models\PlaySchedule;
use App\Models\Training;
use Carbon\Carbon;

class SessionTimingHelper
{
    public const PHASE_UPCOMING = 'upcoming';
    public const PHASE_IN_PROGRESS = 'in_progress';
    public const PHASE_FINISHED = 'finished';

    public static function parseDurationMinutes(?string $duration): int
    {
        $raw = strtolower(trim((string) $duration));
        if ($raw === '') {
            return 60;
        }

        if (preg_match('/(\d+(?:\.\d+)?)\s*(hour|hours|hr|hrs|h|minute|minutes|min|mins|m)\b/', $raw, $matches)) {
            $value = (float) $matches[1];
            $unit = $matches[2];
            if ($value > 0) {
                if (str_starts_with($unit, 'h')) {
                    return max(1, (int) round($value * 60));
                }

                return max(1, (int) round($value));
            }
        }

        if (preg_match('/(\d+(?:\.\d+)?)/', $raw, $matches)) {
            $value = (float) $matches[1];
            if ($value > 0) {
                return max(1, (int) round($value));
            }
        }

        return 60;
    }

    public static function assertScheduleNotInPast(string $dateTime): ?string
    {
        if (Carbon::parse($dateTime)->lt(now())) {
            return 'Schedule date and time must be today or later.';
        }

        return null;
    }

    public static function playSessionEnd(PlaySchedule $schedule): Carbon
    {
        $start = Carbon::parse($schedule->date);
        $hours = (float) ($schedule->slot_hours ?? 0);
        $minutes = $hours > 0 ? max(1, (int) round($hours * 60)) : 60;

        return $start->copy()->addMinutes($minutes);
    }

    public static function trainingSessionEnd(Training $training): Carbon
    {
        $start = Carbon::parse($training->start_date);
        if (!empty($training->end_date)) {
            $end = Carbon::parse($training->end_date);
            if ($end->gt($start)) {
                return $end;
            }
        }

        return $start->copy()->addMinutes(self::parseDurationMinutes($training->duration ?? '1 hour'));
    }

    public static function phase(Carbon $start, Carbon $end, ?Carbon $now = null): string
    {
        $now = $now ?? now();

        if ($now->lt($start)) {
            return self::PHASE_UPCOMING;
        }

        if ($now->lt($end)) {
            return self::PHASE_IN_PROGRESS;
        }

        return self::PHASE_FINISHED;
    }

    public static function playSessionPhase(PlaySchedule $schedule, ?Carbon $now = null): string
    {
        $start = Carbon::parse($schedule->date);

        return self::phase($start, self::playSessionEnd($schedule), $now);
    }

    public static function trainingSessionPhase(Training $training, ?Carbon $now = null): string
    {
        $start = Carbon::parse($training->start_date);

        return self::phase($start, self::trainingSessionEnd($training), $now);
    }

    public static function acceptBlockedMessage(string $phase): ?string
    {
        if ($phase === self::PHASE_IN_PROGRESS) {
            return 'This session is in progress. Accept and payment are no longer available.';
        }

        if ($phase === self::PHASE_FINISHED) {
            return 'This session has finished. Accept and payment are no longer available.';
        }

        return null;
    }

    public static function actionsBlockedMessage(string $phase): ?string
    {
        if ($phase === self::PHASE_FINISHED) {
            return 'This session has finished. No further actions are available.';
        }

        return null;
    }
}
