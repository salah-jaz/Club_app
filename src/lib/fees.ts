import type { Member } from "./types";

export type DiscountMode = "percent" | "amount" | "off";

export type DiscountSettings = {
  adultDiscountPercent: number;
  adultDiscountAmount: number;
  adultDiscountMode: DiscountMode;
  juniorDiscountPercent: number;
  juniorDiscountAmount: number;
  juniorDiscountMode: DiscountMode;
};

function resolveMode(
  mode: DiscountMode | string | null | undefined,
  percent: number,
  amount: number,
): DiscountMode {
  if (mode === "off" || mode === "percent" || mode === "amount") return mode;
  return amount > 0 && percent <= 0 ? "amount" : "percent";
}

/**
 * Apply member discount settings to a base fee.
 * Uses either percentage or fixed amount based on discount mode — never both.
 * Returns 0 when credits are bypassed.
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
  const mode = resolveMode(
    isJunior ? discounts.juniorDiscountMode : discounts.adultDiscountMode,
    percent,
    amount,
  );

  if (mode === "off") {
    return roundFee(baseFee);
  }

  let fee = baseFee;
  if (mode === "percent" && percent > 0) {
    fee = fee * (1 - Math.min(percent, 100) / 100);
  } else if (mode === "amount" && amount > 0) {
    fee = fee - amount;
  }
  return roundFee(Math.max(0, fee));
}

export function playSessionBaseFee(sessionRate: number, _hallRate = 0, _playerCount = 1): number {
  return sessionRate;
}

export function discountsFromStore(store: DiscountSettings): DiscountSettings {
  return {
    adultDiscountPercent: store.adultDiscountPercent ?? 0,
    adultDiscountAmount: store.adultDiscountAmount ?? 0,
    adultDiscountMode: resolveMode(
      store.adultDiscountMode,
      store.adultDiscountPercent ?? 0,
      store.adultDiscountAmount ?? 0,
    ),
    juniorDiscountPercent: store.juniorDiscountPercent ?? 0,
    juniorDiscountAmount: store.juniorDiscountAmount ?? 0,
    juniorDiscountMode: resolveMode(
      store.juniorDiscountMode,
      store.juniorDiscountPercent ?? 0,
      store.juniorDiscountAmount ?? 0,
    ),
  };
}

function roundFee(n: number): number {
  return Math.round(Math.max(0, n) * 100) / 100;
}
