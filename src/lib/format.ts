import { useStore } from "./store";
import type { Transaction } from "./types";
import { resolveTimezone } from "./timezones";

export const fmtDate = (s: string) => {
  if (!s) return "";
  const str = typeof s === "string" ? s.trim() : "";
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const normalized = str.includes(" ") ? str.replace(" ", "T") : str;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return "";
  const tz = resolveTimezone(useStore.getState().timezone);
  return d.toLocaleDateString(undefined, {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const fmtTime = (s: string | null | undefined, timeZone?: string): string => {
  if (!s) return "";
  const str = typeof s === "string" ? s.trim() : "";
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return "";
  const normalized = str.includes(" ") ? str.replace(" ", "T") : str;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return "";
  const tz = resolveTimezone(timeZone || useStore.getState().timezone);
  const formatted = d.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return formatted.trim();
};

export const formatWalletTxnTime = (
  r: { createdAt?: string | null; date?: string | null },
  timeZone?: string,
): string => {
  if (r.createdAt) {
    const t = fmtTime(r.createdAt, timeZone);
    if (t) return t;
  }
  if (r.date && (r.date.includes("T") || r.date.includes(":"))) {
    return fmtTime(r.date, timeZone);
  }
  return "";
};

export const fmtDateTime = (s: string, timeZone?: string) => {
  if (!s) return "";
  const str = typeof s === "string" ? s.trim() : "";
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return fmtDate(str);
  }
  const normalized = str.includes(" ") ? str.replace(" ", "T") : str;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return "";
  const tz = resolveTimezone(timeZone || useStore.getState().timezone);
  return d.toLocaleString(undefined, {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};
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

export function txnDisplayType(t: Transaction): "credit" | "debit" | "refund" | "expense" {
  if (t.type === "refund" || t.type === "debit" || t.type === "expense") return t.type;
  if (/expense/i.test(t.description || "")) return "expense";
  if (/refund/i.test(t.description || "")) return "refund";
  return "credit";
}

export function isTxnInflow(t: Transaction): boolean {
  const type = txnDisplayType(t);
  return type === "credit" || type === "refund";
}

/** Whether a ledger row came from play schedules, trainings, expenses, or other wallet activity. */
export function txnSource(t: Transaction): "play" | "training" | "expense" | "other" {
  if (t.type === "expense" || /expense/i.test(t.description || "")) return "expense";
  const desc = (t.description || "").toLowerCase();
  if (desc.includes("training")) return "training";
  if (desc.includes("play session")) return "play";
  return "other";
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
