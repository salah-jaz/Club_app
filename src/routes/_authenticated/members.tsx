import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { useMemo, useRef, useState } from "react";
import { useResponsiveViewMode } from "@/hooks/use-responsive-view-mode";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Plus, Pencil, Wallet, LayoutGrid, List, Users, UserRound, Trophy,
  Upload, Download, Mail, IdCard, CheckSquare, Square, ChevronDown, ChevronRight,
} from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { SearchFilterBar, useSearchFilters } from "@/components/SearchFilterBar";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { toast } from "sonner";
import { Trash2, LogIn } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Member } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Flat or nested row for the members list (juniors nest under same-user adults when viewing All). */
type MemberDisplayRow = {
  member: Member;
  depth: 0 | 1;
  /** Adult id this junior is nested under (depth 1 only) */
  parentId?: string;
  /** Nested junior count (depth 0 parents only) */
  childCount?: number;
};

function sortMembers(list: Member[], sortBy: string): Member[] {
  return [...list].sort((a, b) => {
    if (sortBy === "name-asc") {
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    }
    if (sortBy === "name-desc") {
      return `${b.firstName} ${b.lastName}`.localeCompare(`${a.firstName} ${a.lastName}`);
    }
    if (sortBy === "balance-desc") return b.credit - a.credit;
    if (sortBy === "balance-asc") return a.credit - b.credit;
    return 0;
  });
}

/**
 * When category is "all", nest juniors under their parent adult
 * (parentMemberId, or same userId family account).
 * Adult / Junior filters stay flat (only that type).
 */
function buildMemberDisplayRows(list: Member[], nestFamilies: boolean, sortBy: string): MemberDisplayRow[] {
  const sorted = sortMembers(list, sortBy);
  if (!nestFamilies) {
    return sorted.map((member) => ({ member, depth: 0 as const, childCount: 0 }));
  }

  const byId = new Map(sorted.map((m) => [m.id, m]));
  const juniorsByParent = new Map<string, Member[]>();
  const nestedJuniorIds = new Set<string>();

  for (const m of sorted) {
    const isJunior = m.memberType.toLowerCase() === "junior";
    if (!isJunior) continue;

    // Prefer explicit parent link
    let parentId = m.parentMemberId || null;
    if (parentId && !byId.has(parentId)) {
      parentId = null; // parent filtered out — show junior top-level
    }

    // Fallback: same login account as an adult in the list
    if (!parentId && m.userId) {
      const adultSibling = sorted.find(
        (a) =>
          a.id !== m.id &&
          a.userId === m.userId &&
          a.memberType.toLowerCase() === "adult",
      );
      if (adultSibling) parentId = adultSibling.id;
    }

    if (parentId) {
      if (!juniorsByParent.has(parentId)) juniorsByParent.set(parentId, []);
      juniorsByParent.get(parentId)!.push(m);
      nestedJuniorIds.add(m.id);
    }
  }

  const rows: MemberDisplayRow[] = [];
  const emitted = new Set<string>();

  for (const m of sorted) {
    if (nestedJuniorIds.has(m.id)) continue;
    if (emitted.has(m.id)) continue;
    emitted.add(m.id);
    const kids = juniorsByParent.get(m.id) ?? [];
    rows.push({ member: m, depth: 0, childCount: kids.length });
    for (const j of kids) {
      if (emitted.has(j.id)) continue;
      emitted.add(j.id);
      rows.push({ member: j, depth: 1, parentId: m.id, childCount: 0 });
    }
  }

  return rows;
}
import {
  ConfirmDeleteDialog,
  type ConfirmDeleteRequest,
} from "@/components/ConfirmDeleteDialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MEMBER_TEMPLATE_HEADERS = [
  "first_name",
  "last_name",
  "email",
  "sex",
  "dob",
  "mobile",
  "address",
  "member_type",
  "parent_bi_member_id",
  "bi_member_id",
  "membership",
  "training_eligible",
  "grade",
  "status",
] as const;

function csvEscapeCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function buildMemberBulkTemplate(adultGradesIn: string[], juniorGradesIn: string[]) {
  const adultGrades = adultGradesIn.length ? adultGradesIn : ["A", "B", "C", "D"];
  const juniorGrades = juniorGradesIn.length
    ? juniorGradesIn
    : ["Beginner", "Intermediate", "Advanced"];
  const types = ["adult", "junior"] as const;
  const headers = [...MEMBER_TEMPLATE_HEADERS];

  const exampleRows: string[][] = [];
  const EXAMPLE_COUNT = 20;
  const adultCount = Math.ceil(EXAMPLE_COUNT / 2);

  for (let i = 0; i < EXAMPLE_COUNT; i++) {
    const n = String(i + 1).padStart(2, "0");
    const isAdult = i < adultCount;
    const grade = isAdult
      ? adultGrades[i % adultGrades.length]
      : juniorGrades[(i - adultCount) % juniorGrades.length];
    const sex = i % 2 === 0 ? "female" : "male";

    exampleRows.push([
      "Member",
      n,
      `member${n}@example.com`,
      sex,
      isAdult ? "1990-01-15" : "2012-06-20",
      `+1 555 ${isAdult ? "01" : "02"}${n}`,
      isAdult ? "123 Main Street" : "45 Park Avenue",
      isAdult ? "adult" : "junior",
      // Juniors must point at an adult BI so they nest as sub-members
      isAdult ? "" : `BI-${String(((i - adultCount) % adultCount) + 1).padStart(2, "0")}`,
      `BI-${n}`,
      "true",
      isAdult ? "false" : "true",
      grade,
      "active",
    ]);
  }

  const blank = Array(headers.length).fill("");
  const refRows: { label: string; value: string }[] = [
    { label: "AVAILABLE_TYPES", value: types.join(" | ") },
    { label: "AVAILABLE_ADULT_GRADES", value: adultGrades.join(" | ") },
    { label: "AVAILABLE_JUNIOR_GRADES", value: juniorGrades.join(" | ") },
    {
      label: "PARENT_LINKING",
      value:
        "For junior rows, set parent_bi_member_id to the adult's bi_member_id (e.g. BI-01). Leave blank for adults. This nests the junior under that adult in All members.",
    },
    {
      label: "NOTES",
      value:
        "member_type must be adult or junior; grade must match that type; membership/training_eligible are true/false; status is active, disabled, pending, or rejected. Assign league players in League Groups. Delete the REFERENCE section before uploading.",
    },
  ];

  const lines = [
    headers.map(csvEscapeCell).join(","),
    ...exampleRows.map((row) => row.map(csvEscapeCell).join(",")),
    blank.join(","),
    ["REFERENCE_DO_NOT_IMPORT", "Delete this section before uploading", ...Array(headers.length - 2).fill("")]
      .map(csvEscapeCell)
      .join(","),
    ...refRows.map((r) =>
      [r.label, r.value, ...Array(headers.length - 2).fill("")].map(csvEscapeCell).join(","),
    ),
  ];

  return {
    headers,
    exampleRows,
    types: [...types],
    adultGrades,
    juniorGrades,
    refRows,
    csvText: lines.join("\n"),
    examplesCsvText: [
      headers.map(csvEscapeCell).join(","),
      ...exampleRows.map((row) => row.map(csvEscapeCell).join(",")),
    ].join("\n"),
  };
}

