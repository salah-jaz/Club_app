import { useStore } from "./store";
import type { Transaction } from "./types";

export const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtMoney = (n: number) => {
  const symbol = useStore.getState().currency || "$";
  return `${symbol}${n.toFixed(2)}`;
};

/** Format description display for transactions (specifically Manual Debit vs others). */
export function formatTxnDescription(t: Transaction): string {
  const isDebit = t.type === "debit";
  const desc = (t.description || "").trim();
  const descLower = desc.toLowerCase();

  const isAutoDebit =
    descLower.startsWith("play session") ||
    descLower.startsWith("auto debit") ||
    descLower.startsWith("training");

  const isManualDebit = isDebit && !isAutoDebit;

  if (isManualDebit) {
    const reasonText = t.reason?.trim() || desc;
    return reasonText ? `Reason: ${reasonText}` : "Reason: N/A";
  }

  return t.description || t.reason || "N/A";
}

/** Resolve display type. Historical refunds may still be stored as credit. */
export function txnDisplayType(t: Transaction): "credit" | "debit" | "refund" {
  if (t.type === "refund" || t.type === "debit") return t.type;
  if (/refund/i.test(t.description || "")) return "refund";
  return "credit";
}

export function isTxnInflow(t: Transaction): boolean {
  const type = txnDisplayType(t);
  return type === "credit" || type === "refund";
}

/** Parse `datetime-local` value (`YYYY-MM-DDTHH:mm`) into day / date / time labels. */
export function parseScheduleDateTime(value: string): {
  day: string;
  date: string;
  time: string;
  label: string;
} | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const day = d.toLocaleDateString(undefined, { weekday: "long" });
  const date = d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return {
    day,
    date,
    time,
    label: `${day} · ${date} · ${time}`,
  };
}