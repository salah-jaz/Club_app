import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDateTime, fmtMoney, parseScheduleDateTime } from "@/lib/format";
import { generateWeeklyDates, generateTrainingProgramDates } from "@/lib/rotation";
import { Plus, LayoutGrid, List, Search, X, Calendar, MapPin, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { useResponsiveViewMode } from "@/hooks/use-responsive-view-mode";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  const { viewMode, setViewMode, isMobile } = useResponsiveViewMode("clubapp-view-mode-trainings", "list");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteRequest, setDeleteRequest] = useState<ConfirmDeleteRequest | null>(null);
  const [actionRequest, setActionRequest] = useState<ConfirmActionRequest | null>(null);
  const [viewingCard, setViewingCard] = useState<MonthlyCardItem | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

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

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setSortBy("newest");
  };

  const hasActiveFilters = searchTerm !== "" || statusFilter !== "all";

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

      {/* View Training Session Details Dialog */}
      <Dialog open={!!viewingCard} onOpenChange={(open) => !open && setViewingCard(null)}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2 pr-6">
              <DialogTitle className="text-[#F1F0EE] text-lg font-bold">
                Training Program Details
              </DialogTitle>
              {viewingCard && <StatusBadge status={viewingCard.status} />}
            </div>
            <DialogDescription className="text-[#8A8A98] text-xs">
              Read-only program parameters and session specifications.
            </DialogDescription>
          </DialogHeader>

          {viewingCard && (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/80 p-4 space-y-4">
                <div className="text-[11px] font-semibold tracking-[0.12em] text-[#34D399] uppercase border-b border-white/[0.04] pb-2">
                  Program Parameters (Non-Editable)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Start Date & Time */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Start Date &amp; Time</Label>
                    <Input
                      readOnly
                      disabled
                      value={viewingCard.startDate ? viewingCard.startDate.replace("T", " ") : ""}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg font-mono opacity-100 select-text cursor-default"
                    />
                    {(() => {
                      const parsed = parseScheduleDateTime(viewingCard.startDate);
                      if (!parsed) return null;
                      return (
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#131916] px-2.5 py-1.5">
                            <p className="text-[9px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Day</p>
                            <p className="text-[12px] font-semibold text-[#F1F0EE]">{parsed.day}</p>
                          </div>
                          <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#131916] px-2.5 py-1.5">
                            <p className="text-[9px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Date</p>
                            <p className="text-[12px] font-semibold text-[#F1F0EE]">{parsed.date}</p>
                          </div>
                          <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#131916] px-2.5 py-1.5">
                            <p className="text-[9px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Time</p>
                            <p className="text-[12px] font-semibold text-[#F1F0EE]">{parsed.time}</p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Program Name */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Program Name</Label>
                    <Input
                      readOnly
                      disabled
                      value={viewingCard.name}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg font-medium opacity-100 select-text cursor-default"
                    />
                  </div>

                  {/* Repeat for Weeks */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Repeat for Weeks</Label>
                    <Input
                      readOnly
                      disabled
                      value={`${viewingCard.training.repeatWeeks ?? 3} week(s) per month`}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg font-mono opacity-100 cursor-default"
                    />
                  </div>

                  {/* Repeat for Months */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Repeat for Months</Label>
                    <Input
                      readOnly
                      disabled
                      value={`${viewingCard.training.repeatMonths ?? 1} month(s)`}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg font-mono opacity-100 cursor-default"
                    />
                  </div>

                  {/* Maximum Slots */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Maximum Slots (Capacity)</Label>
                    <Input
                      readOnly
                      disabled
                      value={`${viewingCard.slots} players (${viewingCard.acceptedCount} enrolled)`}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg font-mono opacity-100 cursor-default"
                    />
                  </div>

                  {/* Session Duration */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Session Duration</Label>
                    <Input
                      readOnly
                      disabled
                      value={viewingCard.training.duration || "1 hour"}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg opacity-100 cursor-default"
                    />
                  </div>

                  {/* Training Fees */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Training Fees</Label>
                    <Input
                      readOnly
                      disabled
                      value={`$${viewingCard.fees.toFixed(2)} ($${(viewingCard.fees / (viewingCard.training.repeatWeeks || 3)).toFixed(2)}/session)`}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg font-mono opacity-100 cursor-default"
                    />
                  </div>

                  {/* Training For */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Training For</Label>
                    <Input
                      readOnly
                      disabled
                      value={viewingCard.targetType === "adult" ? "Adult" : "Junior"}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg opacity-100 cursor-default capitalize font-semibold"
                    />
                  </div>

                  {/* Coach Name */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Coach Name</Label>
                    <Input
                      readOnly
                      disabled
                      value={viewingCard.coach}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg opacity-100 cursor-default"
                    />
                  </div>

                  {/* Location */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Location</Label>
                    <Input
                      readOnly
                      disabled
                      value={viewingCard.location}
                      className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg opacity-100 cursor-default"
                    />
                  </div>
                </div>

                {/* Weekly Sessions List */}
                <div className="pt-2 space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Weekly Sessions in {viewingCard.monthTitle}</Label>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {viewingCard.weeklySessions.map((ms) => {
                      const d = new Date(ms.startDate);
                      const formatted = Number.isNaN(d.getTime())
                        ? ms.startDate
                        : d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                      return (
                        <span key={ms.id} className="inline-flex items-center gap-1 text-[11px] font-medium bg-[#10B981]/10 text-[#34D399] px-2 py-1 rounded-md border border-[#10B981]/20">
                          <Calendar className="size-3" /> {formatted}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewingCard(null)}
              className="btn-premium-outline h-9 px-4 text-xs cursor-pointer"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PageHeader
        title="Training programs"
        description="Coach-led monthly training programs."
        actions={user.role === "admin" && <Button asChild><Link to="/trainings/new"><Plus /> New training</Link></Button>}
      />

      {s.trainings.length > 0 && (
        <>
          {/* Filter Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-[#131916] border border-[rgba(255,255,255,0.06)] p-3.5 rounded-xl mt-6">
            <div className="flex items-center gap-3 flex-1 flex-wrap w-full">
              {/* Search */}
              <div className="relative w-full sm:max-w-[320px] sm:flex-1 min-w-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#8A8A98]" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search program, coach, or location..."
                  className="pl-9 pr-9 bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 rounded-lg text-xs focus-visible:ring-1 focus-visible:ring-[#10B981]"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-white cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {/* Status Dropdown */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className={cn(
                  "bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 w-full sm:w-[150px] rounded-lg cursor-pointer text-xs",
                  statusFilter !== "all" && "border-[#10B981] bg-[#10B981]/5 text-[#10B981]"
                )}>
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
                  <SelectItem value="created" className="text-xs">Draft</SelectItem>
                  <SelectItem value="open" className="text-xs">Enrollment Open</SelectItem>
                  <SelectItem value="released" className="text-xs">Released</SelectItem>
                  <SelectItem value="closed" className="text-xs">Closed</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort By */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 w-full sm:w-[180px] rounded-lg cursor-pointer text-xs">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="newest" className="text-xs">Newest Date</SelectItem>
                  <SelectItem value="oldest" className="text-xs">Oldest Date</SelectItem>
                  <SelectItem value="fees_high" className="text-xs">Fees (High-Low)</SelectItem>
                  <SelectItem value="fees_low" className="text-xs">Fees (Low-High)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)] p-0.5 rounded-lg shrink-0 h-10">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "px-2.5 h-full rounded-md transition-all cursor-pointer flex items-center",
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
                  "px-2.5 h-full rounded-md transition-all flex items-center",
                  viewMode === "list" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
                  isMobile ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                )}
                title={isMobile ? "List view available on larger screens" : "List view"}
              >
                <List className="size-4" />
              </button>
            </div>
          </div>

          {/* Active Chips Row */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-2 mb-6 bg-[#131916] p-3 border border-[rgba(255,255,255,0.06)] rounded-xl">
              <span className="text-[11px] font-medium text-[#8A8A98]">Active Filters:</span>
              {searchTerm && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-[#10B981]/15 text-[#10B981] rounded-full border border-[#10B981]/20">
                  <span>Search: {searchTerm}</span>
                  <button onClick={() => setSearchTerm("")} className="hover:text-white transition-colors cursor-pointer">
                    <X className="size-3 text-[#10B981]" />
                  </button>
                </span>
              )}
              {statusFilter !== "all" && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-[#10B981]/15 text-[#10B981] rounded-full border border-[#10B981]/20">
                  <span>Status: {statusFilter === "created" ? "Draft" : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}</span>
                  <button onClick={() => setStatusFilter("all")} className="hover:text-white transition-colors cursor-pointer">
                    <X className="size-3 text-[#10B981]" />
                  </button>
                </span>
              )}
              <button
                onClick={resetFilters}
                className="text-[11px] font-medium text-[#8A8A98] hover:text-[#EEF2F0] underline underline-offset-4 ml-1 cursor-pointer transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </>
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
                            <Button
                              size="sm"
                              variant="outline"
                              className="btn-premium-outline h-8 px-2.5 text-xs cursor-pointer flex items-center gap-1"
                              onClick={() => setViewingCard(card)}
                            >
                              <Eye className="size-3.5" />
                              <span>View</span>
                            </Button>
                            {user.role === "admin" && (
                              <>
                                <Button
                                  disabled
                                  size="sm"
                                  variant="outline"
                                  className="btn-premium-outline h-8 px-2.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                                  title="Training session cannot be edited once created"
                                >
                                  Edit
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
                            <Button
                              size="sm"
                              variant="outline"
                              className="btn-premium-outline h-8 px-2.5 text-xs cursor-pointer flex items-center gap-1"
                              onClick={() => setViewingCard(card)}
                            >
                              <Eye className="size-3.5" />
                              <span>View</span>
                            </Button>
                            {user.role === "admin" && (
                              <>
                                <Button
                                  disabled
                                  size="sm"
                                  variant="outline"
                                  className="btn-premium-outline h-8 px-2.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none"
                                  title="Training session cannot be edited once created"
                                >
                                  Edit
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
    </div>
  );
}