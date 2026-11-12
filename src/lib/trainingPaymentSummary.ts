import type { Transaction } from "@/lib/types";

/**
 * Aligns with backend InvitationSyncService::seriesTransactionMatchers —
 * sibling juniors on a shared parent wallet are attributed via "for {name}:".
 * Never match on bare first-name / substring includes (e.g. "Member 11" ⊂ "member 1111").
 *
 * Session rows are often date-labeled ("Thursday · 26 Nov 2026 · 4:20 PM"), so callers
 * must pass every month/series session name — matching only the open week's name misses
 * attendance refunds posted against other weeks in the same program.
 */

export function trainingProgramBaseName(trainingName: string): string {
  return (trainingName || "")
    .split(" - Week")[0]
    .replace(/ \(\d+\)$/, "")
    .trim();
}

/** Exact enrolled-member token used in wallet descriptions. */
export function enrolledMemberDescriptionToken(memberFullName: string): string {
  const name = (memberFullName || "").trim();
  return name ? `for ${name}:` : "";
}

/** True when description has any "for {someone}:" clause (case-insensitive). */
export function descriptionHasEnrolledMemberClause(description: string): boolean {
  return /\bfor\s+[^:]+:/i.test(description || "");
}

/**
 * Attribute a wallet row to one enrolled member.
 * Prefer the strict "for {fullName}:" token; allow legacy rows with no such clause.
 * Never claim a sibling's "for Other Name:" rows.
 */
export function descriptionMatchesEnrolledMember(
  description: string,
  memberFullName: string,
): boolean {
  const lowerDesc = (description || "").toLowerCase();
  const token = enrolledMemberDescriptionToken(memberFullName).toLowerCase();

  if (token && lowerDesc.includes(token)) {
    return true;
  }

  // Legacy rows without any "for Name:" clause may still belong to this wallet owner.
  return !descriptionHasEnrolledMemberClause(description);
}

function normalizeTrainingNames(
  trainingNameOrNames: string | string[] | null | undefined,
): string[] {
  const raw = Array.isArray(trainingNameOrNames)
    ? trainingNameOrNames
    : trainingNameOrNames
      ? [trainingNameOrNames]
      : [];

  const out: string[] = [];
  const seen = new Set<string>();

  for (const name of raw) {
    const trimmed = (name || "").trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }

    const base = trainingProgramBaseName(trimmed);
    if (base && base.toLowerCase() !== key && !seen.has(base.toLowerCase())) {
      // Only add Week-stripped / (n)-stripped bases — useful for "Program - Week N" labels.
      // Date-labeled sessions equal their own "base", so nothing extra is added.
      if (base.toLowerCase() !== trimmed.toLowerCase()) {
        seen.add(base.toLowerCase());
        out.push(base);
      }
    }
  }

  return out;
}

export function descriptionMatchesTrainingProgram(
  description: string,
  trainingNameOrNames: string | string[],
): boolean {
  const lowerDesc = (description || "").toLowerCase();
  if (!lowerDesc.includes("training")) return false;

  const names = normalizeTrainingNames(trainingNameOrNames);
  return names.some((n) => lowerDesc.includes(n.toLowerCase()));
}

export function isTrainingAbsentRefundDescription(description: string): boolean {
  return /^training session absent\b/i.test((description || "").trim());
}

export function isTrainingAbsentReverseDescription(description: string): boolean {
  return /^reversed training absent\b/i.test((description || "").trim());
}

export function isTrainingRelatedRefundDescription(description: string): boolean {
  const d = (description || "").trim();
  if (isTrainingAbsentRefundDescription(d)) return true;
  if (/^refund\s*[—–-]\s*(cancelled|deleted|declined)\s+training/i.test(d)) return true;
  if (/^training program (update|overpayment) refund\b/i.test(d)) return true;
  // Legacy / resolved-type rows that mention refund + training
  if (/\brefund\b/i.test(d) && /\btraining\b/i.test(d)) return true;
  return false;
}