function downloadCsvFile(csvText: string, filename: string) {
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/_authenticated/members")({ component: MembersLayout });

function MembersLayout() {
  const matches = useMatches();
  const isIndex = matches[matches.length - 1].routeId === Route.id;
  if (!isIndex) return <Outlet />;
  return <MembersList />;
}

const STAT_ACCENTS = [
  { border: "var(--primary)", iconBg: "var(--violet-dim)", iconColor: "var(--primary)" },
  { border: "#F59E0B", iconBg: "rgba(245,158,11,0.12)", iconColor: "#F59E0B" },
  { border: "var(--gold)", iconBg: "var(--gold-dim)", iconColor: "var(--gold)" },
  { border: "#818CF8", iconBg: "rgba(129,140,248,0.12)", iconColor: "#818CF8" },
];

function MemberStatCard({
  label,
  value,
  hint,
  icon: Icon,
  index,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: typeof Users;
  index: number;
}) {
  const accent = STAT_ACCENTS[index % STAT_ACCENTS.length];
  return (
    <motion.div variants={staggerItem} className="h-full">
      <Card
        className="signature-card-top h-full bg-[#131916] border-[rgba(255,255,255,0.06)]"
        style={{ borderTopColor: accent.border, borderTopWidth: 1, borderImage: "none" }}
      >
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase">{label}</p>
              <p className="type-stat-value mt-1.5 text-2xl sm:text-3xl">
                <AnimatedCounter value={value} />
              </p>
              {hint && <p className="text-[11px] text-[#6B7F78] mt-1">{hint}</p>}
            </div>
            <div
              className="size-9 sm:size-10 rounded-lg grid place-items-center shrink-0"
              style={{ background: accent.iconBg }}
            >
              <Icon className="size-4 sm:size-5" style={{ color: accent.iconColor }} />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MemberTags({ member }: { member: Member }) {
  const isJunior = member.memberType.toLowerCase() === "junior";
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] font-medium border px-2 py-0",
          isJunior
            ? "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/25"
            : "bg-[#10B981]/10 text-[#34D399] border-[#10B981]/25",
        )}
      >
        {isJunior ? "Junior" : "Adult"}
      </Badge>
      {member.grade && (
        <Badge variant="outline" className="text-[10px] font-medium bg-white/[0.03] border-white/10 text-[#C4D4CF] px-2 py-0">
          {member.grade}
        </Badge>
      )}
      {member.membership && (
        <Badge variant="outline" className="text-[10px] font-medium bg-[#2DD4BF]/10 text-[#5EEAD4] border-[#2DD4BF]/25 px-2 py-0">
          Member
        </Badge>
      )}
      {member.trainingEligible && (
        <Badge variant="outline" className="text-[10px] font-medium bg-white/[0.03] border-white/10 text-[#8FA89F] px-2 py-0">
          Training
        </Badge>
      )}
    </div>
  );
}

