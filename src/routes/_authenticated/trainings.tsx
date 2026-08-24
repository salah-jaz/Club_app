import { useCan } from "@/lib/permissions";
import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { generateWeeklyDates, generateTrainingProgramDates } from "@/lib/rotation";
import { Plus, LayoutGrid, List, Calendar, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useState, useMemo, useCallback } from "react";
import { useResponsiveViewMode } from "@/hooks/use-responsive-view-mode";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { SearchFilterBar } from "@/components/SearchFilterBar";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ReportDialog,
  ReportTriggerButton,
  runReportExport,
  useReportDialog,
} from "@/components/ReportDialog";
import {
  TRAINING_REPORT_STATUS,
  TRAINING_REPORT_TYPE,
  exportTrainingsReport,
  filterTrainingsForReport,
} from "@/lib/module-reports";
import {
  ConfirmDeleteDialog,
  type ConfirmDeleteRequest,
} from "@/components/ConfirmDeleteDialog";
import {
  ConfirmActionDialog,
  type ConfirmActionRequest,
} from "@/components/ConfirmActionDialog";
import type { Training } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/trainings")({ component: TrainingsLayout });

function TrainingsLayout() {
  const user = useCurrentUser()!;
  const activeRole = useStore((s) => s.activeRole) || user.role;
  const matches = useMatches();
  const isIndex = matches[matches.length - 1].routeId === Route.id;
  if (activeRole !== "admin" && activeRole !== "volunteer") return <Navigate to="/dashboard" />;
  if (!isIndex) return <Outlet />;
  return <TrainingsList />;
}

interface MonthlyCardItem {
  id: string;
  parentId: string;
  monthIndex: number;
  monthTitle: string;
  name: string;
  startDate: string;
  weeklySessions: Training[];
  weeklyDatesFormatted: string[];
  location: string;
  coach: string;
  slots: number;
  fees: number;
  targetType: "adult" | "junior";
  status: "open" | "released" | "closed" | "created" | "cancelled";
  acceptedCount: number;
  training: Training;
}

