import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { generateWeeklyDates } from "@/lib/rotation";
import { Plus, LayoutGrid, List, Search, X, Calendar, MapPin, Trash2 } from "lucide-react";
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

interface TrainingSessionItem {
  id: string;
  trainingId: string;
  sessionIndex: number;
  totalSessions: number;
  name: string;
  date: string;
  location: string;
  coach: string;
  slots: number;
  fees: number;
  status: "open" | "released" | "closed" | "created";
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

function TrainingsList() {
  const s = useStore();
  const releaseTraining = useStore((st) => st.releaseTraining);
  const user = useCurrentUser()!;
  const { viewMode, setViewMode, isMobile } = useResponsiveViewMode("clubapp-view-mode-trainings", "list");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteRequest, setDeleteRequest] = useState<ConfirmDeleteRequest | null>(null);
  const [actionRequest, setActionRequest] = useState<ConfirmActionRequest | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const visibleIds = filteredSessions.map((session) => session.id);
      setSelectedSessionIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    } else {
      const visibleSet = new Set(filteredSessions.map((session) => session.id));
      setSelectedSessionIds((prev) => prev.filter((id) => !visibleSet.has(id)));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedSessionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleBulkDeleteClick = () => {
    if (selectedSessionIds.length === 0) return;
    setActionRequest({
      title: "Delete selected training sessions?",
      description: "Are you sure you want to delete the selected training sessions?",
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        try {
          const selectedSessionsList = filteredSessions.filter((s) =>
            selectedSessionIds.includes(s.id)
          );
          const uniqueTrainingIds = Array.from(
             new Set(selectedSessionsList.map((s) => s.trainingId))
          );
          for (const id of uniqueTrainingIds) {
            await s.deleteTraining(id);
          }
          setSelectedSessionIds([]);
          toast.success("Selected training sessions deleted successfully");
        } catch (error: unknown) {
          toast.error(
            error instanceof Error ? error.message : "Failed to delete selected training sessions."
          );
          throw error;
        }
      },
    });
  };

  const requestDeleteTraining = (t: Training) => {
    const memberCount = new Set(
      (s.trainingInvites ?? []).filter((i) => i.trainingId === t.id).map((i) => i.memberId),
    ).size;
    const sessionCount = (s.trainingDates ?? []).filter((d) => d.trainingId === t.id).length;
    setDeleteRequest({
      title: "Delete training program",
      entityName: t.name,
      related: [
        { label: memberCount === 1 ? "member" : "members", count: memberCount },
        { label: sessionCount === 1 ? "session date" : "session dates", count: sessionCount },
      ],
      warning:
        memberCount > 0 || sessionCount > 0
          ? "Enrollments and training dates linked to this program will be deleted (cascade)."
          : undefined,
      onConfirm: async () => {
        try {
          await s.deleteTraining(t.id);
          toast.success("Training program deleted");
        } catch (error: unknown) {
          toast.error(error instanceof Error ? error.message : "Failed to delete training program.");
          throw error;
        }
      },
    });
  };
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const resetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setSortBy("newest");
  };

  const hasActiveFilters = searchTerm !== "" || statusFilter !== "all";

  // Expand training programs into individual training sessions
  const allSessions = useMemo(() => {
    const holidayDates = s.holidays ?? [];
    const items: TrainingSessionItem[] = [];

    for (const t of s.trainings) {
      const existingDates = Array.from(
        new Set((s.trainingDates ?? []).filter((d) => d.trainingId === t.id).map((d) => d.date))
      ).sort();

      const datesToUse =
        existingDates.length > 0
          ? existingDates
          : generateWeeklyDates(t.startDate, t.sessions, holidayDates);

      const hasTime = t.startDate.includes("T");
      const timePart = hasTime ? t.startDate.split("T")[1] : "";

      const acceptedCount = (s.trainingInvites ?? []).filter(
        (i) => i.trainingId === t.id && i.status === "accepted"
      ).length;

      const totalCount = Math.max(t.sessions, datesToUse.length);
      for (let i = 0; i < totalCount; i++) {
        const isoDate = datesToUse[i] || t.startDate;
        const fullDateIso =
          isoDate && !isoDate.includes("T") && timePart
            ? `${isoDate}T${timePart}`
            : isoDate;

        items.push({
          id: `${t.id}-s${i + 1}`,
          trainingId: t.id,
          sessionIndex: i + 1,
          totalSessions: totalCount,
          name: totalCount > 1 ? `${t.name} (Session ${i + 1} of ${totalCount})` : t.name,
          date: fullDateIso,
          location: t.location,
          coach: t.coach,
          slots: t.slots,
          fees: t.fees,
          status: t.status,
          acceptedCount,
          training: t,
        });
      }
    }

    return items;
  }, [s.trainings, s.trainingDates, s.trainingInvites, s.holidays]);

  const filteredSessions = useMemo(() => {
    let result = [...allSessions];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          item.coach.toLowerCase().includes(term) ||
          item.location.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((item) => item.status === statusFilter);
    }
    return result.sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      if (sortBy === "fees_high") {
        return b.fees - a.fees;
      }
      if (sortBy === "fees_low") {
        return a.fees - b.fees;
      }
      return 0;
    });
  }, [allSessions, searchTerm, statusFilter, sortBy]);

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
        description="Coach-led programs for junior members."
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
                  <SelectItem value="newest" className="text-xs">Newest Session Date</SelectItem>
                  <SelectItem value="oldest" className="text-xs">Oldest Session Date</SelectItem>
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
          description="Create a coach-led program for junior members to enroll in."
          ctaLabel={user.role === "admin" ? "New training" : undefined}
          ctaTo={user.role === "admin" ? "/trainings/new" : undefined}
        />
      ) : filteredSessions.length === 0 ? (
        <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916]">
          <CardContent className="p-10 text-center text-[#8A8A98]">
            <div className="flex flex-col items-center justify-center gap-3">
              <Plus className="size-12 text-[#4A4A5A] transform rotate-45" />
              <h3 className="text-[14px] font-normal text-[#8A8A98]">No matching training sessions found.</h3>
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
                    filteredSessions.length > 0 &&
                    filteredSessions.every((session) => selectedSessionIds.includes(session.id))
                      ? true
                      : filteredSessions.some((session) => selectedSessionIds.includes(session.id))
                      ? "indeterminate"
                      : false
                  }
                  onCheckedChange={(checked) => handleSelectAll(!!checked)}
                />
                <span>Select All</span>
              </label>
              <span className="type-helper text-xs text-[#8FA89F]">
                {selectedSessionIds.length > 0 ? (
                  <span className="text-[#2FD9A0] font-medium">
                    {selectedSessionIds.length} of {filteredSessions.length} selected
                  </span>
                ) : (
                  `${filteredSessions.length} training sessions found`
                )}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedSessionIds.length === 0}
                onClick={handleBulkDeleteClick}
                className="btn-premium-danger h-8 px-3 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="size-3.5" />
                <span>Delete Selected{selectedSessionIds.length > 0 ? ` (${selectedSessionIds.length})` : ""}</span>
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
              {filteredSessions.map((session) => {
                const accepted = session.acceptedCount;
                const maxPlayers = session.slots || 12;
                const pct = fillRate(accepted, maxPlayers);
                const t = session.training;
                const iso = sessionDateIso(session.date);
                const isHoliday = iso ? (s.holidays ?? []).includes(iso) : false;

                return (
                  <motion.div
                    key={session.id}
                    variants={staggerItem}
                    whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(16,185,129,0.08)" }}
                    transition={{ duration: 0.18 }}
                  >
                    <Card className={cn(
                      "bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-colors duration-200",
                      selectedSessionIds.includes(session.id) && "border-[#10B981]/50 bg-[#10B981]/[0.02]"
                    )}>
                      <CardContent className="p-4 px-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center pr-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedSessionIds.includes(session.id)}
                            onCheckedChange={() => handleToggleSelect(session.id)}
                            aria-label={`Select ${session.name}`}
                          />
                        </div>
                        <div className="flex-[2] space-y-1.5 min-w-[200px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="font-bold text-[16px] text-[#EEF2F0]">{session.name}</div>
                            {isHoliday && (
                              <span className="inline-flex items-center rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#FBBF24] uppercase">
                                Holiday
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 type-helper">
                            <Calendar className="size-3.5 text-[#5A7068]" />
                            <span className="text-[#C4D4CF] font-medium">{fmtDateTime(session.date)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[#8FA89F]">
                            <MapPin className="size-3.5 text-[#5A7068]" />
                            <span>{session.location}</span>
                          </div>
                        </div>

                        <div className="hidden md:block w-[1px] h-8 bg-[rgba(255,255,255,0.06)]" />

                        <div className="flex-1 space-y-1.5">
                          <span className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Coach</span>
                          <span className="text-[14px] font-bold text-[#EEF2F0]">{session.coach}</span>
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
                          <StatusBadge status={session.status} />
                          <div className="flex items-center gap-1.5 mt-1 md:mt-0 flex-wrap justify-end">
                            {user.role === "admin" && session.status === "open" && (
                              <Button
                                size="sm"
                                className="btn-premium-solid h-8 text-[11px] cursor-pointer"
                                onClick={async () => {
                                  try {
                                    const res = await releaseTraining(t.id);
                                    toast.success(res.message ?? "Training opened for family enrollment");
                                  } catch (error: any) {
                                    toast.error(error.message || "Failed to open training.");
                                  }
                                }}
                              >
                                Open enrollment
                              </Button>
                            )}
                            {user.role === "admin" && (
                              <>
                                <Button asChild size="sm" variant="outline" className="btn-premium-outline h-8 px-2.5 cursor-pointer text-xs">
                                  <Link to="/trainings/$id/edit" params={{ id: t.id }}>Edit</Link>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="btn-premium-danger h-8 px-2.5 cursor-pointer text-xs"
                                  onClick={() => requestDeleteTraining(t)}
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
              {filteredSessions.map((session) => {
                const accepted = session.acceptedCount;
                const maxPlayers = session.slots || 12;
                const pct = fillRate(accepted, maxPlayers);
                const t = session.training;
                const iso = sessionDateIso(session.date);
                const isHoliday = iso ? (s.holidays ?? []).includes(iso) : false;

                return (
                  <motion.div
                    key={session.id}
                    variants={staggerItem}
                    whileHover={{ y: -4, boxShadow: "0 14px 36px rgba(0,0,0,0.4), 0 0 0 1px rgba(16,185,129,0.10)" }}
                    transition={{ duration: 0.18 }}
                  >
                    <Card className={cn(
                      "bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-colors duration-200 h-full flex flex-col justify-between",
                      selectedSessionIds.includes(session.id) && "border-[#10B981]/50 bg-[#10B981]/[0.02]"
                    )}>
                      <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedSessionIds.includes(session.id)}
                                  onCheckedChange={() => handleToggleSelect(session.id)}
                                  aria-label={`Select ${session.name}`}
                                />
                              </div>
                              <div className="min-w-0 space-y-1.5 flex-1">
                                <div className="font-bold text-[15.5px] text-[#EEF2F0] truncate">{session.name}</div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="size-1.5 rounded-full bg-[#34D399]" />
                                  <span className="text-[12px] font-semibold text-[#8FA89F]">{session.coach}</span>
                                  {isHoliday && (
                                    <span className="inline-flex items-center rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#FBBF24] uppercase">
                                      Holiday
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <StatusBadge status={session.status} />
                          </div>

                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs text-[#C4D4CF]">
                              <Calendar className="size-3.5 text-[#5A7068]" />
                              <span className="font-medium">{fmtDateTime(session.date)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-[#8FA89F]">
                              <MapPin className="size-3.5 text-[#5A7068]" />
                              <span className="truncate">{session.location}</span>
                            </div>
                          </div>

                          <div className="h-[1px] bg-[rgba(255,255,255,0.06)] my-4" />

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <span className="text-[10px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Coach</span>
                              <span className="text-[14px] font-bold text-[#EEF2F0] truncate block">{session.coach}</span>
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
                          {user.role === "admin" && session.status === "open" && (
                            <Button
                              size="sm"
                              className="btn-premium-solid h-8 text-[11px] cursor-pointer"
                              onClick={async () => {
                                try {
                                  const res = await releaseTraining(t.id);
                                  toast.success(res.message ?? "Training opened for family enrollment");
                                } catch (error: any) {
                                  toast.error(error.message || "Failed to open training.");
                                }
                              }}
                            >
                              Open enrollment
                            </Button>
                          )}
                          <div className="flex items-center gap-1.5 ml-auto">
                            {user.role === "admin" && (
                              <>
                                <Button asChild size="sm" variant="outline" className="btn-premium-outline h-8 px-2.5 cursor-pointer text-xs">
                                  <Link to="/trainings/$id/edit" params={{ id: t.id }}>Edit</Link>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="btn-premium-danger h-8 px-2.5 cursor-pointer text-xs"
                                  onClick={() => requestDeleteTraining(t)}
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