function MemberActions({
  member,
  activeRole,
  onRequestDelete,
  compact = false,
}: {
  member: Member;
  activeRole: string;
  onRequestDelete: (member: Member) => void;
  compact?: boolean;
}) {
  const loginAs = useStore((s) => s.loginAs);
  const isJunior = member.memberType.toLowerCase() === "junior";
  const canEdit = activeRole === "admin" || (activeRole === "member" && isJunior);
  const canCredits = activeRole === "admin" || activeRole === "member";
  // Juniors (and all members) may only be deleted by admins
  const canDelete = activeRole === "admin";
  const btnClass = compact
    ? "h-8 text-xs px-2"
    : "h-9 text-xs flex-1 basis-[calc(50%-0.25rem)] sm:basis-0 min-w-0";

  return (
    <div className={cn("flex flex-wrap gap-2 min-w-0", compact ? "justify-end" : "w-full")}>
      {activeRole === "admin" && !isJunior && (
        <Button
          variant="outline"
          className={cn("bg-[#10B981]/10 text-[#34D399] border-[#10B981]/25 hover:bg-[#10B981]/20 hover:cursor-pointer min-w-0", btnClass)}
          onClick={async () => {
            if (confirm(`Login as ${member.firstName} ${member.lastName}?`)) {
              try {
                await loginAs(member.id);
                toast.success(`Logged in as ${member.firstName}`);
                window.location.href = "/dashboard";
              } catch (error: any) {
                toast.error(error.message || "Failed to login as member.");
              }
            }
          }}
        >
          <LogIn className="size-3.5 mr-1 shrink-0" /> <span className="truncate">Login</span>
        </Button>
      )}
      {canEdit && (
        <Button asChild variant="outline" className={cn("btn-premium-outline hover:cursor-pointer min-w-0", btnClass)}>
          <Link to="/members/$id/edit" params={{ id: member.id }}>
            <Pencil className="size-3.5 mr-1 shrink-0" /> <span className="truncate">Edit</span>
          </Link>
        </Button>
      )}
      {canCredits && (
        <Button asChild variant="outline" className={cn("btn-premium-violet-outline hover:cursor-pointer min-w-0", btnClass)}>
          <Link to={`/credits?memberId=${member.id}` as any}>
            <Wallet className="size-3.5 mr-1 shrink-0" /> <span className="truncate">Credits</span>
          </Link>
        </Button>
      )}
      {canDelete && (
        <Button
          variant="destructive"
          className={cn(
            "btn-premium-danger hover:cursor-pointer shrink-0",
            compact ? "h-8 w-8 p-0" : "h-9 w-9 p-0",
          )}
          onClick={() => onRequestDelete(member)}
          aria-label={`Remove ${member.firstName} ${member.lastName}`}
          title="Remove"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function MembersList() {
  // Temporarily hide row selection + Bulk actions UI (set true to restore)
  const SHOW_MEMBER_BULK_UI = false;

  const user = useCurrentUser()!;
  const all = useStore((s) => s.members);
  const leagueGroups = useStore((s) => s.leagueGroups) || [];
  const deleteMember = useStore((s) => s.deleteMember);
  const activeRole = useStore((s) => s.activeRole) || user.role;
  const store = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { viewMode, setViewMode, isMobile } = useResponsiveViewMode("clubapp-view-mode-members", "list");
  const [templateImporting, setTemplateImporting] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [deleteRequest, setDeleteRequest] = useState<ConfirmDeleteRequest | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Adult member ids with juniors expanded */
  const [expandedFamilyIds, setExpandedFamilyIds] = useState<Set<string>>(() => new Set());
  const bulkDeleteMembers = useStore((s) => s.bulkDeleteMembers);

  const requestDeleteMember = (member: Member) => {
    const state = useStore.getState();
    const playInvites = (state.playInvites ?? []).filter((i) => i.memberId === member.id);
    const trainingInvites = (state.trainingInvites ?? []).filter((i) => i.memberId === member.id);
    const trainingDateLinks = (state.trainingDates ?? []).filter((d) => d.memberId === member.id);
    const txCount = (state.transactions ?? []).filter((t) => t.memberId === member.id).length;
    const creditCount = (state.creditRequests ?? []).filter((cr) => cr.memberId === member.id).length;
    const leagueCount = (state.leagueGroups ?? []).filter((g) => g.memberIds?.includes(member.id)).length;

    const scheduleIds = [...new Set(playInvites.map((i) => i.scheduleId))];
    const trainingIds = [
      ...new Set([
        ...trainingInvites.map((i) => i.trainingId),
        ...trainingDateLinks.map((d) => d.trainingId),
      ]),
    ];
    const scheduleNames = scheduleIds
      .map((id) => state.schedules.find((s) => s.id === id)?.name)
      .filter((n): n is string => !!n);
    const trainingNames = trainingIds
      .map((id) => state.trainings.find((t) => t.id === id)?.name)
      .filter((n): n is string => !!n);

    const inPlayOrTraining = scheduleNames.length > 0 || trainingNames.length > 0;

    setDeleteRequest({
      title: inPlayOrTraining ? "Member is in a schedule or training" : "Remove member",
      entityName: `${member.firstName} ${member.lastName}`,
      related: [
        { label: "play invitations", count: playInvites.length },
        { label: "training enrollments", count: trainingInvites.length },
        { label: "training session dates", count: trainingDateLinks.length },
        { label: "transactions", count: txCount },
        { label: "credit requests", count: creditCount },
        { label: "league groups", count: leagueCount },
      ],
      scheduleNames,
      trainingNames,
      warning: inPlayOrTraining
        ? "Please confirm you still want to delete this member. Linked play and training records will be removed (cascade)."
        : txCount + creditCount > 0
          ? "Linked transactions and credit records will also be deleted (cascade)."
          : undefined,
      confirmLabel: inPlayOrTraining ? "Yes, delete member" : "Remove",
      onConfirm: async () => {
        try {
          await deleteMember(member.id);
          toast.success("Member removed successfully");
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Failed to remove member");
          throw e;
        }
      },
    });
  };

  const {
    search,
    filters,
    sortBy,
    setSearch,
    setFilter,
    clearFilters,
    setSortBy,
  } = useSearchFilters(
    { category: "all", status: "all", balance: "all", league: "all" },
    "name-asc",
  );

  const filterConfig = [
    {
      key: "category",
      label: "Type",
      options: [
        { value: "all", label: "All Types" },
        { value: "adult", label: "Adult" },
        { value: "junior", label: "Junior" },
      ],
    },
    {
      key: "status",
      label: "Status",
      options: [
        { value: "all", label: "All Statuses" },
        { value: "active", label: "Active" },
        { value: "disabled", label: "Disabled" },
        { value: "pending", label: "Pending" },
        { value: "rejected", label: "Rejected" },
      ],
    },
    {
      key: "balance",
      label: "Balance",
      options: [
        { value: "all", label: "All Balances" },
        { value: "positive", label: "Has Credit" },
        { value: "negative", label: "Owes / Negative" },
      ],
    },
    {
      key: "league",
      label: "League",
      options: [
        { value: "all", label: "Everyone" },
        { value: "league", label: "In League Groups" },
        { value: "non-league", label: "Not in League Groups" },
      ],
    },
  ];

  const sortOptions = [
    { value: "name-asc", label: "Name A → Z" },
    { value: "name-desc", label: "Name Z → A" },
    { value: "balance-desc", label: "Balance: High → Low" },
    { value: "balance-asc", label: "Balance: Low → High" },
  ];

  const baseMembers = useMemo(
    () => (activeRole === "admin" ? all : all.filter((m) => m.userId === user.id)),
    [activeRole, all, user.id],
  );

  const leagueMemberIds = useMemo(() => {
    const ids = new Set<string>();
    for (const g of leagueGroups) {
      for (const id of g.memberIds ?? []) ids.add(id);
    }
    return ids;
  }, [leagueGroups]);

  const stats = useMemo(() => ({
    total: baseMembers.length,
    adults: baseMembers.filter((m) => m.memberType.toLowerCase() === "adult").length,
    juniors: baseMembers.filter((m) => m.memberType.toLowerCase() === "junior").length,
    league: baseMembers.filter((m) => leagueMemberIds.has(m.id)).length,
    active: baseMembers.filter((m) => m.status === "active").length,
  }), [baseMembers, leagueMemberIds]);

  const processed = useMemo(() => {
    let list = baseMembers.filter((m) => {
      const fullName = `${m.firstName} ${m.lastName}`.toLowerCase();
      const email = m.email.toLowerCase();
      const q = search.toLowerCase();
      return fullName.includes(q) || email.includes(q) || (m.biMemberId?.toLowerCase().includes(q) ?? false);
    });

    if (filters.category !== "all") {
      list = list.filter((m) => m.memberType.toLowerCase() === filters.category);
    }
    if (filters.status !== "all") {
      list = list.filter((m) => m.status.toLowerCase() === filters.status);
    }
    if (filters.balance === "positive") {
      list = list.filter((m) => m.credit > 0);
    } else if (filters.balance === "negative") {
      list = list.filter((m) => m.credit < 0);
    }
    if (filters.league === "league") {
      list = list.filter((m) => leagueMemberIds.has(m.id));
    } else if (filters.league === "non-league") {
      list = list.filter((m) => !leagueMemberIds.has(m.id));
    }

    return sortMembers(list, sortBy);
  }, [baseMembers, search, filters, sortBy, leagueMemberIds]);

  /** Nest juniors under adults only in All (no type filter). Adult/Junior filters stay flat. */
  const nestFamilies = filters.category === "all";
  const displayRows = useMemo(
    () => buildMemberDisplayRows(processed, nestFamilies, sortBy),
    [processed, nestFamilies, sortBy],
  );

  const visibleRows = useMemo(() => {
    if (!nestFamilies) return displayRows;
    return displayRows.filter(
      (r) => r.depth === 0 || (r.parentId != null && expandedFamilyIds.has(r.parentId)),
    );
  }, [displayRows, nestFamilies, expandedFamilyIds]);

  const toggleFamilyExpand = (parentId: string) => {
    setExpandedFamilyIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const hasActiveFilters =
    !!search || Object.values(filters).some((f) => f !== "all");

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allVisibleSelected =
    visibleRows.length > 0 && visibleRows.every((r) => selectedSet.has(r.member.id));
  const someVisibleSelected = visibleRows.some((r) => selectedSet.has(r.member.id));

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id),
    );
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    const visibleIds = visibleRows.map((r) => r.member.id);
    setSelectedIds((prev) => {
      if (checked) {
        return [...new Set([...prev, ...visibleIds])];
      }
      const drop = new Set(visibleIds);
      return prev.filter((id) => !drop.has(id));
    });
  };

  const requestBulkDelete = (ids: string[], label: string) => {
    if (ids.length === 0) {
      toast.error("Select at least one member to delete.");
      return;
    }
    const state = useStore.getState();
    const idSet = new Set(ids);
    const playInvites = (state.playInvites ?? []).filter((i) => idSet.has(i.memberId));
    const trainingInvites = (state.trainingInvites ?? []).filter((i) => idSet.has(i.memberId));
    const trainingDateLinks = (state.trainingDates ?? []).filter((d) => idSet.has(d.memberId));

    const scheduleIds = [...new Set(playInvites.map((i) => i.scheduleId))];
    const trainingIds = [
      ...new Set([
        ...trainingInvites.map((i) => i.trainingId),
        ...trainingDateLinks.map((d) => d.trainingId),
      ]),
    ];
    const scheduleNames = scheduleIds
      .map((id) => state.schedules.find((s) => s.id === id)?.name)
      .filter((n): n is string => !!n);
    const trainingNames = trainingIds
      .map((id) => state.trainings.find((t) => t.id === id)?.name)
      .filter((n): n is string => !!n);

    const membersInPlay = new Set(playInvites.map((i) => i.memberId)).size;
    const membersInTraining = new Set([
      ...trainingInvites.map((i) => i.memberId),
      ...trainingDateLinks.map((d) => d.memberId),
    ]).size;
    const inPlayOrTraining = scheduleNames.length > 0 || trainingNames.length > 0;

    setDeleteRequest({
      title: inPlayOrTraining
        ? "Members are in schedules or trainings"
        : "Delete members",
      entityName: label,
      related: [
        { label: ids.length === 1 ? "member" : "members", count: ids.length },
        { label: "in play schedules", count: membersInPlay },
        { label: "in trainings", count: membersInTraining },
        { label: "play invitations", count: playInvites.length },
        { label: "training enrollments", count: trainingInvites.length },
      ],
      scheduleNames,
      trainingNames,
      warning: inPlayOrTraining
        ? "Some selected members are linked to play schedules or trainings. Confirm to delete them and cascade their invitations/enrollments."
        : "This permanently removes the selected members and cascaded invitations, transactions, and credit records.",
      confirmLabel: inPlayOrTraining ? "Yes, delete members" : "Delete all",
      onConfirm: async () => {
        try {
          const count = await bulkDeleteMembers(ids);
          setSelectedIds([]);
          toast.success(`Deleted ${count} member${count === 1 ? "" : "s"}`);
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : "Failed to delete members");
          throw e;
        }
      },
    });
  };

  const quickFilters = [
    { id: "all", label: "All", apply: () => { clearFilters(); } },
    { id: "adult", label: "Adults", apply: () => setFilter("category", "adult") },
    { id: "junior", label: "Juniors", apply: () => setFilter("category", "junior") },
    { id: "league", label: "League", apply: () => setFilter("league", "league") },
    { id: "active", label: "Active", apply: () => setFilter("status", "active") },
  ];

  const isQuickActive = (id: string) => {
    if (id === "all") return !hasActiveFilters;
    if (id === "adult") return filters.category === "adult" && !search;
    if (id === "junior") return filters.category === "junior" && !search;
    if (id === "league") return filters.league === "league" && !search;
    if (id === "active") return filters.status === "active" && !search;
    return false;
  };

  const memberTemplate = useMemo(
    () => buildMemberBulkTemplate(store.adultGrades ?? [], store.juniorGrades ?? []),
    [store.adultGrades, store.juniorGrades],
  );

  const handleDownloadTemplate = () => {
    downloadCsvFile(memberTemplate.csvText, "member_bulk_upload_template.csv");
    toast.success("Template downloaded");
  };

  const handleImportExamples = async () => {
    setTemplateImporting(true);
    const loadingToast = toast.loading("Importing example members...");
    try {
      const file = new File(
        [memberTemplate.examplesCsvText],
        "member_template_examples.csv",
        { type: "text/csv" },
      );
      const created = await store.bulkUploadMembers(file, { allowExamples: true });
      toast.dismiss(loadingToast);
      if (created > 0) {
        toast.success(`Imported ${created} example member${created === 1 ? "" : "s"}`);
        setTemplateOpen(false);
      } else {
        toast.message("No new members imported", {
          description: "These example emails may already exist.",
        });
      }
    } catch (err: unknown) {
      toast.dismiss(loadingToast);
      toast.error(err instanceof Error ? err.message : "Failed to import examples.");
    } finally {
      setTemplateImporting(false);
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const loadingToast = toast.loading("Uploading CSV and creating members...");
    try {
      const created = await store.bulkUploadMembers(file);
      toast.dismiss(loadingToast);
      toast.success(
        created > 0
          ? `Members uploaded successfully (${created} created)`
          : "Upload finished — no new members created",
      );
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error(err.message || "Failed to upload members.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6 pb-8">
      <ConfirmDeleteDialog
        request={deleteRequest}
        onOpenChange={(open) => !open && setDeleteRequest(null)}
      />
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] w-[calc(100%-1.5rem)] max-w-4xl max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/[0.06] shrink-0">
            <DialogTitle className="text-[#F1F0EE]">Bulk upload template</DialogTitle>
            <DialogDescription className="text-[#8A8A98] text-left">
              Includes <span className="text-[#FBBF24] font-medium">parent_bi_member_id</span> so
              juniors nest under adults. Download the CSV to edit, or import these examples directly.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="px-2.5 py-1 rounded-full bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.25)] text-[#34D399]">
                Types: {memberTemplate.types.join(" · ")}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-[rgba(251,191,36,0.08)] border border-[rgba(251,191,36,0.25)] text-[#FBBF24]">
                Adult grades: {memberTemplate.adultGrades.join(" · ")}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-[rgba(129,140,248,0.10)] border border-[rgba(129,140,248,0.25)] text-[#A5B4FC]">
                Junior grades: {memberTemplate.juniorGrades.join(" · ")}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-[rgba(245,158,11,0.12)] border border-[rgba(245,158,11,0.35)] text-[#FBBF24]">
                Junior → parent_bi_member_id (e.g. BI-01)
              </span>
            </div>

            <div className="rounded-lg border border-[rgba(245,158,11,0.30)] bg-[rgba(245,158,11,0.08)] px-3 py-2.5 text-[12px] text-[#F1F0EE]">
              <span className="font-semibold text-[#FBBF24]">Parent linking:</span>{" "}
              For each <span className="font-mono text-[#34D399]">junior</span> row, set{" "}
              <span className="font-mono text-[#FBBF24]">parent_bi_member_id</span> to the adult&apos;s{" "}
              <span className="font-mono">bi_member_id</span>. Leave it empty for adults.
              Example juniors in this template already point at BI-01 … BI-10.
            </div>

            <div className="rounded-xl border border-[rgba(255,255,255,0.08)] overflow-hidden">
              <div className="overflow-x-auto max-h-[280px]">
                <Table>
                  <TableHeader className="bg-[#0C0F0E] sticky top-0 z-10">
                    <TableRow className="border-b border-white/10 hover:bg-transparent">
                      {memberTemplate.headers.map((h) => (
                        <TableHead
                          key={h}
                          className={cn(
                            "type-table-head h-9 px-3 text-[10px] whitespace-nowrap",
                            h === "parent_bi_member_id" && "text-[#FBBF24]",
                            h === "member_type" && "text-[#34D399]",
                          )}
                        >
                          {h}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {memberTemplate.exampleRows.map((row, idx) => (
                      <TableRow
                        key={idx}
                        className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                      >
                        {row.map((cell, cIdx) => {
                          const header = memberTemplate.headers[cIdx];
                          return (
                            <TableCell
                              key={cIdx}
                              className={cn(
                                "px-3 py-2 text-[11px] whitespace-nowrap",
                                header === "member_type" && "text-[#34D399] font-medium",
                                header === "parent_bi_member_id" && cell && "text-[#FBBF24] font-medium",
                                header === "grade" && "text-[#34D399] font-medium",
                                String(cell).includes("@example.com") && "text-[#FBBF24]",
                              )}
                            >
                              {cell || (header === "parent_bi_member_id" ? "—" : cell)}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="rounded-xl border border-[rgba(16,185,129,0.22)] bg-[rgba(16,185,129,0.06)] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#34D399]">
                  Reference (end of CSV — do not import)
                </p>
                <span className="text-[10px] text-[#8A8A98]">From Settings</span>
              </div>
              <div className="space-y-2.5">
                {memberTemplate.refRows.map((r) => (
                  <div
                    key={r.label}
                    className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] px-3 py-2.5"
                  >
                    <p className="font-mono text-[10px] tracking-wide text-[#34D399] mb-1.5">
                      {r.label}
                    </p>
                    {r.label === "NOTES" ? (
                      <p className="text-[12px] leading-relaxed text-[#C4D4CF]">{r.value}</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {r.value.split(" | ").map((item) => (
                          <span
                            key={item}
                            className={cn(
                              "px-2 py-0.5 rounded-md text-[11px] font-medium border",
                              r.label.includes("ADULT")
                                ? "bg-[rgba(251,191,36,0.12)] border-[rgba(251,191,36,0.30)] text-[#FBBF24]"
                                : r.label.includes("JUNIOR")
                                  ? "bg-[rgba(129,140,248,0.12)] border-[rgba(129,140,248,0.30)] text-[#A5B4FC]"
                                  : "bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.30)] text-[#34D399]",
                            )}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-white/[0.06] gap-2 sm:gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              className="btn-premium-outline cursor-pointer"
              onClick={() => setTemplateOpen(false)}
              disabled={templateImporting}
            >
              Close
            </Button>
            <Button
              type="button"
              variant="outline"
              className="btn-premium-outline cursor-pointer"
              onClick={handleDownloadTemplate}
              disabled={templateImporting}
            >
              <Download className="size-4 mr-1.5" />
              Download CSV
            </Button>
            <Button
              type="button"
              className="btn-premium-solid cursor-pointer"
              onClick={handleImportExamples}
              disabled={templateImporting}
            >
              <Upload className="size-4 mr-1.5" />
              {templateImporting ? "Importing…" : "Import examples"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PageHeader
        title={activeRole === "admin" ? "Members" : "Family roster"}
        description={
          activeRole === "admin"
            ? "Browse, filter, and manage every club member in one place."
            : "View and manage your family's club profiles."
        }
        actions={
          <div className="flex flex-wrap gap-2 w-full min-w-0 justify-start md:justify-end">
            <input type="file" ref={fileInputRef} onChange={handleBulkUpload} accept=".csv" className="hidden" />
            {activeRole === "admin" && (
              <>
                <Button
                  variant="outline"
                  className="btn-premium-outline h-[38px] px-3 hover:cursor-pointer shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4 mr-1.5 shrink-0" />
                  <span className="whitespace-nowrap">Bulk upload</span>
                </Button>
                <Button
                  variant="ghost"
                  className="text-xs text-[#8FA89F] hover:text-[#EEF2F0] h-[38px] px-3 border border-dashed border-[rgba(255,255,255,0.08)] rounded-lg hover:cursor-pointer shrink-0"
                  onClick={() => setTemplateOpen(true)}
                >
                  <Download className="size-4 mr-1.5 shrink-0" />
                  <span className="whitespace-nowrap">Template</span>
                </Button>
              </>
            )}
            {(activeRole === "admin" || activeRole === "member") && (
              <Button asChild className="btn-premium-solid h-[38px] px-4 hover:cursor-pointer shrink-0">
                <Link to="/members/add">
                  <Plus className="size-4 mr-1.5 shrink-0" />
                  <span className="whitespace-nowrap">Add member</span>
                </Link>
              </Button>
            )}
          </div>
        }
      />

      {/* Overview stats */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        <MemberStatCard label="Total" value={stats.total} hint="Registered members" icon={Users} index={0} />
        <MemberStatCard label="Adults" value={stats.adults} hint={`${stats.juniors} juniors`} icon={UserRound} index={1} />
        <MemberStatCard label="League" value={stats.league} hint="In a league group" icon={Trophy} index={2} />
        <MemberStatCard label="Active" value={stats.active} hint="Currently active" icon={Users} index={3} />
      </motion.div>

      {/* Quick filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold tracking-wider text-[#6B7F78] uppercase mr-1">Quick view</span>
        {quickFilters.map((qf) => (
          <button
            key={qf.id}
            type="button"
            onClick={qf.apply}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer border",
              isQuickActive(qf.id)
                ? "bg-[rgba(16,185,129,0.12)] text-[#34D399] border-[rgba(16,185,129,0.35)]"
                : "bg-transparent text-[#8A8A98] border-transparent hover:text-[#EEF2F0] hover:border-white/10",
            )}
          >
            {qf.label}
          </button>
        ))}
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by name, email, or BI ID..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={filterConfig}
        activeFilters={filters}
        onFilterChange={setFilter}
        onClearAll={clearFilters}
        sortOptions={sortOptions}
        currentSort={sortBy}
        onSortChange={setSortBy}
      />

      {/* Results toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 -mt-2">
        <div className="text-sm text-[#8FA89F]">
          Showing <span className="text-[#EEF2F0] font-semibold">{visibleRows.length}</span>
          {visibleRows.length !== baseMembers.length && (
            <> of <span className="text-[#EEF2F0] font-semibold">{baseMembers.length}</span></>
          )}{" "}
          members
          {nestFamilies && (
            <span className="text-[#6B7F78]"> · juniors nested under adults</span>
          )}
          {SHOW_MEMBER_BULK_UI && selectedIds.length > 0 && (
            <>
              {" · "}
              <span className="text-[#FBBF24] font-semibold">{selectedIds.length}</span> selected
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {SHOW_MEMBER_BULK_UI && activeRole === "admin" && processed.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer",
                    selectedIds.length > 0
                      ? "bg-[rgba(251,191,36,0.10)] border-[rgba(251,191,36,0.35)] text-[#FBBF24]"
                      : "bg-[rgba(16,185,129,0.08)] border-[rgba(16,185,129,0.25)] text-[#34D399] hover:bg-[rgba(16,185,129,0.14)]",
                  )}
                >
                  Bulk actions
                  {selectedIds.length > 0 && (
                    <span className="font-mono text-[10px] opacity-90">({selectedIds.length})</span>
                  )}
                  <ChevronDown className="size-3 opacity-80" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] min-w-[200px]"
              >
                <DropdownMenuItem
                  className="cursor-pointer text-xs focus:bg-white/5"
                  onClick={() => toggleSelectAllVisible(!allVisibleSelected)}
                >
                  {allVisibleSelected ? (
                    <CheckSquare className="size-3.5 mr-2" />
                  ) : (
                    <Square className="size-3.5 mr-2" />
                  )}
                  {allVisibleSelected ? "Clear selection" : "Select all visible"}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem
                  className="cursor-pointer text-xs focus:bg-white/5 text-[#F87171] focus:text-[#F87171]"
                  disabled={selectedIds.length === 0}
                  onClick={() =>
                    requestBulkDelete(
                      selectedIds,
                      `${selectedIds.length} selected member${selectedIds.length === 1 ? "" : "s"}`,
                    )
                  }
                >
                  <Trash2 className="size-3.5 mr-2" />
                  Delete selected
                  {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="cursor-pointer text-xs focus:bg-white/5 text-[#F87171] focus:text-[#F87171]"
                  onClick={() =>
                    requestBulkDelete(
                      processed.map((m) => m.id),
                      hasActiveFilters
                        ? `${processed.length} filtered member${processed.length === 1 ? "" : "s"}`
                        : `all ${processed.length} member${processed.length === 1 ? "" : "s"}`,
                    )
                  }
                >
                  <Trash2 className="size-3.5 mr-2" />
                  Delete all{hasActiveFilters ? " filtered" : ""}
                  {` (${processed.length})`}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="flex items-center gap-1 bg-[#131916] border border-[rgba(255,255,255,0.06)] p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              disabled={isMobile}
              className={cn(
                "p-1.5 rounded-md transition-all",
                viewMode === "list" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
                isMobile ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
              )}
              title={isMobile ? "Table view available on larger screens" : "Table view"}
            >
              <List className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-md transition-all cursor-pointer",
                viewMode === "grid" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
              )}
              title="Card view"
            >
              <LayoutGrid className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {visibleRows.length === 0 ? (
        <EmptyIllustration
          icon="users"
          title="No members found"
          description={
            hasActiveFilters
              ? "No members match your search or filters. Try a different keyword or clear filters."
              : "No members have been added yet. Add your first member to get started."
          }
          ctaLabel={hasActiveFilters ? "Clear filters" : activeRole !== "volunteer" ? "Add member" : undefined}
          onCta={hasActiveFilters ? clearFilters : undefined}
          ctaTo={!hasActiveFilters && activeRole !== "volunteer" ? "/members/add" : undefined}
        />
      ) : viewMode === "grid" ? (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {visibleRows.map(({ member: m, depth, childCount = 0 }) => {
            const isJunior = m.memberType.toLowerCase() === "junior";
            const avatarBg = isJunior ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#10B981]";
            const isExpanded = expandedFamilyIds.has(m.id);
            return (
              <motion.div
                key={m.id}
                variants={staggerItem}
                whileHover={{ y: -3 }}
                transition={{ duration: 0.18 }}
                className={cn(depth === 1 && "sm:col-span-2 xl:col-span-1 xl:ml-4")}
              >
                <Card
                  className={cn(
                    "bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] h-full signature-card-top",
                    selectedSet.has(m.id) && "border-[rgba(251,191,36,0.45)]",
                    depth === 1 && "border-l-2 border-l-[#F59E0B]/50 bg-[#131916]/90",
                  )}
                >
                  <CardContent className="p-5 flex flex-col gap-4 h-full">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {depth === 0 && childCount > 0 ? (
                          <button
                            type="button"
                            onClick={() => toggleFamilyExpand(m.id)}
                            className="size-7 shrink-0 rounded-md grid place-items-center text-[#8FA89F] hover:text-[#EEF2F0] hover:bg-white/[0.06] transition-colors"
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? `Hide ${childCount} junior${childCount === 1 ? "" : "s"}` : `Show ${childCount} junior${childCount === 1 ? "" : "s"}`}
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                        ) : (
                          <span className="size-7 shrink-0" aria-hidden />
                        )}
                        {SHOW_MEMBER_BULK_UI && activeRole === "admin" && (
                          <Checkbox
                            checked={selectedSet.has(m.id)}
                            onCheckedChange={(v) => toggleSelect(m.id, v === true)}
                            className="shrink-0 border-white/30 data-[state=checked]:bg-[#FBBF24] data-[state=checked]:border-[#FBBF24] data-[state=checked]:text-[#111]"
                            aria-label={`Select ${m.firstName} ${m.lastName}`}
                          />
                        )}
                        <Avatar className={cn("border border-white/10 shrink-0", depth === 1 ? "size-9" : "size-11")}>
                          <AvatarFallback className={cn(avatarBg, "font-semibold text-sm")}>
                            {m.firstName[0]}{m.lastName[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold text-[15px] text-[#EEF2F0] truncate">
                              {m.firstName} {m.lastName}
                            </h3>
                            {depth === 1 && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-[#F59E0B]/35 text-[#FBBF24]">
                                Sub-member
                              </Badge>
                            )}
                            {depth === 0 && childCount > 0 && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-white/15 text-[#8FA89F]">
                                {childCount} junior{childCount === 1 ? "" : "s"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-[12px] text-[#8FA89F] truncate flex items-center gap-1 mt-0.5">
                            <Mail className="size-3 shrink-0" /> {m.email}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={m.status} />
                    </div>

                    <MemberTags member={m} />

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg bg-[#0C0F0E]/60 border border-white/[0.04] px-3 py-2.5">
                        <p className="text-[#6B7F78] uppercase tracking-wider text-[10px] font-medium mb-1">Balance</p>
                        <p className={cn("font-mono font-semibold text-sm", m.credit < 0 ? "text-[#F87171]" : "text-[#34D399]")}>
                          {fmtMoney(m.credit)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#0C0F0E]/60 border border-white/[0.04] px-3 py-2.5">
                        <p className="text-[#6B7F78] uppercase tracking-wider text-[10px] font-medium mb-1">BI ID</p>
                        <p className="font-mono text-[#C4D4CF] truncate flex items-center gap-1">
                          <IdCard className="size-3 shrink-0 text-[#6B7F78]" />
                          {m.biMemberId || "—"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-auto pt-1">
                      <MemberActions member={m} activeRole={activeRole} onRequestDelete={requestDeleteMember} />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/70 border-b border-border">
                <TableRow className="border-b border-border hover:bg-transparent">
                  {SHOW_MEMBER_BULK_UI && activeRole === "admin" && (
                    <TableHead className="type-table-head h-11 px-4 w-10">
                      <Checkbox
                        checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                        onCheckedChange={(v) => toggleSelectAllVisible(v === true)}
                        className="border-white/30 data-[state=checked]:bg-[#FBBF24] data-[state=checked]:border-[#FBBF24] data-[state=checked]:text-[#111]"
                        aria-label="Select all visible members"
                      />
                    </TableHead>
                  )}
                  <TableHead className="type-table-head h-11 px-4 min-w-[200px]">Member</TableHead>
                  <TableHead className="type-table-head h-11">Type</TableHead>
                  <TableHead className="type-table-head h-11">Grade</TableHead>
                  <TableHead className="type-table-head h-11">Flags</TableHead>
                  <TableHead className="type-table-head h-11 text-right">Balance</TableHead>
                  <TableHead className="type-table-head h-11">Status</TableHead>
                  <TableHead className="type-table-head h-11 text-right px-4 min-w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map(({ member: m, depth, childCount = 0 }) => {
                  const isJunior = m.memberType.toLowerCase() === "junior";
                  const avatarBg = isJunior ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#10B981]";
                  const isExpanded = expandedFamilyIds.has(m.id);
                  return (
                    <TableRow
                      key={m.id}
                      className={cn(
                        "border-b border-border hover:bg-muted/40 transition-colors",
                        selectedSet.has(m.id) && "bg-[#FBBF24]/5",
                        depth === 1 && "bg-[rgba(245,158,11,0.03)]",
                      )}
                    >
                      {SHOW_MEMBER_BULK_UI && activeRole === "admin" && (
                        <TableCell className="px-4 py-3.5">
                          <Checkbox
                            checked={selectedSet.has(m.id)}
                            onCheckedChange={(v) => toggleSelect(m.id, v === true)}
                            className="border-white/30 data-[state=checked]:bg-[#FBBF24] data-[state=checked]:border-[#FBBF24] data-[state=checked]:text-[#111]"
                            aria-label={`Select ${m.firstName} ${m.lastName}`}
                          />
                        </TableCell>
                      )}
                      <TableCell className="px-4 py-3.5">
                        <div
                          className={cn(
                            "flex items-center gap-2.5 min-w-0",
                            depth === 1 && "pl-6 border-l-2 border-[#F59E0B]/40 ml-2",
                          )}
                        >
                          {depth === 0 && childCount > 0 ? (
                            <button
                              type="button"
                              onClick={() => toggleFamilyExpand(m.id)}
                              className="size-7 shrink-0 rounded-md grid place-items-center text-[#8FA89F] hover:text-[#EEF2F0] hover:bg-white/[0.06] transition-colors"
                              aria-expanded={isExpanded}
                              aria-label={isExpanded ? `Hide ${childCount} junior${childCount === 1 ? "" : "s"}` : `Show ${childCount} junior${childCount === 1 ? "" : "s"}`}
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </button>
                          ) : depth === 0 ? (
                            <span className="size-7 shrink-0" aria-hidden />
                          ) : null}
                          <Avatar className={cn("border border-white/10 shrink-0", depth === 1 ? "size-8" : "size-9")}>
                            <AvatarFallback className={cn(avatarBg, "font-semibold text-xs")}>
                              {m.firstName[0]}{m.lastName[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-[14px] text-[#EEF2F0] truncate">
                                {m.firstName} {m.lastName}
                              </p>
                              {depth === 1 && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-[#F59E0B]/35 text-[#FBBF24]">
                                  Sub-member
                                </Badge>
                              )}
                              {depth === 0 && childCount > 0 && (
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-white/15 text-[#8FA89F]">
                                  {childCount} junior{childCount === 1 ? "" : "s"}
                                </Badge>
                              )}
                            </div>
                            <p className="text-[11px] text-[#6B7F78] truncate">{m.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="type-table-body capitalize">{m.memberType}</TableCell>
                      <TableCell className="type-table-body">{m.grade || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[140px]">
                          {m.membership && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-[#2DD4BF]/30 text-[#5EEAD4]">M</Badge>
                          )}
                          {m.trainingEligible && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-white/15 text-[#8FA89F]">T</Badge>
                          )}
                          {!m.membership && !m.trainingEligible && (
                            <span className="text-[#6B7F78] text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className={cn("type-mono-value text-right", m.credit < 0 && "text-[#F87171]")}>
                        {fmtMoney(m.credit)}
                      </TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                      <TableCell className="text-right px-4">
                        <MemberActions member={m} activeRole={activeRole} onRequestDelete={requestDeleteMember} compact />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="px-4 py-2.5 border-t border-border text-[10px] text-muted-foreground bg-muted/30">
            Flags: <span className="text-[#5EEAD4]">M</span> = Membership · <span className="text-[#8FA89F]">T</span> = Training eligible
            {nestFamilies && (
              <> · Click <span className="text-[#EEF2F0]">›</span> to show juniors · <span className="text-[#FBBF24]">Sub-member</span> = junior under that adult</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
