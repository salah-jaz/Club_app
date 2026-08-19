<?php

namespace App\Helpers;

use App\Models\PlaySchedule;
use App\Models\Setting;
use App\Models\Training;
use Carbon\Carbon;

class SessionTimingHelper
{
    public const PHASE_UPCOMING = 'upcoming';
    public const PHASE_IN_PROGRESS = 'in_progress';
    public const PHASE_FINISHED = 'finished';

    public static function clubTimezone(): string
    {
        try {
            $tz = Setting::where('key', 'timezone')->value('value');
            if (is_string($tz) && $tz !== '' && in_array($tz, timezone_identifiers_list(), true)) {
                return $tz;
            }
        } catch (\Throwable $e) {
            // settings table may not exist during early migrations
        }

        // Match SettingController / frontend default when timezone is not saved yet.
        return 'Asia/Kolkata';
    }

    public static function applyClubTimezone(): void
    {
        $tz = self::clubTimezone();
        date_default_timezone_set($tz);
        config(['app.timezone' => $tz]);
    }

    public static function now(?Carbon $now = null): Carbon
    {
        $tz = self::clubTimezone();
        if ($now) {
            return $now->copy()->setTimezone($tz);
        }

        return Carbon::now($tz);
    }

    public static function parseDateTime(mixed $value): Carbon
    {
        $tz = self::clubTimezone();
        if ($value instanceof Carbon) {
            return Carbon::parse($value->format('Y-m-d H:i:s'), $tz);
        }

        $raw = trim((string) $value);
        $raw = str_replace('T', ' ', $raw);
        if (preg_match('/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?)/', $raw, $m)) {
            return Carbon::parse($m[1], $tz);
        }

        return Carbon::parse($raw, $tz);
    }

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
        if (self::parseDateTime($dateTime)->lt(self::now())) {
            return 'Schedule date and time must be today or later.';
        }

        return null;
    }

    public static function playSessionEnd(PlaySchedule $schedule): Carbon
    {
        $start = self::parseDateTime($schedule->date);
        $hours = (float) ($schedule->slot_hours ?? 0);
        $minutes = $hours > 0 ? max(1, (int) round($hours * 60)) : 60;

        return $start->copy()->addMinutes($minutes);
    }

    public static function trainingSessionEnd(Training $training): Carbon
    {
        $start = self::parseDateTime($training->start_date);
        if (!empty($training->end_date)) {
            $end = self::parseDateTime($training->end_date);
            if ($end->gt($start)) {
                return $end;
            }
        }

        return $start->copy()->addMinutes(self::parseDurationMinutes($training->duration ?? '1 hour'));
    }

    public static function phase(Carbon $start, Carbon $end, ?Carbon $now = null): string
    {
        $now = $now ? self::now($now) : self::now();

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
        $start = self::parseDateTime($schedule->date);

        return self::phase($start, self::playSessionEnd($schedule), $now);
    }

    public static function trainingSessionPhase(Training $training, ?Carbon $now = null): string
    {
        $start = self::parseDateTime($training->start_date);

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
