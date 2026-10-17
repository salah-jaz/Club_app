import { useCan } from "@/lib/permissions";
import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { SearchFilterBar, useSearchFilters } from "@/components/SearchFilterBar";
import { fmtDateTime } from "@/lib/format";
import {
  Plus,
  Swords,
  Calendar,
  Eye,
  Pencil,
  Trash2,
  LayoutGrid,
  List,
  Users,
  Shield,
  Clock,
  CheckCircle2,
  Timer,
  Building,
} from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { useResponsiveViewMode } from "@/hooks/use-responsive-view-mode";
import type { Fixture } from "@/lib/types";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import {
  ReportDialog,
  ReportTriggerButton,
  runReportExport,
  useReportDialog,
} from "@/components/ReportDialog";
import {
  FIXTURE_REPORT_STATUS,
  exportFixturesReport,
  filterFixturesForReport,
} from "@/lib/module-reports";
import { ConfirmDeleteDialog, type ConfirmDeleteRequest } from "@/components/ConfirmDeleteDialog";

export const Route = createFileRoute("/_authenticated/fixtures")({ component: FixturesLayout });

function FixturesLayout() {
  const user = useCurrentUser()!;
  const activeRole = useStore((s) => s.activeRole) || user?.role;
  const leagueGroups = useStore((s) => s.leagueGroups);
  const matches = useMatches();
  const isIndex = matches[matches.length - 1].routeId === Route.id;

  // Member access rule: Hide & deny if member has 0 groups
  const isMember = activeRole === "member";
  if (isMember && leagueGroups.length === 0) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <div className="admin-module-fit min-w-0 w-full max-w-full">
      {isIndex ? <FixturesList /> : <Outlet />}
    </div>
  );
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diff);
  return startOfDay(start);
}

function endOfWeek(d: Date) {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return endOfDay(end);
}

function matchesDateFilter(dateStr: string, filter: string) {
  if (filter === "all") return true;
  const date = new Date(dateStr);
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (filter === "upcoming") return date >= todayStart;
  if (filter === "past") return date < todayStart;
  if (filter === "today") return date >= todayStart && date <= todayEnd;
  if (filter === "this-week") {
    return date >= startOfWeek(now) && date <= endOfWeek(now);
  }
  if (filter === "this-month") {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }
  return true;
}

const STAT_ACCENTS = [
  { border: "var(--primary)", iconBg: "var(--violet-dim)", iconColor: "var(--primary)" },
  { border: "#10B981", iconBg: "rgba(16,185,129,0.12)", iconColor: "#10B981" },
  { border: "#F59E0B", iconBg: "rgba(245,158,11,0.12)", iconColor: "#F59E0B" },
  { border: "#6B7280", iconBg: "rgba(107,114,128,0.12)", iconColor: "#9CA3AF" },
];

