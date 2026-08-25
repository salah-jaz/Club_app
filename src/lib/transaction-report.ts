import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Member, Transaction } from "@/lib/types";
import { fmtDate, fmtDateTime, fmtMoney, formatTxnDescription, txnDisplayType, txnSource } from "@/lib/format";
import {
  downloadReportCsv,
  formatFilterSummary,
  inDateRange,
  reportStamp,
} from "@/lib/report-export";

export type TxnReportCategory = "all" | "play" | "training" | "other";
export type TxnReportType = "all" | "credit" | "debit" | "refund" | "expense";

export type TxnReportFilters = {
  fromDate: string;
  toDate: string;
  memberId: string; // "" | "all" | member id
  type: TxnReportType;
  category: TxnReportCategory;
};

export const EXPENSE_CATEGORIES = [
  "Equipment",
  "Guest Fee",
  "Penalty",
  "Merchandise",
  "Facility",
  "Coaching",
  "Other",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function formatExpenseReason(category: ExpenseCategory, reason: string): string {
  const trimmed = reason.trim();
  return `[${category}] ${trimmed}`;
}

export function categoryLabel(source: ReturnType<typeof txnSource>): string {
  if (source === "play") return "Play";
  if (source === "training") return "Training";
  if (source === "expense") return "Expense";
  return "Other";
}

export function filterTransactionsForReport(
  txns: Transaction[],
  members: Member[],
  filters: TxnReportFilters,
): Transaction[] {
  return txns.filter((t) => {
    if (filters.memberId && filters.memberId !== "all" && t.memberId !== filters.memberId) {
      return false;
    }
    if (filters.type !== "all" && txnDisplayType(t) !== filters.type) return false;
    if (filters.category !== "all" && txnSource(t) !== filters.category) return false;
    if (!inDateRange(t.date, filters.fromDate, filters.toDate)) return false;
    void members;
    return true;
  });
}

function memberName(members: Member[], memberId?: string | null): string {
  if (!memberId) return "—";
  const m = members.find((x) => x.id === memberId);
  return m ? `${m.firstName} ${m.lastName}` : "—";
}

function filterSummary(filters: TxnReportFilters, members: Member[]): string {
  return formatFilterSummary([
    {
      label: "Date",
      value:
        filters.fromDate || filters.toDate
          ? `${filters.fromDate ? fmtDate(filters.fromDate) : "…"} – ${filters.toDate ? fmtDate(filters.toDate) : "…"}`
          : "",
    },
    {
      label: "Member",
      value:
        filters.memberId && filters.memberId !== "all"
          ? memberName(members, filters.memberId)
          : "",
      hideIf: ["all"],
    },
    { label: "Type", value: filters.type, hideIf: ["all"] },
    {
      label: "Category",
      value: filters.category !== "all" ? categoryLabel(filters.category) : "",
      hideIf: ["all"],
    },
  ]);
}

export function buildTransactionsCsv(
  txns: Transaction[],
  members: Member[],
  filters: TxnReportFilters,
): string {
  // Keep API used by tests / callers; delegate to generic builder via download path.
  const header = ["Date", "Member", "Type", "Category", "Description", "Amount"];
  const rows = txns.map((t) => {
    const displayType = txnDisplayType(t);
    const signed =
      displayType === "debit" || displayType === "expense" ? `-${t.amount.toFixed(2)}` : `+${t.amount.toFixed(2)}`;
    return [
      fmtDateTime(t.date),
      memberName(members, t.memberId),
      displayType,
      categoryLabel(txnSource(t)),
      formatTxnDescription(t),
      signed,
    ].map((cell) => {
      const s = String(cell);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    });
  });

  const meta = [
    "# Transactions Report",
    `# Filters: ${filterSummary(filters, members)}`,
    `# Generated: ${fmtDateTime(new Date().toISOString())}`,
    `# Rows: ${txns.length}`,
    "",
  ];

  return [...meta, header.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export { downloadBlob, reportStamp } from "@/lib/report-export";

export function downloadTransactionsCsv(
  txns: Transaction[],
  members: Member[],
  filters: TxnReportFilters,
) {
  downloadReportCsv({
    title: "Transactions Report",
    filenamePrefix: "transactions_report",
    columns: [
      { key: "date", header: "Date" },
      { key: "member", header: "Member" },
      { key: "type", header: "Type" },
      { key: "category", header: "Category" },
      { key: "description", header: "Description" },
      { key: "amount", header: "Amount", align: "right" },
    ],
    rows: txns.map((t) => {
      const displayType = txnDisplayType(t);
      const signed =
        displayType === "debit" || displayType === "expense" ? `-${t.amount.toFixed(2)}` : `+${t.amount.toFixed(2)}`;
      return {
        date: fmtDateTime(t.date),
        member: memberName(members, t.memberId),
        type: displayType,
        category: categoryLabel(txnSource(t)),
        description: formatTxnDescription(t),
        amount: signed,
      };
    }),
    filterSummary: filterSummary(filters, members),
  });
}

export function downloadTransactionsPdf(
  txns: Transaction[],
  members: Member[],
  filters: TxnReportFilters,
  brand?: { appName?: string },
) {
  // Preserve prior layout (credited/debited totals) for transactions PDF.
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const accent: [number, number, number] = [16, 185, 129];
  const ink: [number, number, number] = [17, 24, 22];
  const muted: [number, number, number] = [100, 116, 110];
  const appName = brand?.appName || "Club";

  doc.setFillColor(...accent);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`${appName} — Transactions Report`, marginX, 14);

  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(filterSummary(filters, members), marginX, 28);
  doc.text(`Generated ${fmtDateTime(new Date().toISOString())} · ${txns.length} row(s)`, marginX, 33);

  const totalCredited = txns
    .filter((t) => txnDisplayType(t) !== "debit")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalDebited = txns
    .filter((t) => txnDisplayType(t) === "debit")
    .reduce((sum, t) => sum + t.amount, 0);

  doc.setTextColor(...ink);
  doc.setFontSize(9);
  doc.text(
    `Credited ${fmtMoney(totalCredited)}  ·  Debited ${fmtMoney(totalDebited)}`,
    pageW - marginX,
    33,
    { align: "right" },
  );

  autoTable(doc, {
    startY: 38,
    head: [["Date", "Member", "Type", "Category", "Description", "Amount"]],
    body: txns.map((t) => {
      const displayType = txnDisplayType(t);
      const signed = `${displayType === "debit" ? "−" : "+"}${fmtMoney(t.amount)}`;
      return [
        fmtDateTime(t.date),
        memberName(members, t.memberId),
        displayType,
        categoryLabel(txnSource(t)),
        formatTxnDescription(t),
        signed,
      ];
    }),
    styles: {
      fontSize: 8,
      cellPadding: 2.2,
      textColor: ink,
      lineColor: [226, 232, 230],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: accent,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 42 },
      2: { cellWidth: 22 },
      3: { cellWidth: 24 },
      5: { cellWidth: 28, halign: "right" },
    },
    margin: { left: marginX, right: marginX },
    didDrawPage: (data) => {
      doc.setDrawColor(226, 232, 230);
      doc.setLineWidth(0.3);
      doc.line(marginX, pageH - 10, pageW - marginX, pageH - 10);
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text(`${appName} · Transactions report`, marginX, pageH - 5);
      doc.text(`Page ${data.pageNumber}`, pageW - marginX, pageH - 5, { align: "right" });
    },
  });

  doc.save(`transactions_report_${reportStamp()}.pdf`);
}

