import { describe, expect, it } from "bun:test";
import type { Transaction } from "./types";
import {
  computeTotalSessionNet,
  descriptionMatchesEnrolledMember,
  filterMemberTrainingTransactions,
  summarizeMemberTrainingPayments,
} from "./trainingPaymentSummary";

const TRAINING = "Junior Coaching - Week 1";
const PARENT_WALLET = "m_parent";

const DATE_SESSIONS = [
  "Thursday · Nov 12, 2026 · 4:20 PM",
  "Thursday · 19 Nov 2026 · 4:20 PM",
  "Thursday · 26 Nov 2026 · 4:20 PM",
] as const;

function tx(
  partial: Pick<Transaction, "id" | "type" | "amount" | "description"> &
    Partial<Transaction>,
): Transaction {
  return {
    memberId: PARENT_WALLET,
    date: "2026-11-01",
    ...partial,
  };
}

describe("descriptionMatchesEnrolledMember", () => {
  it("matches strict for {fullName}: token and rejects sibling substring names", () => {
    const desc11 =
      "Training program invitation force accepted for Member 11: Junior Coaching - Week 1";
    const desc1111 =
      "Training program invitation force accepted for member 1111: Junior Coaching - Week 1";

    expect(descriptionMatchesEnrolledMember(desc11, "Member 11")).toBe(true);
    expect(descriptionMatchesEnrolledMember(desc11, "member 1111")).toBe(false);
    expect(descriptionMatchesEnrolledMember(desc1111, "member 1111")).toBe(true);
    expect(descriptionMatchesEnrolledMember(desc1111, "Member 11")).toBe(false);
  });

  it("allows legacy rows without any for Name: clause", () => {
    const legacy = "Training program invitation accepted: Junior Coaching - Week 1";
    expect(descriptionMatchesEnrolledMember(legacy, "Member 11")).toBe(true);
    expect(descriptionMatchesEnrolledMember(legacy, "Other Child")).toBe(true);
  });
});

describe("sibling shared parent payment summary", () => {
  const siblingDebits: Transaction[] = [
    tx({
      id: "txn_11",
      type: "debit",
      amount: 10,
      description:
        "Training program invitation force accepted for Member 11: Junior Coaching - Week 1",
    }),
    tx({
      id: "txn_1111",
      type: "debit",
      amount: 10,
      description:
        "Training program invitation force accepted for member 1111: Junior Coaching - Week 1",
    }),
  ];

  const siblings = [
    { id: "m_j1", firstName: "Member", lastName: "11", parentMemberId: PARENT_WALLET },
    { id: "m_j2", firstName: "member", lastName: "1111", parentMemberId: PARENT_WALLET },
  ];

  it("attributes each junior only their own €10 debit (not the sibling's)", () => {
    const junior1 = summarizeMemberTrainingPayments(siblingDebits, {
      walletMemberId: PARENT_WALLET,
      memberFullName: "Member 11",
      trainingName: TRAINING,
    });
    const junior2 = summarizeMemberTrainingPayments(siblingDebits, {
      walletMemberId: PARENT_WALLET,
      memberFullName: "member 1111",
      trainingName: TRAINING,
    });

    expect(junior1.actualPaid).toBe(10);
    expect(junior1.finalNet).toBe(10);
    expect(junior1.relatedTransactions.map((t) => t.id)).toEqual(["txn_11"]);

    expect(junior2.actualPaid).toBe(10);
    expect(junior2.finalNet).toBe(10);
    expect(junior2.relatedTransactions.map((t) => t.id)).toEqual(["txn_1111"]);
  });

  it("counts shared parent payments once in Total Session Net (€20, not €40)", () => {
    expect(computeTotalSessionNet(siblings, siblingDebits, TRAINING)).toBe(20);
  });

  it("keeps separate payments from different parents additive", () => {
    const otherParentDebit = tx({
      id: "txn_other",
      memberId: "m_other_parent",
      type: "debit",
      amount: 15,
      description:
        "Training program invitation accepted for Solo Junior: Junior Coaching - Week 1",
    });

    const members = [
      ...siblings,
      {
        id: "m_solo",
        firstName: "Solo",
        lastName: "Junior",
        parentMemberId: "m_other_parent",
      },
    ];

    expect(
      computeTotalSessionNet(members, [...siblingDebits, otherParentDebit], TRAINING),
    ).toBe(35);
  });

  it("dedupes legacy unnamed parent-wallet rows across siblings in Total Session Net", () => {
    const legacy: Transaction[] = [
      tx({
        id: "txn_legacy",
        type: "debit",
        amount: 20,
        description: "Training program invitation accepted: Junior Coaching - Week 1",
      }),
    ];

    expect(computeTotalSessionNet(siblings, legacy, TRAINING)).toBe(20);
  });

  it("nets refunds for one sibling without affecting the other", () => {
    const withRefund: Transaction[] = [
      ...siblingDebits,
      tx({
        id: "txn_refund_11",
        type: "refund",
        amount: 10,
        description:
          "Refund — cancelled training session for Member 11: Junior Coaching - Week 1",
      }),
    ];

    const junior1 = summarizeMemberTrainingPayments(withRefund, {
      walletMemberId: PARENT_WALLET,
      memberFullName: "Member 11",
      trainingName: TRAINING,
    });
    const junior2 = summarizeMemberTrainingPayments(withRefund, {
      walletMemberId: PARENT_WALLET,
      memberFullName: "member 1111",
      trainingName: TRAINING,
    });

    expect(junior1.actualPaid).toBe(10);
    expect(junior1.totalRefunded).toBe(10);
    expect(junior1.finalNet).toBe(0);

    expect(junior2.actualPaid).toBe(10);
    expect(junior2.totalRefunded).toBe(0);
    expect(junior2.finalNet).toBe(10);

    expect(computeTotalSessionNet(siblings, withRefund, TRAINING)).toBe(10);
  });

  it("does not pull unrelated training names from the shared wallet", () => {
    const mixed: Transaction[] = [
      ...siblingDebits,
      tx({
        id: "txn_other_program",
        type: "debit",
        amount: 50,
        description:
          "Training program invitation accepted for Member 11: Completely Different Program",
      }),
    ];

    const related = filterMemberTrainingTransactions(mixed, {
      walletMemberId: PARENT_WALLET,
      memberFullName: "Member 11",
      trainingName: TRAINING,
    });

    expect(related.map((t) => t.id)).toEqual(["txn_11"]);
  });
});

