import { describe, expect, it } from "bun:test";
import type { Training } from "../lib/types";
import {
  groupUpcomingTrainings,
  formatSessionMonthDay,
  sessionMonthKey,
} from "../routes/_authenticated/dashboard";

describe("Dashboard Upcoming Training Sessions Grouping", () => {
  const createMockSession = (overrides: Partial<Training>): Training => ({
    id: "tr_1",
    parentId: "tr_parent_1",
    name: "Sunday · Nov 1, 2026 · 5:00 PM @ batch",
    startDate: "2026-11-01 17:00:00",
    endDate: "2026-11-01 18:00:00",
    repeatWeeks: 4,
    repeatMonths: 1,
    sessions: 4,
    slots: 10,
    duration: "1 hour",
    fees: 100,
    coach: "Coach Lee",
    location: "Main Hall",
    status: "released",
    targetType: "junior",
    ...overrides,
  });

  const fourWeekTrainingSessions: Training[] = [
    createMockSession({
      id: "tr_nov_1",
      parentId: "tr_nov_1",
      name: "Sunday · Nov 1, 2026 · 5:00 PM @ batch",
      startDate: "2026-11-01 17:00:00",
    }),
    createMockSession({
      id: "tr_nov_2",
      parentId: "tr_nov_1",
      name: "Sunday · 8 Nov 2026 · 5:00 PM",
      startDate: "2026-11-08 17:00:00",
    }),
    createMockSession({
      id: "tr_nov_3",
      parentId: "tr_nov_1",
      name: "Sunday · 15 Nov 2026 · 5:00 PM",
      startDate: "2026-11-15 17:00:00",
    }),
    createMockSession({
      id: "tr_nov_4",
      parentId: "tr_nov_1",
      name: "Sunday · 22 Nov 2026 · 5:00 PM",
      startDate: "2026-11-22 17:00:00",
    }),
  ];

  it("correctly extracts month keys and formats session month/day", () => {
    expect(sessionMonthKey("2026-11-01 17:00:00")).toBe("2026-11");
    expect(sessionMonthKey("2026-12-06T17:00:00")).toBe("2026-12");

    expect(formatSessionMonthDay("2026-11-01 17:00:00")).toBe("Nov 1");
    expect(formatSessionMonthDay("2026-11-08 17:00:00")).toBe("Nov 8");
    expect(formatSessionMonthDay("2026-11-15 17:00:00")).toBe("Nov 15");
    expect(formatSessionMonthDay("2026-11-22 17:00:00")).toBe("Nov 22");
  });

  it("Admin Dashboard: groups a 4-week monthly training into 1 card with all 4 dates", () => {
    // Current time: Nov 1 before 5:00 PM
    const nowBeforeNov1 = Date.parse("2026-11-01T16:00:00");

    const cards = groupUpcomingTrainings({
      trainings: fourWeekTrainingSessions,
      role: "admin",
      acceptedTrainingIds: new Set(),
      now: nowBeforeNov1,
    });

    expect(cards.length).toBe(1);
    const card = cards[0];
    expect(card.name).toBe("Sunday · Nov 1, 2026 · 5:00 PM @ batch");
    expect(card.weeklyDatesFormatted).toEqual(["Nov 1", "Nov 8", "Nov 15", "Nov 22"]);
    expect(card.weeklyDatesFormatted.join(" · ")).toBe("Nov 1 · Nov 8 · Nov 15 · Nov 22");
    expect(card.status).toBe("released");
  });

  it("remains visible until the final session date and time (Nov 22, 2026 at 5:00 PM)", () => {
    // Current time: Nov 10 (sessions 1 and 2 have passed, 3 and 4 upcoming)
    const nowNov10 = Date.parse("2026-11-10T10:00:00");
    const cardsOnNov10 = groupUpcomingTrainings({
      trainings: fourWeekTrainingSessions,
      role: "admin",
      acceptedTrainingIds: new Set(),
      now: nowNov10,
    });
    expect(cardsOnNov10.length).toBe(1);
    expect(cardsOnNov10[0].weeklyDatesFormatted).toEqual(["Nov 1", "Nov 8", "Nov 15", "Nov 22"]);

    // Current time: Nov 22 at 4:59 PM (1 minute before final session)
    const nowBeforeFinal = Date.parse("2026-11-22T16:59:00");
    const cardsBeforeFinal = groupUpcomingTrainings({
      trainings: fourWeekTrainingSessions,
      role: "admin",
      acceptedTrainingIds: new Set(),
      now: nowBeforeFinal,
    });
    expect(cardsBeforeFinal.length).toBe(1);
    expect(cardsBeforeFinal[0].weeklyDatesFormatted).toEqual(["Nov 1", "Nov 8", "Nov 15", "Nov 22"]);

    // Current time: Nov 22 at 5:00 PM (final session has arrived / passed)
    const nowAtFinal = Date.parse("2026-11-22T17:00:00");
    const cardsAtFinal = groupUpcomingTrainings({
      trainings: fourWeekTrainingSessions,
      role: "admin",
      acceptedTrainingIds: new Set(),
      now: nowAtFinal,
    });
    expect(cardsAtFinal.length).toBe(0);

    // Current time: Nov 23 (after final session)
    const nowAfterFinal = Date.parse("2026-11-23T10:00:00");
    const cardsAfterFinal = groupUpcomingTrainings({
      trainings: fourWeekTrainingSessions,
      role: "admin",
      acceptedTrainingIds: new Set(),
      now: nowAfterFinal,
    });
    expect(cardsAfterFinal.length).toBe(0);
  });

  it("Member Dashboard: shows only accepted training programs and groups all dates for accepted month in 1 card", () => {
    const now = Date.parse("2026-11-01T10:00:00");
    const acceptedIds = new Set(["tr_nov_1", "tr_nov_2", "tr_nov_3", "tr_nov_4"]);

    // Member with accepted invites
    const memberCards = groupUpcomingTrainings({
      trainings: fourWeekTrainingSessions,
      role: "member",
      acceptedTrainingIds: acceptedIds,
      now,
    });
    expect(memberCards.length).toBe(1);
    expect(memberCards[0].name).toBe("Sunday · Nov 1, 2026 · 5:00 PM @ batch");
    expect(memberCards[0].weeklyDatesFormatted).toEqual(["Nov 1", "Nov 8", "Nov 15", "Nov 22"]);

    // Member who has NOT accepted any invites
    const unacceptedMemberCards = groupUpcomingTrainings({
      trainings: fourWeekTrainingSessions,
      role: "member",
      acceptedTrainingIds: new Set(),
      now,
    });
    expect(unacceptedMemberCards.length).toBe(0);
  });

  it("supports programs containing 3 weekly sessions", () => {
    const threeWeekTrainingSessions: Training[] = [
      createMockSession({
        id: "tr_3w_1",
        parentId: "tr_3w_1",
        name: "Junior 3-Week Camp",
        startDate: "2026-11-05 16:00:00",
      }),
      createMockSession({
        id: "tr_3w_2",
        parentId: "tr_3w_1",
        name: "Junior 3-Week Camp (2)",
        startDate: "2026-11-12 16:00:00",
      }),
      createMockSession({
        id: "tr_3w_3",
        parentId: "tr_3w_1",
        name: "Junior 3-Week Camp (3)",
        startDate: "2026-11-19 16:00:00",
      }),
    ];

    const now = Date.parse("2026-11-01T10:00:00");
    const cards = groupUpcomingTrainings({
      trainings: threeWeekTrainingSessions,
      role: "admin",
      acceptedTrainingIds: new Set(),
      now,
    });

    expect(cards.length).toBe(1);
    expect(cards[0].name).toBe("Junior 3-Week Camp");
    expect(cards[0].weeklyDatesFormatted).toEqual(["Nov 5", "Nov 12", "Nov 19"]);

    // Still visible on Nov 15
    const nowNov15 = Date.parse("2026-11-15T10:00:00");
    const cardsNov15 = groupUpcomingTrainings({
      trainings: threeWeekTrainingSessions,
      role: "admin",
      acceptedTrainingIds: new Set(),
      now: nowNov15,
    });
    expect(cardsNov15.length).toBe(1);

    // Disappears after final session Nov 19 at 16:00
    const nowAfterFinal = Date.parse("2026-11-19T16:00:00");
    const cardsAfter = groupUpcomingTrainings({
      trainings: threeWeekTrainingSessions,
      role: "admin",
      acceptedTrainingIds: new Set(),
      now: nowAfterFinal,
    });
    expect(cardsAfter.length).toBe(0);
  });

  it("does not combine different training programs or different months into one card", () => {
    const multiMonthAndMultiProgramSessions: Training[] = [
      // Program A - November (4 weeks)
      ...fourWeekTrainingSessions,
      // Program A - December (2 weeks)
      createMockSession({
        id: "tr_dec_1",
        parentId: "tr_nov_1",
        name: "Sunday · 6 Dec 2026 · 5:00 PM",
        startDate: "2026-12-06 17:00:00",
      }),
      createMockSession({
        id: "tr_dec_2",
        parentId: "tr_nov_1",
        name: "Sunday · 13 Dec 2026 · 5:00 PM",
        startDate: "2026-12-13 17:00:00",
      }),
      // Program B - November (2 weeks, distinct program)
      createMockSession({
        id: "tr_prog_b_1",
        parentId: "tr_prog_b_1",
        name: "Adult Advanced Coaching",
        startDate: "2026-11-03 18:00:00",
      }),
      createMockSession({
        id: "tr_prog_b_2",
        parentId: "tr_prog_b_1",
        name: "Adult Advanced Coaching (2)",
        startDate: "2026-11-10 18:00:00",
      }),
    ];

    const now = Date.parse("2026-11-01T10:00:00");
    const cards = groupUpcomingTrainings({
      trainings: multiMonthAndMultiProgramSessions,
      role: "admin",
      acceptedTrainingIds: new Set(),
      now,
    });

    // Should produce 3 cards: Program A Nov, Program B Nov, Program A Dec
    expect(cards.length).toBe(3);

    // Program A Nov card (Nov 1)
    expect(cards[0].name).toBe("Sunday · Nov 1, 2026 · 5:00 PM @ batch");
    expect(cards[0].weeklyDatesFormatted).toEqual(["Nov 1", "Nov 8", "Nov 15", "Nov 22"]);

    // Program B Nov card (Nov 3)
    expect(cards[1].name).toBe("Adult Advanced Coaching");
    expect(cards[1].weeklyDatesFormatted).toEqual(["Nov 3", "Nov 10"]);

    // Program A Dec card (Dec 6)
    expect(cards[2].name).toBe("Sunday · 6 Dec 2026 · 5:00 PM");
    expect(cards[2].weeklyDatesFormatted).toEqual(["Dec 6", "Dec 13"]);
  });
});
