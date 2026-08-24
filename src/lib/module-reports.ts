import type {
  CreditRequest,
  Member,
  PlayInvitation,
  PlaySchedule,
  Training,
  TrainingInvitation,
  User,
} from "@/lib/types";
import type { ReportFilterValues } from "@/components/ReportDialog";
import {
  downloadReportCsv,
  downloadReportPdf,
  formatFilterSummary,
  formatReportDate,
  formatReportDateTime,
  inDateRange,
  type ReportColumn,
  type ReportRow,
} from "@/lib/report-export";
import { fmtMoney } from "@/lib/format";

function memberLabel(members: Member[], id: string): string {
  const m = members.find((x) => x.id === id);
  return m ? `${m.firstName} ${m.lastName}` : "Unknown";
}

function optionLabel(
  options: Array<{ value: string; label: string }> | undefined,
  value: string,
): string {
  return options?.find((o) => o.value === value)?.label || value;
}

function summarize(
  values: ReportFilterValues,
  members: Member[],
  labels: {
    statusOptions?: Array<{ value: string; label: string }>;
    typeOptions?: Array<{ value: string; label: string }>;
    categoryOptions?: Array<{ value: string; label: string }>;
    statusLabel?: string;
    typeLabel?: string;
    categoryLabel?: string;
  } = {},
): string {
  return formatFilterSummary([
    {
      label: "Date",
      value:
        values.fromDate || values.toDate
          ? `${values.fromDate ? formatReportDate(values.fromDate) : "…"} – ${values.toDate ? formatReportDate(values.toDate) : "…"}`
          : "",
    },
    {
      label: "Member",
      value:
        values.memberId && values.memberId !== "all"
          ? memberLabel(members, values.memberId)
          : "",
      hideIf: ["all"],
    },
    {
      label: labels.statusLabel || "Status",
      value: optionLabel(labels.statusOptions, values.status),
      hideIf: ["all"],
    },
    {
      label: labels.typeLabel || "Type",
      value: optionLabel(labels.typeOptions, values.type),
      hideIf: ["all"],
    },
    {
      label: labels.categoryLabel || "Category",
      value: optionLabel(labels.categoryOptions, values.category),
      hideIf: ["all"],
    },
  ]);
}

function exportRows(
  title: string,
  filenamePrefix: string,
  columns: ReportColumn[],
  rows: ReportRow[],
  filterSummary: string,
  format: "csv" | "pdf",
  appName?: string,
) {
  const opts = {
    title,
    filenamePrefix,
    columns,
    rows,
    filterSummary,
    brand: { appName },
  };
  if (format === "csv") downloadReportCsv(opts);
  else downloadReportPdf(opts);
}

// ─── Members ───────────────────────────────────────────────────────────────

export const MEMBER_REPORT_STATUS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
];

export const MEMBER_REPORT_TYPE = [
  { value: "all", label: "All types" },
  { value: "adult", label: "Adult" },
  { value: "junior", label: "Junior" },
];

export const MEMBER_REPORT_CATEGORY = [
  { value: "all", label: "All categories" },
  { value: "membership", label: "Membership" },
  { value: "non-membership", label: "Non-membership" },
  { value: "league", label: "In league" },
  { value: "non-league", label: "Not in league" },
];

export function filterMembersForReport(
  members: Member[],
  users: User[],
  leagueMemberIds: Set<string>,
  filters: ReportFilterValues,
): Member[] {
  const userById = new Map(users.map((u) => [u.id, u]));
  return members.filter((m) => {
    if (filters.memberId && filters.memberId !== "all" && m.id !== filters.memberId) return false;
    if (filters.status !== "all" && m.status.toLowerCase() !== filters.status) return false;
    if (filters.type !== "all" && m.memberType.toLowerCase() !== filters.type) return false;
    if (filters.category === "membership" && !m.membership) return false;
    if (filters.category === "non-membership" && m.membership) return false;
    if (filters.category === "league" && !leagueMemberIds.has(m.id)) return false;
    if (filters.category === "non-league" && leagueMemberIds.has(m.id)) return false;
    const joined = m.userId ? userById.get(m.userId)?.createdAt : undefined;
    if (!inDateRange(joined, filters.fromDate, filters.toDate)) return false;
    return true;
  });
}

