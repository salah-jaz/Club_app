import type { Member } from "./types";

export type DiscountSettings = {
  adultDiscountPercent: number;
  adultDiscountAmount: number;
  juniorDiscountPercent: number;
  juniorDiscountAmount: number;
};

/**
 * Apply member discount settings to a base fee.
 * Percentage first, then fixed amount. Returns 0 when credits are bypassed.
 */
export function applyMemberFee(
  baseFee: number,
  member: Pick<Member, "memberType" | "skipCreditConsumption" | "applyDiscount"> | null | undefined,
  discounts: DiscountSettings,
): number {
  if (!member) return roundFee(baseFee);
  if (member.skipCreditConsumption) return 0;
  if (!member.applyDiscount) return roundFee(baseFee);

  const isJunior = member.memberType.toLowerCase() === "junior";
  const percent = isJunior ? discounts.juniorDiscountPercent : discounts.adultDiscountPercent;
  const amount = isJunior ? discounts.juniorDiscountAmount : discounts.adultDiscountAmount;

  let fee = baseFee;
  if (percent > 0) {
    fee = fee * (1 - Math.min(percent, 100) / 100);
  }
  if (amount > 0) {
    fee = fee - amount;
  }
  return roundFee(Math.max(0, fee));
}

export function playSessionBaseFee(sessionRate: number, hallRate: number, playerCount: number): number {
  return sessionRate + hallRate / Math.max(playerCount, 1);
}

export function discountsFromStore(store: DiscountSettings): DiscountSettings {
  return {
    adultDiscountPercent: store.adultDiscountPercent ?? 0,
    adultDiscountAmount: store.adultDiscountAmount ?? 0,
    juniorDiscountPercent: store.juniorDiscountPercent ?? 0,
    juniorDiscountAmount: store.juniorDiscountAmount ?? 0,
  };
}

function roundFee(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}
