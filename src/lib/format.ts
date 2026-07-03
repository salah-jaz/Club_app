export const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
export const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const fmtMoney = (n: number) => `$${n.toFixed(2)}`;