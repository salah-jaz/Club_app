import { describe, expect, it } from "vitest";
import {
  aggregateTrainingSchedulePhase,
  resolveTrainingDisplayStatus,
} from "./sessionTiming";

describe("aggregateTrainingSchedulePhase", () => {
  const sessions = [
    { startDate: "2026-11-10 18:00:00", endDate: "2026-11-10 19:00:00", duration: "1 hour" },
    { startDate: "2026-11-17 18:00:00", endDate: "2026-11-17 19:00:00", duration: "1 hour" },
    { startDate: "2026-11-24 18:00:00", endDate: "2026-11-24 19:00:00", duration: "1 hour" },
  ];

  it("returns upcoming before the first session", () => {
    const nov9 = Date.parse("2026-11-09T12:00:00");
    expect(aggregateTrainingSchedulePhase(sessions, nov9)).toBe("upcoming");
    expect(resolveTrainingDisplayStatus("released", "upcoming")).toBe("pending");
  });

  it("returns in_progress from first session start until the last session ends", () => {
    const nov10Evening = Date.parse("2026-11-10T18:30:00");
    const betweenSessions = Date.parse("2026-11-12T12:00:00");
    expect(aggregateTrainingSchedulePhase(sessions, nov10Evening)).toBe("in_progress");
    expect(aggregateTrainingSchedulePhase(sessions, betweenSessions)).toBe("in_progress");
    expect(resolveTrainingDisplayStatus("released", "in_progress")).toBe("in_progress");
  });

  it("returns finished after the final session ends", () => {
    const afterLast = Date.parse("2026-11-24T20:00:00");
    expect(aggregateTrainingSchedulePhase(sessions, afterLast)).toBe("finished");
    expect(resolveTrainingDisplayStatus("released", "finished")).toBe("completed");
  });
});