export type MemberTrainingTxFilter = {
  walletMemberId: string;
  memberFullName: string;
  /** One or more session/program names in the month/series scope. */
  trainingName: string | string[];
};

export function filterMemberTrainingTransactions(
  transactions: Transaction[] | null | undefined,
  filter: MemberTrainingTxFilter,
): Transaction[] {
  const { walletMemberId, memberFullName, trainingName } = filter;
  return (transactions || []).filter((tx) => {
    if (tx.memberId !== walletMemberId) return false;
    if (!descriptionMatchesTrainingProgram(tx.description || "", trainingName)) return false;
    return descriptionMatchesEnrolledMember(tx.description || "", memberFullName);
  });
}

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type TrainingPaymentSummaryAmounts = {
  actualPaid: number;
  totalRefunded: number;
  finalNet: number;
  relatedTransactions: Transaction[];
};

/**
 * Actual Paid = amount collected (invitation/payment debits), excluding reverse-present clawbacks.
 * Total Refunded = net training refunds after subtracting reverse-present clawbacks
 *   (so a refund that was later reversed does not stay in Total Refunded).
 * Final Net = Actual Paid − Total Refunded.
 */
export function summarizeMemberTrainingPayments(
  transactions: Transaction[] | null | undefined,
  filter: MemberTrainingTxFilter,
): TrainingPaymentSummaryAmounts {
  const relatedTransactions = filterMemberTrainingTransactions(transactions, filter);

  let collected = 0;
  let refunded = 0;
  let reversed = 0;

  for (const tx of relatedTransactions) {
    const desc = tx.description || "";

    if (tx.type === "debit") {
      if (isTrainingAbsentReverseDescription(desc)) {
        reversed += tx.amount;
      } else {
        collected += tx.amount;
      }
      continue;
    }

    if (tx.type === "refund" || tx.type === "credit") {
      if (isTrainingRelatedRefundDescription(desc) || tx.type === "refund") {
        refunded += tx.amount;
      }
    }
  }

  const actualPaid = roundMoney(collected);
  const totalRefunded = roundMoney(Math.max(0, refunded - reversed));
  const finalNet = roundMoney(actualPaid - totalRefunded);

  return {
    actualPaid,
    totalRefunded,
    finalNet,
    relatedTransactions,
  };
}

export type SessionNetMember = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  parentMemberId?: string | null;
};

/**
 * Total Session Net across eligible members = sum of each member's Final Net.
 * Shared parent-wallet rows are attributed via "for {name}:".
 * Transaction ids are deduped so a legacy unnamed row on a shared wallet is not double-counted.
 */
export function computeTotalSessionNet(
  members: SessionNetMember[],
  transactions: Transaction[] | null | undefined,
  trainingName: string | string[],
): number {
  const seenTxnIds = new Set<string>();
  let collected = 0;
  let refunded = 0;
  let reversed = 0;

  for (const m of members) {
    const walletMemberId = m.parentMemberId || m.id;
    const memberFullName = `${m.firstName || ""} ${m.lastName || ""}`.trim() || m.id;
    const { relatedTransactions } = summarizeMemberTrainingPayments(transactions, {
      walletMemberId,
      memberFullName,
      trainingName,
    });

    for (const tx of relatedTransactions) {
      if (seenTxnIds.has(tx.id)) continue;
      seenTxnIds.add(tx.id);

      const desc = tx.description || "";

      if (tx.type === "debit") {
        if (isTrainingAbsentReverseDescription(desc)) {
          reversed += tx.amount;
        } else {
          collected += tx.amount;
        }
      } else if (tx.type === "refund" || tx.type === "credit") {
        if (isTrainingRelatedRefundDescription(desc) || tx.type === "refund") {
          refunded += tx.amount;
        }
      }
    }
  }

  return roundMoney(collected - Math.max(0, refunded - reversed));
}
