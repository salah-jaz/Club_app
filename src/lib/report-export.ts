import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtDate, fmtDateTime } from "@/lib/format";

export type ReportColumn = {
  key: string;
  header: string;
  /** Approximate PDF column width in mm (optional). */
  width?: number;
  align?: "left" | "right" | "center";
};

export type ReportRow = Record<string, string | number | null | undefined>;

export type ReportExportOptions = {
  title: string;
  filenamePrefix: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  filterSummary?: string;
  brand?: { appName?: string };
  orientation?: "portrait" | "landscape";
};

export function reportStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadBlob(filename: string, content: string | Blob, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Inclusive calendar-day range check against an ISO / parseable date string. */
export function inDateRange(dateStr: string | null | undefined, fromDate: string, toDate: string): boolean {
  if (!dateStr) return !(fromDate || toDate);
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  d.setHours(0, 0, 0, 0);
  if (fromDate) {
    const from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    if (d < from) return false;
  }
  if (toDate) {
    const to = new Date(toDate);
    to.setHours(0, 0, 0, 0);
    if (d > to) return false;
  }
  return true;
}

export function formatFilterSummary(
  parts: Array<{ label: string; value: string | undefined | null; hideIf?: string[] }>,
): string {
  const active = parts
    .filter((p) => {
      const v = (p.value || "").trim();
      if (!v) return false;
      if (p.hideIf?.includes(v)) return false;
      return true;
    })
    .map((p) => `${p.label}: ${p.value}`);
  return active.length ? active.join(" · ") : "All records";
}

export function buildReportCsv(options: ReportExportOptions): string {
  const { title, columns, rows, filterSummary } = options;
  const header = columns.map((c) => escapeCsv(c.header));
  const body = rows.map((row) =>
    columns.map((c) => escapeCsv(String(row[c.key] ?? ""))).join(","),
  );
  const meta = [
    `# ${title}`,
    `# Filters: ${filterSummary || "All records"}`,
    `# Generated: ${fmtDateTime(new Date().toISOString())}`,
    `# Rows: ${rows.length}`,
    "",
  ];
  return [...meta, header.join(","), ...body].join("\n");
}

export function downloadReportCsv(options: ReportExportOptions) {
  const csv = buildReportCsv(options);
  downloadBlob(
    `${options.filenamePrefix}_${reportStamp()}.csv`,
    "\uFEFF" + csv,
    "text/csv;charset=utf-8",
  );
}

export function downloadReportPdf(options: ReportExportOptions) {
  const orientation = options.orientation ?? (options.columns.length > 5 ? "landscape" : "portrait");
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const accent: [number, number, number] = [16, 185, 129];
  const ink: [number, number, number] = [17, 24, 22];
  const muted: [number, number, number] = [100, 116, 110];
  const appName = options.brand?.appName || "Club";

  doc.setFillColor(...accent);
  doc.rect(0, 0, pageW, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`${appName} — ${options.title}`, marginX, 14);

  doc.setTextColor(...muted);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(options.filterSummary || "All records", marginX, 28);
  doc.text(
    `Generated ${fmtDateTime(new Date().toISOString())} · ${options.rows.length} row(s)`,
    marginX,
    33,
  );

  const columnStyles: Record<number, { cellWidth?: number; halign?: "left" | "right" | "center" }> = {};
  options.columns.forEach((col, i) => {
    columnStyles[i] = {};
    if (col.width) columnStyles[i].cellWidth = col.width;
    if (col.align) columnStyles[i].halign = col.align;
  });

  autoTable(doc, {
    startY: 38,
    head: [options.columns.map((c) => c.header)],
    body: options.rows.map((row) => options.columns.map((c) => String(row[c.key] ?? ""))),
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
    columnStyles,
    margin: { left: marginX, right: marginX },
    didDrawPage: (data) => {
      doc.setDrawColor(226, 232, 230);
      doc.setLineWidth(0.3);
      doc.line(marginX, pageH - 10, pageW - marginX, pageH - 10);
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text(`${appName} · ${options.title}`, marginX, pageH - 5);
      doc.text(`Page ${data.pageNumber}`, pageW - marginX, pageH - 5, { align: "right" });
    },
  });

  doc.save(`${options.filenamePrefix}_${reportStamp()}.pdf`);
}

export function formatReportDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return fmtDate(value);
}

export function formatReportDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return fmtDateTime(value);
}