describe("attendance refunds across date-labeled multi-week sessions", () => {
  const members = [
    { id: "m1", firstName: "md felix", lastName: "raja", parentMemberId: null },
    { id: "m2", firstName: "vcxs", lastName: "vxz", parentMemberId: null },
    { id: "m3", firstName: "Member", lastName: "02", parentMemberId: null },
  ];

  const txs: Transaction[] = [
    {
      id: "d1",
      memberId: "m1",
      type: "debit",
      amount: 1,
      date: "2026-11-01",
      description: `Training program invitation accepted for md felix raja: ${DATE_SESSIONS[2]}, ${DATE_SESSIONS[1]}, ${DATE_SESSIONS[0]} (Training Fee: $1.00, Discount: $0.00, Amount Debited: $1.00)`,
    },
    // Force-accept debit only lists the first week name — must still match via month names.
    {
      id: "d2",
      memberId: "m2",
      type: "debit",
      amount: 1,
      date: "2026-11-01",
      description: `Training program invitation force accepted for vcxs vxz: ${DATE_SESSIONS[0]}`,
    },
    {
      id: "d3",
      memberId: "m3",
      type: "debit",
      amount: 1,
      date: "2026-11-01",
      description: `Training program invitation accepted for Member 02: ${DATE_SESSIONS[0]}, ${DATE_SESSIONS[2]}, ${DATE_SESSIONS[1]} (Training Fee: $1.00, Discount: $0.00, Amount Debited: $1.00)`,
    },
    // Member 1: full refund of all 3 sessions
    {
      id: "r1a",
      memberId: "m1",
      type: "refund",
      amount: 0.34,
      date: "2026-11-02",
      description: `Training session absent (Full Refund) for md felix raja: ${DATE_SESSIONS[2]}`,
    },
    {
      id: "r1b",
      memberId: "m1",
      type: "refund",
      amount: 0.33,
      date: "2026-11-02",
      description: `Training session absent (Full Refund) for md felix raja: ${DATE_SESSIONS[1]}`,
    },
    {
      id: "r1c",
      memberId: "m1",
      type: "refund",
      amount: 0.33,
      date: "2026-11-02",
      description: `Training session absent (Full Refund) for md felix raja: ${DATE_SESSIONS[0]}`,
    },
    // Member 2: partial — 2 sessions
    {
      id: "r2a",
      memberId: "m2",
      type: "refund",
      amount: 0.34,
      date: "2026-11-02",
      description: `Training session absent (Full Refund) for vcxs vxz: ${DATE_SESSIONS[2]}`,
    },
    {
      id: "r2b",
      memberId: "m2",
      type: "refund",
      amount: 0.33,
      date: "2026-11-02",
      description: `Training session absent (Full Refund) for vcxs vxz: ${DATE_SESSIONS[1]}`,
    },
    // Member 3: partial — 1 session
    {
      id: "r3a",
      memberId: "m3",
      type: "refund",
      amount: 0.33,
      date: "2026-11-02",
      description: `Training session absent (Full Refund) for Member 02: ${DATE_SESSIONS[2]}`,
    },
  ];

  it("does not miss cross-week attendance refunds when only one week name is open", () => {
    // Viewing week 3 only — old bug: refunds/debits for other weeks vanished.
    const openWeek = DATE_SESSIONS[2];
    const m2Broken = summarizeMemberTrainingPayments(txs, {
      walletMemberId: "m2",
      memberFullName: "vcxs vxz",
      trainingName: openWeek,
    });
    expect(m2Broken.actualPaid).toBe(0);
    expect(m2Broken.totalRefunded).toBe(0.34);

    const m2Fixed = summarizeMemberTrainingPayments(txs, {
      walletMemberId: "m2",
      memberFullName: "vcxs vxz",
      trainingName: [...DATE_SESSIONS],
    });
    expect(m2Fixed.actualPaid).toBe(1);
    expect(m2Fixed.totalRefunded).toBe(0.67);
    expect(m2Fixed.finalNet).toBe(0.33);
  });

  it("shows Actual Paid / Total Refunded / Final Net per member after partial & full refunds", () => {
    const m1 = summarizeMemberTrainingPayments(txs, {
      walletMemberId: "m1",
      memberFullName: "md felix raja",
      trainingName: [...DATE_SESSIONS],
    });
    const m2 = summarizeMemberTrainingPayments(txs, {
      walletMemberId: "m2",
      memberFullName: "vcxs vxz",
      trainingName: [...DATE_SESSIONS],
    });
    const m3 = summarizeMemberTrainingPayments(txs, {
      walletMemberId: "m3",
      memberFullName: "Member 02",
      trainingName: [...DATE_SESSIONS],
    });

    expect(m1).toMatchObject({ actualPaid: 1, totalRefunded: 1, finalNet: 0 });
    expect(m2).toMatchObject({ actualPaid: 1, totalRefunded: 0.67, finalNet: 0.33 });
    expect(m3).toMatchObject({ actualPaid: 1, totalRefunded: 0.33, finalNet: 0.67 });
  });

  it("computes Total Session Net as €1.00 for 3+2+1 session refunds", () => {
    expect(computeTotalSessionNet(members, txs, [...DATE_SESSIONS])).toBe(1);
  });

  it("nets reverse-present clawbacks so Actual Paid stays the collected amount", () => {
    const withReverse: Transaction[] = [
      ...txs.filter((t) => t.memberId === "m1"),
      {
        id: "rev1",
        memberId: "m1",
        type: "debit",
        amount: 0.34,
        date: "2026-11-03",
        description: `Reversed training absent Full Refund (marked Present) for md felix raja: ${DATE_SESSIONS[2]}`,
      },
    ];

    const summary = summarizeMemberTrainingPayments(withReverse, {
      walletMemberId: "m1",
      memberFullName: "md felix raja",
      trainingName: [...DATE_SESSIONS],
    });

    // Collected €1; one €0.34 refund was reversed → net refunded €0.66; Final Net €0.34
    expect(summary.actualPaid).toBe(1);
    expect(summary.totalRefunded).toBe(0.66);
    expect(summary.finalNet).toBe(0.34);
  });

  it("supports half (50%) attendance refunds without double-counting", () => {
    const halfTxs: Transaction[] = [
      {
        id: "dh",
        memberId: "m1",
        type: "debit",
        amount: 1,
        date: "2026-11-01",
        description: `Training program invitation force accepted for md felix raja: ${DATE_SESSIONS[0]}`,
      },
      {
        id: "rh",
        memberId: "m1",
        type: "refund",
        amount: 0.17,
        date: "2026-11-02",
        description: `Training session absent (50% Refund) for md felix raja: ${DATE_SESSIONS[0]}`,
      },
    ];

    const summary = summarizeMemberTrainingPayments(halfTxs, {
      walletMemberId: "m1",
      memberFullName: "md felix raja",
      trainingName: [...DATE_SESSIONS],
    });

    expect(summary.actualPaid).toBe(1);
    expect(summary.totalRefunded).toBe(0.17);
    expect(summary.finalNet).toBe(0.83);
    expect(computeTotalSessionNet([members[0]], halfTxs, [...DATE_SESSIONS])).toBe(0.83);
  });

  it("ignores unrelated programs even when refund descriptions share the weekday word", () => {
    const noise: Transaction[] = [
      ...txs,
      {
        id: "noise",
        memberId: "m1",
        type: "refund",
        amount: 99,
        date: "2026-11-02",
        description:
          "Training session absent (Full Refund) for md felix raja: Tuesday · Jan 5, 2027 · 7:00 PM",
      },
    ];

    const summary = summarizeMemberTrainingPayments(noise, {
      walletMemberId: "m1",
      memberFullName: "md felix raja",
      trainingName: [...DATE_SESSIONS],
    });

    expect(summary.totalRefunded).toBe(1);
    expect(summary.finalNet).toBe(0);
  });
});
