import { useStore } from "./store";
import type { Transaction } from "./types";
import { resolveTimezone } from "./timezones";

export const fmtDate = (s: string, timeZone?: string) => {
  if (!s) return "";
  const str = typeof s === "string" ? s.trim() : "";
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString("en-US", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  const tz = resolveTimezone(timeZone || useStore.getState().timezone);
  const isNaive = !/Z$|[+-]\d{2}(?::?\d{2})?$/.test(str);
  if (isNaive) {
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)).toLocaleDateString("en-US", {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
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
  const tz = resolveTimezone(timeZone || useStore.getState().timezone);
  const isNaive = !/Z$|[+-]\d{2}(?::?\d{2})?$/.test(str);
  if (isNaive) {
    const m = str.match(/[T\s](\d{2}):(\d{2})/);
    if (m) {
      const h24 = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const period = h24 >= 12 ? "PM" : "AM";
      let h12 = h24 % 12;
      if (h12 === 0) h12 = 12;
      return `${h12}:${String(min).padStart(2, "0")} ${period}`;
    }
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";
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
    return fmtDate(str, timeZone);
  }
  const tz = resolveTimezone(timeZone || useStore.getState().timezone);
  const isNaive = !/Z$|[+-]\d{2}(?::?\d{2})?$/.test(str);
  if (isNaive) {
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const day = parseInt(m[3], 10);
      const hour = parseInt(m[4], 10);
      const minute = parseInt(m[5], 10);
      const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
      const datePart = d.toLocaleDateString("en-US", {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const period = hour >= 12 ? "PM" : "AM";
      let h12 = hour % 12;
      if (h12 === 0) h12 = 12;
      const timePart = `${h12}:${String(minute).padStart(2, "0")} ${period}`;
      return `${datePart}, ${timePart}`;
    }
  }

  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
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

/** Parse `datetime-local` or ISO value into day / date / time labels in the club timezone. */
export function parseScheduleDateTime(
  value: string,
  timeZone?: string,
): {
  day: string;
  date: string;
  time: string;
  label: string;
} | null {
  if (!value) return null;
  const str = String(value).trim();
  const tz = resolveTimezone(timeZone || useStore.getState().timezone);
  const isNaive = !/Z$|[+-]\d{2}(?::?\d{2})?$/.test(str);

  if (isNaive) {
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
    if (m) {
      const year = parseInt(m[1], 10);
      const month = parseInt(m[2], 10) - 1;
      const day = parseInt(m[3], 10);
      const hour = parseInt(m[4], 10);
      const minute = parseInt(m[5], 10);
      const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
      const dayStr = d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long" });
      const dateStr = d.toLocaleDateString("en-US", {
        timeZone: "UTC",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const period = hour >= 12 ? "PM" : "AM";
      let h12 = hour % 12;
      if (h12 === 0) h12 = 12;
      const timeStr = `${h12}:${String(minute).padStart(2, "0")} ${period}`;

      return {
        day: dayStr,
        date: dateStr,
        time: timeStr,
        label: `${dayStr} · ${dateStr} · ${timeStr}`,
      };
    }
  }

  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return null;

  const dayStr = d.toLocaleDateString("en-US", { timeZone: tz, weekday: "long" });
  const dateStr = d.toLocaleDateString("en-US", {
    timeZone: tz,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  return {
    day: dayStr,
    date: dateStr,
    time: timeStr,
    label: `${dayStr} · ${dateStr} · ${timeStr}`,
  };
}

/** Normalize any incoming date/datetime string into "YYYY-MM-DDTHH:mm" format in the club timezone. */
export function formatToDateTimeLocal(
  dateStr: string | null | undefined,
  timeZone?: string,
): string {
  if (!dateStr) return "";
  const str = String(dateStr).trim();
  const tz = resolveTimezone(timeZone || useStore.getState().timezone);

  // If naive string without timezone offset or Z, it already represents wall-clock time in club timezone
  const isNaive = !/Z$|[+-]\d{2}(?::?\d{2})?$/.test(str);
  if (isNaive) {
    const match = str.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
    if (match) {
      return `${match[1]}T${match[2]}`;
    }
  }

  // If it has timezone (e.g. ISO string with Z or offset), parse and format in the club timezone
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";
  let hour = getPart("hour");
  if (hour === "24") hour = "00";
  return `${getPart("year")}-${getPart("month")}-${getPart("day")}T${hour}:${getPart("minute")}`;
}