function FixtureStatCard({
  label,
  value,
  hint,
  icon: Icon,
  index,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: any;
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
              <p className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase">
                {label}
              </p>
              <p className="type-stat-value mt-1.5 text-2xl sm:text-3xl text-[#F1F0EE] font-bold">
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

function FixturesList() {
  const s = useStore();
  const user = useCurrentUser()!;
  const activeRole = useStore((st) => st.activeRole) || user?.role;
  const isAdmin = activeRole === "admin";
  const canDeleteFixture = isAdmin && useCan("fixtures.delete");

  const { viewMode, setViewMode, isMobile } = useResponsiveViewMode(
    "clubapp-view-mode-fixtures",
    "list",
  );
  const [deleteRequest, setDeleteRequest] = useState<ConfirmDeleteRequest | null>(null);
  const report = useReportDialog();

  const memberGroupIds = useMemo(
    () => new Set(s.leagueGroups.map((g) => g.id)),
    [s.leagueGroups],
  );

  // Scoped fixtures for the current user
  const accessibleFixtures = useMemo(() => {
    if (isAdmin) return s.fixtures;
    return s.fixtures.filter((f) => memberGroupIds.has(f.leagueGroupId));
  }, [isAdmin, s.fixtures, memberGroupIds]);

  const { search, filters, sortBy, setSearch, setFilter, clearFilters, setSortBy } =
    useSearchFilters(
      {
        status: "all",
        group: "all",
        matchType: "all",
        venueType: "all",
        date: "all",
      },
      "date-asc",
    );

  const groupOptions = useMemo(() => {
    const list = isAdmin ? s.leagueGroups : s.leagueGroups.filter((g) => memberGroupIds.has(g.id));
    return [
      { value: "all", label: "All groups" },
      ...list.map((g) => ({ value: g.id, label: g.name })),
    ];
  }, [isAdmin, s.leagueGroups, memberGroupIds]);

  const matchTypeOptions = useMemo(
    () => [
      { value: "all", label: "All match types" },
      ...s.matchTypes.map((t) => ({ value: t, label: t })),
    ],
    [s.matchTypes],
  );

  const venueTypeOptions = useMemo(
    () => [
      { value: "all", label: "All venue types" },
      ...s.venueTypes.map((v) => ({ value: v, label: v })),
    ],
    [s.venueTypes],
  );

  const sortOptions = [
    { value: "date-asc", label: "Next scheduled" },
    { value: "date-desc", label: "Latest first" },
    { value: "name-asc", label: "Name A–Z" },
    { value: "name-desc", label: "Name Z–A" },
    { value: "status-asc", label: "Status" },
  ];

  const processed = useMemo(() => {
    let list = accessibleFixtures.filter((f) => {
      const q = search.toLowerCase().trim();
      if (q) {
        const groupName =
          s.leagueGroups.find((g) => g.id === f.leagueGroupId)?.name || f.leagueGroupName || "";
        const haystack = `${f.name} ${f.oppositionClub} ${f.teamName} ${groupName} ${f.matchType} ${f.venueType}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (filters.status !== "all" && f.status !== filters.status) return false;
      if (filters.group !== "all" && f.leagueGroupId !== filters.group) return false;
      if (filters.matchType !== "all" && f.matchType !== filters.matchType) return false;
      if (filters.venueType !== "all" && f.venueType !== filters.venueType) return false;
      if (!matchesDateFilter(f.date, filters.date)) return false;

      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "status-asc":
          return a.status.localeCompare(b.status);
        case "date-asc":
        default:
          return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
    });

    return list;
  }, [accessibleFixtures, search, filters, sortBy, s.leagueGroups]);

  // Statistics calculation
  const totalFixtures = accessibleFixtures.length;
  const openedCount = accessibleFixtures.filter((f) => f.status === "Opened").length;
  const inProgressCount = accessibleFixtures.filter((f) => f.status === "In Progress").length;
  const closedCount = accessibleFixtures.filter((f) => f.status === "Closed").length;

  const requestDeleteFixture = (fixture: Fixture) => {
    if (!isAdmin) {
      toast.error("Members are not permitted to delete fixtures.");
      return;
    }
    setDeleteRequest({
      title: "Delete fixture",
      entityName: fixture.name,
      warning: "This fixture record will be permanently deleted.",
      onConfirm: async () => {
        try {
          await s.deleteFixture(fixture.id);
          toast.success("Fixture deleted successfully");
        } catch (error: unknown) {
          toast.error(error instanceof Error ? error.message : "Failed to delete fixture.");
          throw error;
        }
      },
    });
  };

  const reportPreviewCount = useMemo(
    () => filterFixturesForReport(accessibleFixtures, report.values).length,
    [accessibleFixtures, report.values],
  );

  const openFixturesReport = () => {
    report.openWith({
      status: filters.status !== "all" ? filters.status : "all",
      category: filters.group !== "all" ? filters.group : "all",
      type: filters.matchType !== "all" ? filters.matchType : "all",
      memberId: "all",
    });
  };

  const exportFixtures = (format: "csv" | "pdf") =>
    runReportExport({
      count: reportPreviewCount,
      format,
      setExporting: report.setExporting,
      setOpen: report.setOpen,
      exportFn: (fmt) =>
        exportFixturesReport(
          accessibleFixtures,
          s.leagueGroups,
          report.values,
          fmt,
          s.appName,
          groupOptions,
        ),
    });

  return (
    <div className="space-y-6">
      <ConfirmDeleteDialog
        request={deleteRequest}
        onOpenChange={(open) => !open && setDeleteRequest(null)}
      />

      <PageHeader
        title="Fixtures"
        description="Organise matches, track opposition clubs, and monitor match statuses."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ReportTriggerButton onClick={openFixturesReport} />
            <Button asChild className="btn-premium-solid h-[38px] px-4 hover:cursor-pointer">
              <Link to="/fixtures/new">
                <Plus className="size-4" /> New fixture
              </Link>
            </Button>
          </div>
        }
      />

      {/* Useful Statistics Cards */}
      <motion.div
        variants={staggerContainer}
        initial="initial"
        animate="animate"
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
      >
        <FixtureStatCard
          label="Total Fixtures"
          value={totalFixtures}
          hint="All scheduled matches"
          icon={Swords}
          index={0}
        />
        <FixtureStatCard
          label="Opened"
          value={openedCount}
          hint="Open for participation"
          icon={CheckCircle2}
          index={1}
        />
        <FixtureStatCard
          label="In Progress"
          value={inProgressCount}
          hint="Live or ongoing"
          icon={Timer}
          index={2}
        />
        <FixtureStatCard
          label="Closed"
          value={closedCount}
          hint="Completed or concluded"
          icon={Clock}
          index={3}
        />
      </motion.div>

      {/* Search & Filter Bar */}
      <SearchFilterBar
        searchPlaceholder="Search fixtures by name, opposition, team, or group..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            key: "status",
            label: "Status",
            options: [
              { value: "all", label: "All statuses" },
              { value: "Opened", label: "Opened" },
              { value: "In Progress", label: "In Progress" },
              { value: "Closed", label: "Closed" },
            ],
          },
          {
            key: "date",
            label: "When",
            options: [
              { value: "all", label: "Any time" },
              { value: "upcoming", label: "Upcoming" },
              { value: "past", label: "Past" },
              { value: "today", label: "Today" },
              { value: "this-week", label: "This week" },
              { value: "this-month", label: "This month" },
            ],
          },
          {
            key: "group",
            label: "Group",
            options: groupOptions,
          },
          {
            key: "matchType",
            label: "Match Type",
            options: matchTypeOptions,
          },
          {
            key: "venueType",
            label: "Venue Type",
            options: venueTypeOptions,
          },
        ]}
        activeFilters={filters}
        onFilterChange={setFilter}
        onClearAll={clearFilters}
        sortOptions={sortOptions}
        currentSort={sortBy}
        onSortChange={setSortBy}
      />

      <div className="flex items-center justify-between gap-2 text-sm text-[#8FA89F] -mt-2">
        <div>
          Showing <span className="text-[#EEF2F0] font-semibold">{processed.length}</span>
          {processed.length !== accessibleFixtures.length && (
            <> of {accessibleFixtures.length} fixtures</>
          )}
        </div>
        {!isMobile && (
          <div className="flex items-center gap-1 border border-[rgba(255,255,255,0.06)] rounded-lg p-0.5 bg-[#0C0F0E]">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 rounded-md hover:bg-white/5",
                viewMode === "list" && "bg-white/10 text-white",
              )}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <List className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "size-8 rounded-md hover:bg-white/5",
                viewMode === "grid" && "bg-white/10 text-white",
              )}
              onClick={() => setViewMode("grid")}
              title="Grid view"
            >
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {processed.length === 0 ? (
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] p-8">
          <EmptyIllustration
            icon="calendar"
            title="No fixtures found"
            description={
              accessibleFixtures.length === 0
                ? "There are currently no fixtures scheduled. Click 'New fixture' to create one."
                : "No fixtures match your current search and filter settings."
            }
            ctaLabel="New fixture"
            ctaTo="/fixtures/new"
          />
        </Card>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {processed.map((fixture) => {
            const group = s.leagueGroups.find((g) => g.id === fixture.leagueGroupId);
            const groupName = group?.name || fixture.leagueGroupName || "Unassigned Group";
            return (
              <Card
                key={fixture.id}
                className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.14)] transition-all flex flex-col justify-between"
              >
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-[15px] text-[#F1F0EE] truncate">
                        {fixture.name}
                      </h3>
                      <p className="text-[12px] text-[#8FA89F] mt-0.5 flex items-center gap-1.5">
                        <Calendar className="size-3.5 shrink-0 text-[#10B981]" />
                        {fmtDateTime(fixture.date)}
                      </p>
                    </div>
                    <StatusBadge status={fixture.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[12px] pt-1 border-t border-white/[0.04]">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-[#6B7F78] tracking-wider block">
                        Group
                      </span>
                      <span className="text-[#F1F0EE] truncate block font-medium">
                        {groupName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-[#6B7F78] tracking-wider block">
                        Match & Venue
                      </span>
                      <span className="text-[#F1F0EE] truncate block font-medium">
                        {fixture.matchType} · {fixture.venueType}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-[#6B7F78] tracking-wider block">
                        Team
                      </span>
                      <span className="text-[#F1F0EE] truncate block font-medium">
                        {fixture.teamName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-[#6B7F78] tracking-wider block">
                        Opposition
                      </span>
                      <span className="text-[#F1F0EE] truncate block font-medium">
                        {fixture.oppositionClub}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-[#8FA89F] font-mono">
                      Grade: {fixture.grade}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-[#8FA89F] hover:text-white hover:bg-white/5"
                      >
                        <Link to="/fixtures/$id" params={{ id: fixture.id }}>
                          <Eye className="size-3.5 mr-1" /> View
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2.5 text-[#8FA89F] hover:text-white hover:bg-white/5"
                      >
                        <Link to="/fixtures/$id/edit" params={{ id: fixture.id }}>
                          <Pencil className="size-3.5 mr-1" /> Edit
                        </Link>
                      </Button>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-[#EF4444] hover:bg-[#EF4444]/10"
                          onClick={() => requestDeleteFixture(fixture)}
                          title="Delete fixture"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {processed.map((fixture) => {
            const group = s.leagueGroups.find((g) => g.id === fixture.leagueGroupId);
            const groupName = group?.name || fixture.leagueGroupName || "Unassigned Group";
            return (
              <Card
                key={fixture.id}
                className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-all"
              >
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/fixtures/$id"
                        params={{ id: fixture.id }}
                        className="font-semibold text-[15px] text-[#F1F0EE] hover:text-[#10B981] transition-colors truncate"
                      >
                        {fixture.name}
                      </Link>
                      <StatusBadge status={fixture.status} />
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-[#8FA89F] font-mono">
                        {fixture.grade}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#8FA89F]">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="size-3.5 text-[#10B981]" />
                        {fmtDateTime(fixture.date)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Users className="size-3.5 text-[#38BDF8]" />
                        {groupName}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Shield className="size-3.5 text-[#F59E0B]" />
                        {fixture.teamName} vs {fixture.oppositionClub}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Building className="size-3.5 text-[#A78BFA]" />
                        {fixture.matchType} ({fixture.venueType})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-[#8FA89F] hover:text-white hover:bg-white/5"
                    >
                      <Link to="/fixtures/$id" params={{ id: fixture.id }}>
                        <Eye className="size-3.5 mr-1" /> View
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2.5 text-[#8FA89F] hover:text-white hover:bg-white/5"
                    >
                      <Link to="/fixtures/$id/edit" params={{ id: fixture.id }}>
                        <Pencil className="size-3.5 mr-1" /> Edit
                      </Link>
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-[#EF4444] hover:bg-[#EF4444]/10"
                        onClick={() => requestDeleteFixture(fixture)}
                        title="Delete fixture"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Report Export Dialog */}
      <ReportDialog
        open={report.open}
        onOpenChange={report.setOpen}
        values={report.values}
        onValuesChange={report.setValues}
        previewCount={reportPreviewCount}
        exporting={report.exporting}
        onExport={exportFixtures}
        config={{
          title: "Download Fixtures Report",
          description: "Export fixture matches, dates, groups, grades, and statuses.",
          entityLabel: "fixtures",
          showDateRange: true,
          showMember: false,
          statusOptions: FIXTURE_REPORT_STATUS,
          typeOptions: matchTypeOptions,
          typeLabel: "Match Type",
          categoryOptions: groupOptions,
          categoryLabel: "Group",
        }}
      />
    </div>
  );
}