function sessionDateIso(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fillRate(accepted: number, slots: number) {
  const max = slots || 12;
  return max > 0 ? Math.min((accepted / max) * 100, 100) : 0;
}

export function isTrainingCardDeletable(card: MonthlyCardItem): boolean {
  if (card.status === "cancelled") return true;
  return card.acceptedCount === 0;
}

function TrainingsList() {
  const s = useStore();
  const user = useCurrentUser()!;
  const canCreateTraining = useCan("trainings.create");
  const canDeleteTraining = useCan("trainings.delete");
  const { viewMode, setViewMode, isMobile } = useResponsiveViewMode("clubapp-view-mode-trainings", "list");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteRequest, setDeleteRequest] = useState<ConfirmDeleteRequest | null>(null);
  const [actionRequest, setActionRequest] = useState<ConfirmActionRequest | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const report = useReportDialog();

  // Group training sessions by series and month -> Monthly Cards
  const allMonthCards = useMemo(() => {
    const groups: Record<string, Training[]> = {};
    for (const t of s.trainings) {
      const pid = t.parentId || t.id;
      if (!groups[pid]) groups[pid] = [];
      groups[pid].push(t);
    }

    const cards: MonthlyCardItem[] = [];

    for (const pid of Object.keys(groups)) {
      const series = [...groups[pid]].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
      if (series.length === 0) continue;

      const first = series[0];
      const repeatWeeks = Math.max(1, Math.min(5, first.repeatWeeks || 3));
      const repeatMonths = Math.max(1, first.repeatMonths || 1);

      const monthGroups: Record<string, typeof series> = {};
      for (const session of series) {
        const d = new Date(session.startDate);
        if (Number.isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthGroups[key]) monthGroups[key] = [];
        monthGroups[key].push(session);
      }

      const monthKeys = Object.keys(monthGroups).sort();
      monthKeys.forEach((key, m) => {
        const monthSessions = monthGroups[key];
        if (monthSessions.length === 0) return;

        const primarySession = monthSessions[0];
        const monthDate = new Date(primarySession.startDate);
        const monthName = Number.isNaN(monthDate.getTime())
          ? `Month ${m + 1}`
          : monthDate.toLocaleString("en-US", { month: "long", year: "numeric" });
        const monthTitle = `Month ${m + 1} (${monthName})`;

        const sessionIds = new Set(monthSessions.map((ms) => ms.id));
        const acceptedMembers = new Set(
          (s.trainingInvites ?? [])
            .filter((i) => sessionIds.has(i.trainingId) && i.status === "accepted")
            .map((i) => i.memberId)
        );

        const datesFormatted = monthSessions.map((ms) => {
          const d = new Date(ms.startDate);
          return Number.isNaN(d.getTime())
            ? ms.startDate
            : d.toLocaleString("en-US", { month: "short", day: "numeric" });
        });

        cards.push({
          id: primarySession.id,
          parentId: pid,
          monthIndex: m + 1,
          monthTitle,
          name: primarySession.name,
          startDate: primarySession.startDate,
          weeklySessions: monthSessions,
          weeklyDatesFormatted: datesFormatted,
          location: primarySession.location,
          coach: primarySession.coach,
          slots: primarySession.slots,
          fees: primarySession.fees,
          targetType: primarySession.targetType || "junior",
          status: primarySession.status,
          acceptedCount: acceptedMembers.size,
          training: primarySession,
        });
      });
    }

    return cards;
  }, [s.trainings, s.trainingInvites]);

  const filteredCards = useMemo(() => {
    let result = [...allMonthCards];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (card) =>
          card.name.toLowerCase().includes(term) ||
          card.monthTitle.toLowerCase().includes(term) ||
          card.coach.toLowerCase().includes(term) ||
          card.location.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((card) => card.status === statusFilter);
    }
    return result.sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      }
      if (sortBy === "fees_high") {
        return b.fees - a.fees;
      }
      if (sortBy === "fees_low") {
        return a.fees - b.fees;
      }
      return 0;
    });
  }, [allMonthCards, searchTerm, statusFilter, sortBy]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const visibleIds = filteredCards
        .filter((card) => isTrainingCardDeletable(card))
        .map((card) => card.id);
      setSelectedCardIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    } else {
      const visibleSet = new Set(filteredCards.map((card) => card.id));
      setSelectedCardIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedCardIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDeleteClick = () => {
    if (selectedCardIds.length === 0) return;
    const deletableCards = filteredCards.filter(
      (c) => selectedCardIds.includes(c.id) && isTrainingCardDeletable(c)
    );
    if (deletableCards.length === 0) {
      toast.error("None of the selected training programs can be deleted. Cancel them first.");
      return;
    }
    setDeleteRequest({
      title: "Delete Monthly Training Program",
      entityName: `${deletableCards.length} monthly training program(s)`,
      description:
        "This will permanently delete this monthly training program and all its weekly sessions, invitations, attendance records, and related data. This action cannot be undone.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          const uniqueTrainingIds = Array.from(new Set(deletableCards.map((c) => c.id)));
          for (const id of uniqueTrainingIds) {
            await s.deleteTraining(id);
          }
          setSelectedCardIds([]);
          toast.success("Selected monthly training programs deleted successfully");
        } catch (error: unknown) {
          toast.error(
            error instanceof Error ? error.message : "Failed to delete selected monthly training programs."
          );
          throw error;
        }
      },
    });
  };

  const requestDeleteTraining = (card: MonthlyCardItem) => {
    if (!isTrainingCardDeletable(card)) {
      toast.error("Cannot delete training program with accepted invitations. Cancel the training first.");
      return;
    }
    setDeleteRequest({
      title: "Delete Monthly Training Program",
      entityName: card.name,
      description:
        "This will permanently delete this monthly training program and all its weekly sessions, invitations, attendance records, and related data. This action cannot be undone.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await s.deleteTraining(card.id);
          toast.success("Monthly training program deleted");
        } catch (error: unknown) {
          toast.error(
            error instanceof Error ? error.message : "Failed to delete monthly training program."
          );
          throw error;
        }
      },
    });
  };

  const resetFilters = useCallback(() => {
    setSearchTerm("");
    setStatusFilter("all");
    setSortBy("newest");
  }, []);

  const handleFilterChange = useCallback((key: string, value: string) => {
    if (key === "status") setStatusFilter(value);
  }, []);

  const trainingLocationOptions = useMemo(() => {
    const locs = [...new Set(s.trainings.map((t) => t.location).filter(Boolean))].sort();
    return [{ value: "all", label: "All locations" }, ...locs.map((loc) => ({ value: loc, label: loc }))];
  }, [s.trainings]);

  const trainingFilterConfig = useMemo(
    () => [
      {
        key: "status",
        label: "Status",
        options: [
          { value: "all", label: "All Statuses" },
          { value: "created", label: "Draft" },
          { value: "open", label: "Enrollment Open" },
          { value: "released", label: "Released" },
          { value: "closed", label: "Closed" },
        ],
      },
    ],
    [],
  );

  const trainingSortOptions = useMemo(
    () => [
      { value: "newest", label: "Newest Date" },
      { value: "oldest", label: "Oldest Date" },
      { value: "fees_high", label: "Fees (High-Low)" },
      { value: "fees_low", label: "Fees (Low-High)" },
    ],
    [],
  );

  const reportPreviewCount = useMemo(
    () => filterTrainingsForReport(s.trainings, s.trainingInvites ?? [], report.values).length,
    [s.trainings, s.trainingInvites, report.values],
  );

  const openTrainingsReport = () => {
    report.openWith({
      status: statusFilter !== "all" ? statusFilter : "all",
      type: "all",
      category: "all",
      memberId: "all",
    });
  };

  const exportTrainings = (format: "csv" | "pdf") =>
    runReportExport({
      count: reportPreviewCount,
      format,
      setExporting: report.setExporting,
      setOpen: report.setOpen,
      exportFn: (fmt) =>
        exportTrainingsReport(
          s.trainings,
          s.trainingInvites ?? [],
          s.members,
          report.values,
          fmt,
          s.appName,
          trainingLocationOptions,
        ),
    });

  return (
    <div>
      <ConfirmDeleteDialog
        request={deleteRequest}
        onOpenChange={(open) => !open && setDeleteRequest(null)}
      />
      <ConfirmActionDialog
        request={actionRequest}
        onOpenChange={(open) => !open && setActionRequest(null)}
      />
      <PageHeader
        title="Training programs"
        description="Coach-led monthly training programs."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ReportTriggerButton onClick={openTrainingsReport} />
            {user.role === "admin" && canCreateTraining && (
              <Button asChild>
                <Link to="/trainings/new"><Plus /> New training</Link>
              </Button>
            )}
          </div>
        }
      />

      {s.trainings.length > 0 && (
        <SearchFilterBar
          searchPlaceholder="Search program, coach, or location..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          filters={trainingFilterConfig}
          activeFilters={{ status: statusFilter }}
          onFilterChange={handleFilterChange}
          onClearAll={resetFilters}
          sortOptions={trainingSortOptions}
          currentSort={sortBy}
          onSortChange={setSortBy}
          actions={
            <div className="flex items-center gap-0.5 bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)] p-0.5 rounded-lg shrink-0 h-8">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "px-2 h-full rounded-md transition-all cursor-pointer flex items-center",
                  viewMode === "grid" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
                )}
                title="Grid view"
              >
                <LayoutGrid className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                disabled={isMobile}
                className={cn(
                  "px-2 h-full rounded-md transition-all flex items-center",
                  viewMode === "list" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
                  isMobile ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                )}
                title={isMobile ? "List view available on larger screens" : "List view"}
              >
                <List className="size-3.5" />
              </button>
            </div>
          }
        />
      )}

      {s.trainings.length === 0 ? (
        <EmptyIllustration
          icon="training"
          title="No training programs yet"
          description="Create a coach-led program to manage monthly sessions."
          ctaLabel={user.role === "admin" ? "New training" : undefined}
          ctaTo={user.role === "admin" ? "/trainings/new" : undefined}
        />
      ) : filteredCards.length === 0 ? (
        <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916]">
          <CardContent className="p-10 text-center text-[#8A8A98]">
            <div className="flex flex-col items-center justify-center gap-3">
              <Plus className="size-12 text-[#4A4A5A] transform rotate-45" />
              <h3 className="text-[14px] font-normal text-[#8A8A98]">No matching training cards found.</h3>
              <p className="text-[12px] font-light text-[#4A4A5A] max-w-[280px]">
                Try adjusting your search terms or status filters.
              </p>
              <Button
                variant="outline"
                onClick={resetFilters}
                className="border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] hover:bg-white/5 text-[#F1F0EE] h-9 text-xs rounded-lg mt-2 px-4 cursor-pointer"
              >
                Reset Filters
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 mt-6">
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-[#EEF2F0] hover:text-white transition-colors">
                <Checkbox
                  checked={
                    filteredCards.length > 0 &&
                    filteredCards.every((card) => selectedCardIds.includes(card.id))
                      ? true
                      : filteredCards.some((card) => selectedCardIds.includes(card.id))
                      ? "indeterminate"
                      : false
                  }
                  onCheckedChange={(checked) => handleSelectAll(!!checked)}
                />
                <span>Select All</span>
              </label>
              <span className="type-helper text-xs text-[#8FA89F]">
                {selectedCardIds.length > 0 ? (
                  <span className="text-[#2FD9A0] font-medium">
                    {selectedCardIds.length} of {filteredCards.length} selected
                  </span>
                ) : (
                  `${filteredCards.length} monthly training cards`
                )}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {canDeleteTraining && (
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedCardIds.length === 0}
                onClick={handleBulkDeleteClick}
                className="btn-premium-danger h-8 px-3 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="size-3.5" />
                <span>Delete Selected{selectedCardIds.length > 0 ? ` (${selectedCardIds.length})` : ""}</span>
              </Button>
              )}

              <div className="flex items-center gap-1 bg-[#131916] border border-[rgba(255,255,255,0.06)] p-0.5 rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={cn(
                    "p-1.5 rounded-md transition-all cursor-pointer",
                    viewMode === "grid" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
                  )}
                  title="Grid view"
                >
                  <LayoutGrid className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  disabled={isMobile}
                  className={cn(
                    "p-1.5 rounded-md transition-all",
                    viewMode === "list" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
                    isMobile ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                  )}
                  title={isMobile ? "List view available on larger screens" : "List view"}
                >
                  <List className="size-4" />
                </button>
              </div>
            </div>
          </div>

          {viewMode === "list" ? (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-4"
            >
              {filteredCards.map((card) => {
                const accepted = card.acceptedCount;
                const maxPlayers = card.slots || 12;
                const pct = fillRate(accepted, maxPlayers);
                const t = card.training;
                const isDeletable = isTrainingCardDeletable(card);

                return (
                  <motion.div
                    key={card.id}
                    variants={staggerItem}
                    whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(16,185,129,0.08)" }}
                    transition={{ duration: 0.18 }}
                  >
                    <Card className={cn(
                      "bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-colors duration-200",
                      selectedCardIds.includes(card.id) && "border-[#10B981]/50 bg-[#10B981]/[0.02]"
                    )}>
                      <CardContent className="p-4 px-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center pr-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedCardIds.includes(card.id)}
                            onCheckedChange={() => handleToggleSelect(card.id)}
                            disabled={!isDeletable}
                            aria-label={`Select ${card.name}`}
                            title={!isDeletable ? "Cannot select training program with accepted invitations for deletion" : undefined}
                          />
                        </div>
                        <div className="flex-[2] space-y-1.5 min-w-[200px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-bold text-[16px] text-[#EEF2F0]">{card.name}</div>
                            <span className="inline-flex items-center rounded-md border border-[#34D399]/30 bg-[#34D399]/10 px-2 py-0.5 text-[11px] font-semibold text-[#34D399]">
                              {card.monthTitle}
                            </span>
                            <span className="inline-flex items-center rounded-md border border-[#10B981]/30 bg-[#10B981]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#10B981] uppercase">
                              {card.targetType === "adult" ? "Adult" : "Junior"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 type-helper flex-wrap text-xs">
                            <Calendar className="size-3.5 text-[#5A7068]" />
                            <span className="text-[#C4D4CF] font-medium">
                              Contains: {card.weeklyDatesFormatted.join(" · ")}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[#8FA89F]">
                            <MapPin className="size-3.5 text-[#5A7068]" />
                            <span>{card.location}</span>
                          </div>
                        </div>

                        <div className="hidden md:block w-[1px] h-8 bg-[rgba(255,255,255,0.06)]" />

                        <div className="flex-1 space-y-1.5">
                          <span className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Coach</span>
                          <span className="text-[14px] font-bold text-[#EEF2F0]">{card.coach}</span>
                        </div>

                        <div className="hidden md:block w-[1px] h-8 bg-[rgba(255,255,255,0.06)]" />

                        <div className="flex-1 space-y-1.5">
                          <span className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Capacity / Players</span>
                          <span className="type-mono-value text-[20px] font-bold leading-none">
                            {accepted}/{maxPlayers}
                          </span>
                          <div className="w-full h-[3px] bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#10B981] rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        <div className="hidden md:block w-[1px] h-8 bg-[rgba(255,255,255,0.06)]" />

                        <div className="flex-1 flex flex-col md:items-end gap-2">
                          <StatusBadge status={card.status} />
                          <div className="flex items-center gap-1.5 mt-1 md:mt-0 flex-wrap justify-end">
                            {user.role === "admin" && (
                              <>
                                <Button asChild size="sm" variant="outline" className="btn-premium-outline h-8 px-2.5 cursor-pointer text-xs">
                                  <Link to="/trainings/$id/edit" params={{ id: t.id }}>Edit</Link>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="btn-premium-danger h-8 px-2.5 cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                                  disabled={!isDeletable}
                                  title={isDeletable ? "Delete" : "Cannot delete training program with accepted invitations (cancel training first)"}
                                  onClick={() => requestDeleteTraining(card)}
                                >
                                  Delete
                                </Button>
                              </>
                            )}
                            <Button asChild size="sm" variant="ghost" className="h-8 text-[#8A8A98] hover:text-[#F1F0EE] hover:bg-white/5 cursor-pointer text-xs">
                              <Link to="/trainings/$id" params={{ id: t.id }}>Manage</Link>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
            >
              {filteredCards.map((card) => {
                const accepted = card.acceptedCount;
                const maxPlayers = card.slots || 12;
                const pct = fillRate(accepted, maxPlayers);
                const t = card.training;
                const isDeletable = isTrainingCardDeletable(card);

                return (
                  <motion.div
                    key={card.id}
                    variants={staggerItem}
                    whileHover={{ y: -4, boxShadow: "0 14px 36px rgba(0,0,0,0.4), 0 0 0 1px rgba(16,185,129,0.10)" }}
                    transition={{ duration: 0.18 }}
                  >
                    <Card className={cn(
                      "bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-colors duration-200 h-full flex flex-col justify-between",
                      selectedCardIds.includes(card.id) && "border-[#10B981]/50 bg-[#10B981]/[0.02]"
                    )}>
                      <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedCardIds.includes(card.id)}
                                  onCheckedChange={() => handleToggleSelect(card.id)}
                                  disabled={!isDeletable}
                                  aria-label={`Select ${card.name}`}
                                  title={!isDeletable ? "Cannot select training program with accepted invitations for deletion" : undefined}
                                />
                              </div>
                              <div className="min-w-0 space-y-1.5 flex-1">
                                <div className="font-bold text-[15.5px] text-[#EEF2F0] truncate">{card.name}</div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="inline-flex items-center rounded-md border border-[#34D399]/30 bg-[#34D399]/10 px-2 py-0.5 text-[11px] font-semibold text-[#34D399]">
                                    {card.monthTitle}
                                  </span>
                                  <span className="inline-flex items-center rounded-md border border-[#10B981]/30 bg-[#10B981]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#10B981] uppercase">
                                    {card.targetType === "adult" ? "Adult" : "Junior"}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <StatusBadge status={card.status} />
                          </div>

                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs text-[#C4D4CF]">
                              <Calendar className="size-3.5 text-[#5A7068]" />
                              <span className="font-medium">
                                Contains: {card.weeklyDatesFormatted.join(" · ")}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-[#8FA89F]">
                              <MapPin className="size-3.5 text-[#5A7068]" />
                              <span className="truncate">{card.location}</span>
                            </div>
                          </div>

                          <div className="h-[1px] bg-[rgba(255,255,255,0.06)] my-4" />

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <span className="text-[10px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Coach</span>
                              <span className="text-[14px] font-bold text-[#EEF2F0] truncate block">{card.coach}</span>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Capacity / Players</span>
                              <span className="type-mono-value text-[16px] font-bold">{accepted}/{maxPlayers}</span>
                            </div>
                          </div>

                          <div className="mt-2.5 w-full h-[3px] bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#10B981] rounded-full transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-1.5 pt-2 w-full flex-wrap">
                          <div className="flex items-center gap-1.5 ml-auto">
                            {user.role === "admin" && (
                              <>
                                <Button asChild size="sm" variant="outline" className="btn-premium-outline h-8 px-2.5 cursor-pointer text-xs">
                                  <Link to="/trainings/$id/edit" params={{ id: t.id }}>Edit</Link>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="btn-premium-danger h-8 px-2.5 cursor-pointer text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                                  disabled={!isDeletable}
                                  title={isDeletable ? "Delete" : "Cannot delete training program with accepted invitations (cancel training first)"}
                                  onClick={() => requestDeleteTraining(card)}
                                >
                                  Delete
                                </Button>
                              </>
                            )}
                            <Button asChild size="sm" variant="ghost" className="h-8 text-[#8A8A98] hover:text-[#F1F0EE] hover:bg-white/5 cursor-pointer text-xs">
                              <Link to="/trainings/$id" params={{ id: t.id }}>Manage</Link>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </>
      )}

      <ReportDialog
        open={report.open}
        onOpenChange={report.setOpen}
        values={report.values}
        onValuesChange={report.setValues}
        previewCount={reportPreviewCount}
        exporting={report.exporting}
        onExport={exportTrainings}
        config={{
          entityLabel: "training sessions",
          showDateRange: true,
          showMember: true,
          members: s.members,
          statusOptions: TRAINING_REPORT_STATUS,
          typeOptions: TRAINING_REPORT_TYPE,
          categoryOptions: trainingLocationOptions,
          typeLabel: "Audience",
          categoryLabel: "Location",
        }}
      />
    </div>
  );
}