import { createFileRoute, Link, Outlet, useRouterState, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useSearchFilters } from "@/components/SearchFilterBar";
import { ScheduleFilters } from "@/components/ScheduleFilters";
import { fmtDateTime } from "@/lib/format";
import { Plus, MapPin, Calendar, Eye, Pencil, Trash2, Send, Shuffle, LayoutGrid, List } from "lucide-react";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import type { PlaySchedule } from "@/lib/types";
import { motion } from "framer-motion";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";

export const Route = createFileRoute("/_authenticated/schedules")({ component: SchedulesLayout });

function SchedulesLayout() {
  const user = useCurrentUser()!;
  const activeRole = useStore((s) => s.activeRole) || user.role;
  const matches = useMatches();
  const isIndex = matches[matches.length - 1].routeId === Route.id;
  if (activeRole !== "admin") return <Navigate to="/dashboard" />;
  if (!isIndex) return <Outlet />;
  return <SchedulesList />;
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

function getFillRate(schedule: PlaySchedule, accepted: number) {
  const max = schedule.players || 12;
  return max > 0 ? (accepted / max) * 100 : 0;
}

function SchedulesList() {
  const s = useStore();
  const locations = useStore((st) => st.locations);
  const [viewMode, setViewMode] = useState<"grid" | "list">(
    () => (localStorage.getItem("clubapp-view-mode-schedules") as "grid" | "list") || "list"
  );

  const {
    search,
    filters,
    sortBy,
    setSearch,
    setFilter,
    clearFilters,
    setSortBy,
  } = useSearchFilters(
    {
      status: "all",
      location: "all",
      date: "all",
      courts: "all",
      capacity: "all",
    },
    "date-desc",
  );

  const locationList = useMemo(() => {
    const fromSchedules = s.schedules.map((sch) => sch.location).filter(Boolean);
    return [...new Set([...locations, ...fromSchedules])].sort();
  }, [locations, s.schedules]);

  const sortOptions = [
    { value: "date-desc", label: "Newest first" },
    { value: "date-asc", label: "Oldest first" },
    { value: "name-asc", label: "Name A–Z" },
    { value: "name-desc", label: "Name Z–A" },
    { value: "courts-desc", label: "Most courts" },
    { value: "courts-asc", label: "Fewest courts" },
    { value: "fill-desc", label: "Fullest" },
    { value: "fill-asc", label: "Emptiest" },
  ];

  const inviteStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const sch of s.schedules) {
      const accepted = s.playInvites.filter(
        (i) => i.scheduleId === sch.id && i.status === "accepted",
      ).length;
      map.set(sch.id, accepted);
    }
    return map;
  }, [s.schedules, s.playInvites]);

  let processed = s.schedules.filter((sch) => {
    const q = search.toLowerCase().trim();
    if (q) {
      const haystack = `${sch.name} ${sch.location}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    if (filters.status !== "all" && sch.status !== filters.status) return false;
    if (filters.location !== "all" && sch.location !== filters.location) return false;
    if (!matchesDateFilter(sch.date, filters.date)) return false;

    if (filters.courts !== "all") {
      if (filters.courts === "4+") {
        if (sch.courts < 4) return false;
      } else if (sch.courts !== Number(filters.courts)) {
        return false;
      }
    }

    const accepted = inviteStats.get(sch.id) ?? 0;
    const fill = getFillRate(sch, accepted);
    if (filters.capacity === "full" && fill < 100) return false;
    if (filters.capacity === "has-space" && fill >= 100) return false;
    if (filters.capacity === "low" && fill >= 50) return false;
    if (filters.capacity === "empty" && accepted > 0) return false;

    return true;
  });

  processed = [...processed].sort((a, b) => {
    const fillA = getFillRate(a, inviteStats.get(a.id) ?? 0);
    const fillB = getFillRate(b, inviteStats.get(b.id) ?? 0);

    switch (sortBy) {
      case "date-asc":
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "courts-desc":
        return b.courts - a.courts;
      case "courts-asc":
        return a.courts - b.courts;
      case "fill-desc":
        return fillB - fillA;
      case "fill-asc":
        return fillA - fillB;
      case "date-desc":
      default:
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Play schedules"
        description="Create sessions, release invitations and generate rotations."
        actions={
          <Button asChild className="btn-premium-solid h-[38px] px-4 hover:cursor-pointer">
            <Link to="/schedules/new"><Plus className="size-4" /> New schedule</Link>
          </Button>
        }
      />

      {s.schedules.length > 0 && (
        <ScheduleFilters
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFilterChange={setFilter}
          onClearAll={clearFilters}
          sortBy={sortBy}
          onSortChange={setSortBy}
          sortOptions={sortOptions}
          locations={locationList}
          totalCount={s.schedules.length}
          filteredCount={processed.length}
        />
      )}

      {s.schedules.length === 0 ? (
        <EmptyIllustration
          icon="calendar"
          title="No schedules yet"
          description="Create your first play session to invite members and track participation."
          ctaLabel="Create a schedule"
          ctaTo="/schedules/new"
        />
      ) : processed.length === 0 ? (
        <EmptyIllustration
          icon="calendar"
          title="No schedules match your filters"
          description="Try adjusting your search, date range, or filter criteria to find sessions."
          ctaLabel="Clear all filters"
          onCta={clearFilters}
        />
      ) : (
        <>
          <div className="flex items-center justify-between mb-4 mt-6">
            <span className="type-helper text-xs">{processed.length} schedules found</span>
            <div className="flex items-center gap-1 bg-[#131916] border border-[rgba(255,255,255,0.06)] p-0.5 rounded-lg">
              <button
                onClick={() => {
                  setViewMode("grid");
                  localStorage.setItem("clubapp-view-mode-schedules", "grid");
                }}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  viewMode === "grid" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]"
                }`}
                title="Grid view"
              >
                <LayoutGrid className="size-4" />
              </button>
              <button
                onClick={() => {
                  setViewMode("list");
                  localStorage.setItem("clubapp-view-mode-schedules", "list");
                }}
                className={`p-1.5 rounded-md transition-all cursor-pointer ${
                  viewMode === "list" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]"
                }`}
                title="List view"
              >
                <List className="size-4" />
              </button>
            </div>
          </div>

          {viewMode === "list" ? (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="flex flex-col gap-4"
            >
              {processed.map((sch) => {
                const accepted = inviteStats.get(sch.id) ?? 0;
                const maxPlayers = sch.players || 12;
                const pct = Math.min(getFillRate(sch, accepted), 100);

                return (
                  <motion.div
                    key={sch.id}
                    variants={staggerItem}
                    whileHover={{ y: -2, boxShadow: "0 8px 24px rgba(0,0,0,0.3), 0 0 0 1px rgba(16,185,129,0.08)" }}
                    transition={{ duration: 0.18 }}
                  >
                    <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-colors duration-200">
                      <CardContent className="p-4 px-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-[2] space-y-1.5 min-w-[200px]">
                          <div className="font-bold text-[16px] text-[#EEF2F0]">{sch.name}</div>
                          <div className="flex items-center gap-1.5 type-helper">
                            <Calendar className="size-3.5 text-[#5A7068]" />
                            <span className="text-[#C4D4CF] font-medium">{fmtDateTime(sch.date)}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-[#8FA89F]">
                            <MapPin className="size-3.5 text-[#5A7068]" />
                            <span>{sch.location}</span>
                          </div>
                        </div>

                        <div className="hidden md:block w-[1px] h-8 bg-[rgba(255,255,255,0.06)]" />

                        <div className="flex-1 space-y-1.5">
                          <span className="text-[11px] font-semibold tracking-wider text-[var(--text-secondary,#8FA89F)] uppercase block">Courts</span>
                          <span className="type-mono-value text-[20px] font-bold leading-none">{sch.courts}</span>
                        </div>

                        <div className="hidden md:block w-[1px] h-8 bg-[rgba(255,255,255,0.06)]" />

                        <div className="flex-1 space-y-1.5">
                          <span className="text-[11px] font-semibold tracking-wider text-[var(--text-secondary,#8FA89F)] uppercase block">Players</span>
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
                          <StatusBadge status={sch.status} />
                          <div className="flex items-center gap-1.5 mt-1 md:mt-0">
                            <Button asChild size="icon" variant="outline" className="btn-premium-outline h-11 w-11 md:h-8 md:w-8 p-0 cursor-pointer" title={sch.status === "rotated" || sch.status === "closed" ? "View Results" : "Manage"}>
                              <Link to="/schedules/$id" params={{ id: sch.id }}>
                                <Eye className="size-4" />
                              </Link>
                            </Button>
                            <Button asChild size="icon" variant="outline" className="btn-premium-outline h-11 w-11 md:h-8 md:w-8 p-0 cursor-pointer" title="Edit Schedule">
                              <Link to="/schedules/$id/edit" params={{ id: sch.id }}>
                                <Pencil className="size-4" />
                              </Link>
                            </Button>
                            <Button
                              size="icon"
                              variant="destructive"
                              className="btn-premium-danger h-11 w-11 md:h-8 md:w-8 p-0 cursor-pointer"
                              title="Delete Schedule"
                              onClick={async () => {
                                if (confirm("Are you sure you want to delete this schedule?")) {
                                  try {
                                    await s.deleteSchedule(sch.id);
                                    toast.success("Play schedule deleted");
                                  } catch (error: unknown) {
                                    toast.error(error instanceof Error ? error.message : "Failed to delete schedule.");
                                  }
                                }
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                            {sch.status === "open" && (
                              <Button
                                size="icon"
                                className="btn-premium-solid h-11 w-11 md:h-8 md:w-8 p-0 cursor-pointer"
                                title="Release Session"
                                onClick={async () => {
                                  try {
                                    await s.releaseSchedule(sch.id);
                                    toast.success("Session released — invitations sent");
                                  } catch (error: unknown) {
                                    toast.error(error instanceof Error ? error.message : "Failed to release schedule.");
                                  }
                                }}
                              >
                                <Send className="size-4" />
                              </Button>
                            )}
                            {sch.status === "released" && (
                              <Button
                                size="icon"
                                className="btn-premium-solid h-11 w-11 md:h-8 md:w-8 p-0 cursor-pointer"
                                title="Generate Rotation"
                                onClick={async () => {
                                  try {
                                    await s.generateRotation(sch.id);
                                    toast.success("Rotation generated successfully");
                                  } catch (error: unknown) {
                                    toast.error(error instanceof Error ? error.message : "Failed to generate rotation.");
                                  }
                                }}
                              >
                                <Shuffle className="size-4" />
                              </Button>
                            )}
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
              {processed.map((sch) => {
                const accepted = inviteStats.get(sch.id) ?? 0;
                const maxPlayers = sch.players || 12;
                const pct = Math.min(getFillRate(sch, accepted), 100);

                return (
                  <motion.div
                    key={sch.id}
                    variants={staggerItem}
                    whileHover={{ y: -4, boxShadow: "0 14px 36px rgba(0,0,0,0.4), 0 0 0 1px rgba(16,185,129,0.10)" }}
                    transition={{ duration: 0.18 }}
                  >
                    <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-colors duration-200 h-full flex flex-col justify-between">
                      <CardContent className="p-5 flex flex-col justify-between h-full space-y-4">
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <div className="font-bold text-[15.5px] text-[#EEF2F0] truncate">{sch.name}</div>
                            <StatusBadge status={sch.status} />
                          </div>
                          
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center gap-1.5 text-xs text-[#C4D4CF]">
                              <Calendar className="size-3.5 text-[#5A7068]" />
                              <span className="font-medium">{fmtDateTime(sch.date)}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-[#8FA89F]">
                              <MapPin className="size-3.5 text-[#5A7068]" />
                              <span className="truncate">{sch.location}</span>
                            </div>
                          </div>

                          <div className="h-[1px] bg-[rgba(255,255,255,0.06)] my-4" />

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <span className="text-[10px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Courts</span>
                              <span className="type-mono-value text-[16px] font-bold">{sch.courts}</span>
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Players</span>
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

                        <div className="flex items-center gap-1.5 pt-2 w-full">
                          <Button asChild size="icon" variant="outline" className="btn-premium-outline h-8 w-8 p-0 cursor-pointer" title={sch.status === "rotated" || sch.status === "closed" ? "View Results" : "Manage"}>
                            <Link to="/schedules/$id" params={{ id: sch.id }}>
                              <Eye className="size-4" />
                            </Link>
                          </Button>
                          <Button asChild size="icon" variant="outline" className="btn-premium-outline h-8 w-8 p-0 cursor-pointer" title="Edit Schedule">
                            <Link to="/schedules/$id/edit" params={{ id: sch.id }}>
                              <Pencil className="size-4" />
                            </Link>
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="btn-premium-danger h-8 w-8 p-0 cursor-pointer"
                            title="Delete Schedule"
                            onClick={async () => {
                              if (confirm("Are you sure you want to delete this schedule?")) {
                                try {
                                  await s.deleteSchedule(sch.id);
                                  toast.success("Play schedule deleted");
                                } catch (error: unknown) {
                                  toast.error(error instanceof Error ? error.message : "Failed to delete schedule.");
                                }
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                          {sch.status === "open" && (
                            <Button
                              size="icon"
                              className="btn-premium-solid h-8 w-8 p-0 cursor-pointer"
                              title="Release Session"
                              onClick={async () => {
                                try {
                                  await s.releaseSchedule(sch.id);
                                  toast.success("Session released — invitations sent");
                                } catch (error: unknown) {
                                  toast.error(error instanceof Error ? error.message : "Failed to release schedule.");
                                }
                              }}
                            >
                              <Send className="size-4" />
                            </Button>
                          )}
                          {sch.status === "released" && (
                            <Button
                              size="icon"
                              className="btn-premium-solid h-8 w-8 p-0 cursor-pointer"
                              title="Generate Rotation"
                              onClick={async () => {
                                try {
                                  await s.generateRotation(sch.id);
                                  toast.success("Rotation generated successfully");
                                } catch (error: unknown) {
                                  toast.error(error instanceof Error ? error.message : "Failed to generate rotation.");
                                }
                              }}
                            >
                              <Shuffle className="size-4" />
                            </Button>
                          )}
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