export function exportMembersReport(
  members: Member[],
  users: User[],
  leagueMemberIds: Set<string>,
  filters: ReportFilterValues,
  format: "csv" | "pdf",
  appName?: string,
) {
  const rows = filterMembersForReport(members, users, leagueMemberIds, filters).map((m) => {
    const user = users.find((u) => u.id === m.userId);
    return {
      name: `${m.firstName} ${m.lastName}`,
      email: m.email || "—",
      type: m.memberType,
      status: m.status,
      grade: m.grade || "—",
      biId: m.biMemberId || "—",
      membership: m.membership ? "Yes" : "No",
      league: leagueMemberIds.has(m.id) ? "Yes" : "No",
      balance: fmtMoney(m.credit || 0),
      joined: formatReportDate(user?.createdAt),
    };
  });
  exportRows(
    "Members Report",
    "members_report",
    [
      { key: "name", header: "Name", width: 36 },
      { key: "email", header: "Email", width: 42 },
      { key: "type", header: "Type", width: 18 },
      { key: "status", header: "Status", width: 20 },
      { key: "grade", header: "Grade", width: 16 },
      { key: "biId", header: "BI ID", width: 22 },
      { key: "membership", header: "Membership", width: 22 },
      { key: "league", header: "League", width: 18 },
      { key: "balance", header: "Balance", width: 22, align: "right" },
      { key: "joined", header: "Joined", width: 24 },
    ],
    rows,
    summarize(filters, members, {
      statusOptions: MEMBER_REPORT_STATUS,
      typeOptions: MEMBER_REPORT_TYPE,
      categoryOptions: MEMBER_REPORT_CATEGORY,
      categoryLabel: "Category",
    }),
    format,
    appName,
  );
}

// ─── Play schedules ────────────────────────────────────────────────────────

