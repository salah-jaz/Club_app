import type { PlaySchedule, Training } from "./types";

export type SessionPhase = "upcoming" | "in_progress" | "finished";

/** Parse values like "1 hour", "2 Hours", "90 min", "1.5 hours" into minutes. */
export function parseDurationMinutes(duration: string | null | undefined): number {
  const raw = String(duration ?? "").trim().toLowerCase();
  if (!raw) return 60;

  const match = raw.match(/(\d+(?:\.\d+)?)\s*(hour|hours|hr|hrs|h|minute|minutes|min|mins|m)\b/);
  if (match) {
    const value = parseFloat(match[1]);
    const unit = match[2];
    if (value > 0) {
      if (unit.startsWith("h")) return Math.max(1, Math.round(value * 60));
      return Math.max(1, Math.round(value));
    }
  }

  const numeric = raw.match(/(\d+(?:\.\d+)?)/);
  if (numeric) {
    const value = parseFloat(numeric[1]);
    if (value > 0) return Math.max(1, Math.round(value));
  }

  return 60;
}

export function datetimeLocalNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function isScheduleDateTimeInPast(value: string, nowMs: number = Date.now()): boolean {
  const ms = Date.parse(value);
  return !Number.isFinite(ms) || ms < nowMs;
}

export function getSessionPhase(
  startIso: string,
  durationMinutes: number,
  nowMs: number = Date.now(),
): SessionPhase {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return "upcoming";

  const endMs = startMs + Math.max(1, durationMinutes) * 60_000;
  if (nowMs < startMs) return "upcoming";
  if (nowMs < endMs) return "in_progress";
  return "finished";
}

export function getPlaySessionDurationMinutes(sch: Pick<PlaySchedule, "slotHours">): number {
  const hours = Number(sch.slotHours);
  if (Number.isFinite(hours) && hours > 0) {
    return Math.max(1, Math.round(hours * 60));
  }
  return 60;
}

export function getPlaySessionPhase(
  sch: Pick<PlaySchedule, "date" | "slotHours">,
  nowMs?: number,
): SessionPhase {
  return getSessionPhase(sch.date, getPlaySessionDurationMinutes(sch), nowMs);
}

export function getTrainingSessionDurationMinutes(
  tr: Pick<Training, "startDate" | "endDate" | "duration">,
): number {
  const startMs = Date.parse(tr.startDate);
  const endMs = Date.parse(tr.endDate);
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    return Math.max(1, Math.round((endMs - startMs) / 60_000));
  }
  return parseDurationMinutes(tr.duration);
}

export function getTrainingSessionPhase(
  tr: Pick<Training, "startDate" | "endDate" | "duration">,
  nowMs?: number,
): SessionPhase {
  return getSessionPhase(tr.startDate, getTrainingSessionDurationMinutes(tr), nowMs);
}

export function sessionPhaseLabel(phase: SessionPhase): string {
  if (phase === "in_progress") return "In Progress";
  if (phase === "finished") return "Finished";
  return "";
}

export function aggregateOpenInvitePhase(
  sessions: Array<Pick<Training, "startDate" | "endDate" | "duration">>,
  nowMs?: number,
): SessionPhase | null {
  if (sessions.length === 0) return null;

  const phases = sessions.map((s) => getTrainingSessionPhase(s, nowMs));
  if (phases.some((p) => p === "in_progress")) return "in_progress";
  if (phases.every((p) => p === "finished")) return "finished";
  if (phases.some((p) => p === "upcoming")) return "upcoming";
  return "finished";
}
