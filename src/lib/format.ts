import { useStore } from "./store";

export const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtMoney = (n: number) => {
  const symbol = useStore.getState().currency || "$";
  return `${symbol}${n.toFixed(2)}`;
};

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