export const SCHEDULE_REPORT_STATUS = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "released", label: "Released" },
  { value: "rotated", label: "Rotated" },
  { value: "published", label: "Published" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

export const SCHEDULE_REPORT_TYPE = [
  { value: "all", label: "All types" },
  { value: "league", label: "League match" },
  { value: "regular", label: "Regular play" },
];

export function filterSchedulesForReport(
  schedules: PlaySchedule[],
  invites: PlayInvitation[],
  filters: ReportFilterValues,
): PlaySchedule[] {
  return schedules.filter((sch) => {
    if (!inDateRange(sch.date, filters.fromDate, filters.toDate)) return false;
    if (filters.status !== "all" && sch.status !== filters.status) return false;
    if (filters.type === "league" && !sch.isLeagueMatch) return false;
    if (filters.type === "regular" && sch.isLeagueMatch) return false;
    if (filters.category !== "all" && sch.location !== filters.category) return false;
    if (filters.memberId && filters.memberId !== "all") {
      const linked = invites.some(
        (i) => i.scheduleId === sch.id && i.memberId === filters.memberId,
      );
      if (!linked) return false;
    }
    return true;
  });
}

export function exportSchedulesReport(
  schedules: PlaySchedule[],
  invites: PlayInvitation[],
  members: Member[],
  filters: ReportFilterValues,
  format: "csv" | "pdf",
  appName?: string,
  locationOptions?: Array<{ value: string; label: string }>,
) {
  const filtered = filterSchedulesForReport(schedules, invites, filters);
  const rows = filtered.map((sch) => {
    const accepted = invites.filter((i) => i.scheduleId === sch.id && i.status === "accepted").length;
    return {
      name: sch.name,
      date: formatReportDateTime(sch.date),
      location: sch.location || "—",
      status: sch.status,
      type: sch.isLeagueMatch ? "League" : "Regular",
      courts: sch.courts,
      players: `${accepted}/${sch.players || 12}`,
      rate: fmtMoney(sch.sessionRate || 0),
    };
  });
  exportRows(
    "Play Schedules Report",
    "play_schedules_report",
    [
      { key: "name", header: "Name", width: 40 },
      { key: "date", header: "Date", width: 40 },
      { key: "location", header: "Location", width: 32 },
      { key: "status", header: "Status", width: 22 },
      { key: "type", header: "Type", width: 20 },
      { key: "courts", header: "Courts", width: 16, align: "right" },
      { key: "players", header: "Players", width: 20, align: "right" },
      { key: "rate", header: "Session rate", width: 24, align: "right" },
    ],
    rows,
    summarize(filters, members, {
      statusOptions: SCHEDULE_REPORT_STATUS,
      typeOptions: SCHEDULE_REPORT_TYPE,
      categoryOptions: locationOptions,
      categoryLabel: "Location",
    }),
    format,
    appName,
  );
}

// ─── Trainings ─────────────────────────────────────────────────────────────

export const TRAINING_REPORT_STATUS = [
  { value: "all", label: "All statuses" },
  { value: "created", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "released", label: "Released" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

export const TRAINING_REPORT_TYPE = [
  { value: "all", label: "All types" },
  { value: "adult", label: "Adult" },
  { value: "junior", label: "Junior" },
];

export function filterTrainingsForReport(
  trainings: Training[],
  invites: TrainingInvitation[],
  filters: ReportFilterValues,
): Training[] {
  return trainings.filter((t) => {
    if (!inDateRange(t.startDate, filters.fromDate, filters.toDate)) return false;
    if (filters.status !== "all" && t.status !== filters.status) return false;
    if (filters.type !== "all" && (t.targetType || "adult") !== filters.type) return false;
    if (filters.category !== "all" && t.location !== filters.category) return false;
    if (filters.memberId && filters.memberId !== "all") {
      const linked = invites.some(
        (i) => i.trainingId === t.id && i.memberId === filters.memberId,
      );
      if (!linked) return false;
    }
    return true;
  });
}

export function exportTrainingsReport(
  trainings: Training[],
  invites: TrainingInvitation[],
  members: Member[],
  filters: ReportFilterValues,
  format: "csv" | "pdf",
  appName?: string,
  locationOptions?: Array<{ value: string; label: string }>,
) {
  const filtered = filterTrainingsForReport(trainings, invites, filters);
  const rows = filtered.map((t) => {
    const accepted = invites.filter((i) => i.trainingId === t.id && i.status === "accepted").length;
    return {
      name: t.name,
      start: formatReportDateTime(t.startDate),
      end: formatReportDateTime(t.endDate),
      coach: t.coach || "—",
      location: t.location || "—",
      type: t.targetType || "adult",
      status: t.status,
      slots: `${accepted}/${t.slots || 0}`,
      fees: fmtMoney(t.fees || 0),
    };
  });
  exportRows(
    "Trainings Report",
    "trainings_report",
    [
      { key: "name", header: "Program", width: 36 },
      { key: "start", header: "Start", width: 34 },
      { key: "coach", header: "Coach", width: 28 },
      { key: "location", header: "Location", width: 28 },
      { key: "type", header: "Type", width: 18 },
      { key: "status", header: "Status", width: 20 },
      { key: "slots", header: "Slots", width: 18, align: "right" },
      { key: "fees", header: "Fees", width: 22, align: "right" },
    ],
    rows,
    summarize(filters, members, {
      statusOptions: TRAINING_REPORT_STATUS,
      typeOptions: TRAINING_REPORT_TYPE,
      categoryOptions: locationOptions,
      categoryLabel: "Location",
    }),
    format,
    appName,
  );
}

// ─── Wallet (credit requests) ──────────────────────────────────────────────

export const WALLET_REPORT_STATUS = [
  { value: "all", label: "All statuses" },
  { value: "created", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export const WALLET_REPORT_TYPE = [
  { value: "all", label: "All types" },
  { value: "credit", label: "Credit" },
  { value: "debit", label: "Debit" },
  { value: "refund", label: "Refund" },
];

export const WALLET_REPORT_CATEGORY = [
  { value: "all", label: "All categories" },
  { value: "pending", label: "Awaiting approval" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
];

export function filterWalletForReport(
  requests: CreditRequest[],
  filters: ReportFilterValues,
): CreditRequest[] {
  return requests.filter((r) => {
    if (!inDateRange(r.date || r.createdAt, filters.fromDate, filters.toDate)) return false;
    if (filters.memberId && filters.memberId !== "all" && r.memberId !== filters.memberId) {
      return false;
    }
    if (filters.status !== "all" && r.status !== filters.status) return false;
    const entryType = r.type || "credit";
    if (filters.type !== "all" && entryType !== filters.type) return false;
    if (filters.category === "pending" && r.status !== "created") return false;
    if (filters.category === "completed" && r.status !== "approved") return false;
    if (filters.category === "rejected" && r.status !== "rejected") return false;
    return true;
  });
}

export function exportWalletReport(
  requests: CreditRequest[],
  members: Member[],
  filters: ReportFilterValues,
  format: "csv" | "pdf",
  appName?: string,
) {
  const filtered = filterWalletForReport(requests, filters);
  const rows = filtered.map((r) => ({
    date: formatReportDate(r.date || r.createdAt),
    member: memberLabel(members, r.memberId),
    type: r.type || "credit",
    status: r.status === "created" ? "pending" : r.status,
    amount: fmtMoney(r.amount),
    reason: r.reason || "—",
  }));
  exportRows(
    "Wallet Report",
    "wallet_report",
    [
      { key: "date", header: "Date", width: 28 },
      { key: "member", header: "Member", width: 40 },
      { key: "type", header: "Type", width: 20 },
      { key: "status", header: "Status", width: 22 },
      { key: "amount", header: "Amount", width: 24, align: "right" },
      { key: "reason", header: "Reason", width: 50 },
    ],
    rows,
    summarize(filters, members, {
      statusOptions: WALLET_REPORT_STATUS,
      typeOptions: WALLET_REPORT_TYPE,
      categoryOptions: WALLET_REPORT_CATEGORY,
    }),
    format,
    appName,
  );
}

// ─── Approvals ─────────────────────────────────────────────────────────────

export type ApprovalReportRow = {
  date: string;
  kind: "member" | "junior" | "credit";
  name: string;
  type: string;
  status: string;
  detail: string;
  amount: string;
  /** Linked member id when known (juniors / credit requests). */
  memberId?: string;
  /** Linked user id for member registration requests. */
  userId?: string;
};

export const APPROVAL_REPORT_STATUS = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export const APPROVAL_REPORT_TYPE = [
  { value: "all", label: "All types" },
  { value: "member", label: "Member request" },
  { value: "junior", label: "Junior request" },
  { value: "credit", label: "Credit request" },
];

export const APPROVAL_REPORT_CATEGORY = [
  { value: "all", label: "All categories" },
  { value: "adult", label: "Adult" },
  { value: "junior", label: "Junior" },
  { value: "credit", label: "Credit" },
  { value: "debit", label: "Debit" },
  { value: "refund", label: "Refund" },
];

function mapUserStatus(status: User["status"]): "pending" | "approved" | "rejected" {
  if (status === "created") return "pending";
  if (status === "rejected") return "rejected";
  return "approved";
}

function mapMemberStatus(status: Member["status"]): "pending" | "approved" | "rejected" | "other" {
  if (status === "pending") return "pending";
  if (status === "rejected") return "rejected";
  if (status === "active") return "approved";
  return "other";
}

function mapCreditStatus(status: CreditRequest["status"]): "pending" | "approved" | "rejected" {
  if (status === "created") return "pending";
  if (status === "rejected") return "rejected";
  return "approved";
}

export function buildApprovalReportRows(
  users: User[],
  members: Member[],
  creditRequests: CreditRequest[],
): ApprovalReportRow[] {
  const rows: ApprovalReportRow[] = [];

  for (const u of users.filter((x) => x.role === "member")) {
    // Registration approvals are for portal accounts awaiting review
    rows.push({
      date: u.createdAt || "",
      kind: "member",
      name: `${u.firstName} ${u.lastName}`,
      type: u.role,
      status: mapUserStatus(u.status),
      detail: u.email || u.mobile || "—",
      amount: "—",
      userId: u.id,
      memberId: members.find((m) => m.userId === u.id && m.memberType === "adult")?.id,
    });
  }

  for (const m of members.filter((x) => x.memberType === "junior")) {
    const mapped = mapMemberStatus(m.status);
    if (mapped === "other") continue;
    const parent = m.parentMemberId ? memberLabel(members, m.parentMemberId) : "—";
    rows.push({
      date: "",
      kind: "junior",
      name: `${m.firstName} ${m.lastName}`,
      type: "junior",
      status: mapped,
      detail: `Parent: ${parent}`,
      amount: "—",
      memberId: m.id,
    });
  }

  for (const r of creditRequests.filter((c) => (c.type || "credit") === "credit")) {
    rows.push({
      date: r.createdAt || r.date || "",
      kind: "credit",
      name: memberLabel(members, r.memberId),
      type: r.type || "credit",
      status: mapCreditStatus(r.status),
      detail: r.reason || "Credit top-up",
      amount: fmtMoney(r.amount),
      memberId: r.memberId,
    });
  }

  return rows;
}

export function filterApprovalsForReport(
  rows: ApprovalReportRow[],
  filters: ReportFilterValues,
  members: Member[],
): ApprovalReportRow[] {
  const target = filters.memberId && filters.memberId !== "all"
    ? members.find((m) => m.id === filters.memberId)
    : undefined;

  return rows.filter((row) => {
    if (!inDateRange(row.date || undefined, filters.fromDate, filters.toDate)) return false;
    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.type !== "all" && row.kind !== filters.type) return false;
    if (filters.category !== "all") {
      if (filters.category === "adult" && row.kind !== "member") return false;
      if (filters.category === "junior" && row.kind !== "junior") return false;
      if (["credit", "debit", "refund"].includes(filters.category) && row.type !== filters.category) {
        return false;
      }
    }
    if (target) {
      const matchesSelf = row.memberId === target.id;
      const matchesUser = Boolean(target.userId && row.userId === target.userId);
      const matchesParent =
        row.kind === "junior" &&
        members.some(
          (j) =>
            j.id === row.memberId &&
            (j.parentMemberId === target.id || j.userId === target.userId),
        );
      if (!matchesSelf && !matchesUser && !matchesParent) return false;
    }
    return true;
  });
}

export function exportApprovalsReport(
  rows: ApprovalReportRow[],
  members: Member[],
  filters: ReportFilterValues,
  format: "csv" | "pdf",
  appName?: string,
) {
  const filtered = filterApprovalsForReport(rows, filters, members);
  const exportBody = filtered.map((r) => ({
    date: formatReportDate(r.date || undefined),
    kind:
      r.kind === "member" ? "Member request" : r.kind === "junior" ? "Junior request" : "Credit request",
    name: r.name,
    type: r.type,
    status: r.status,
    detail: r.detail,
    amount: r.amount,
  }));
  exportRows(
    "Approvals Report",
    "approvals_report",
    [
      { key: "date", header: "Date", width: 26 },
      { key: "kind", header: "Request", width: 32 },
      { key: "name", header: "Name", width: 36 },
      { key: "type", header: "Type", width: 18 },
      { key: "status", header: "Status", width: 20 },
      { key: "detail", header: "Detail", width: 44 },
      { key: "amount", header: "Amount", width: 22, align: "right" },
    ],
    exportBody,
    summarize(filters, members, {
      statusOptions: APPROVAL_REPORT_STATUS,
      typeOptions: APPROVAL_REPORT_TYPE,
      categoryOptions: APPROVAL_REPORT_CATEGORY,
    }),
    format,
    appName,
  );
}
