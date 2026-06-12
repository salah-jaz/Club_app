import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { useSearchFilters, EmptyState } from "@/components/SearchFilterBar";
import { ScheduleFilters } from "@/components/ScheduleFilters";
import { fmtDateTime } from "@/lib/format";
import { Plus, MapPin, Calendar, Eye, Pencil, Trash2, Send, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { useMemo } from "react";
import type { PlaySchedule } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/schedules")({ component: SchedulesLayout });

function SchedulesLayout() {
  const user = useCurrentUser()!;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (user.role !== "admin") return <Navigate to="/dashboard" />;
  if (pathname !== "/schedules") return <Outlet />;
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
        <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916]">
          <CardContent className="p-10 text-center text-[#8A8A98]">
            <div className="flex flex-col items-center justify-center gap-3">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#4A4A5A]">
                <path d="M12 2a4 4 0 0 0-4 4v2.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V6a4 4 0 0 0-4-4Z"/>
                <path d="M12 9v11"/>
                <path d="m8 15 4 5 4-5"/>
                <path d="M7 11c0 2 2.5 4 5 4s5-2 5-4"/>
              </svg>
              <h3 className="text-[14px] font-normal text-[#8A8A98]">No schedules yet.</h3>
              <p className="text-[12px] font-light text-[#4A4A5A] max-w-[280px]">
                Create your first play session to get started.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : processed.length === 0 ? (
        <EmptyState
          title="No schedules match your filters"
          description="Try adjusting your search, date range, or filter criteria to find sessions."
          onClear={clearFilters}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {processed.map((sch) => {
            const accepted = inviteStats.get(sch.id) ?? 0;
            const maxPlayers = sch.players || 12;
            const pct = Math.min(getFillRate(sch, accepted), 100);

            return (
              <Card key={sch.id} className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-all duration-200">
                <CardContent className="p-4 px-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-[2] space-y-1 min-w-[200px]">
                    <div className="font-semibold text-[15px] text-[#F1F0EE]">{sch.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-[#8A8A98]">
                      <Calendar className="size-3.5 text-[#4A4A5A]" />
                      <span>{fmtDateTime(sch.date)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-[#4A4A5A]">
                      <MapPin className="size-3.5" />
                      <span>{sch.location}</span>
                    </div>
                  </div>

                  <div className="hidden md:block w-[1px] h-8 bg-[rgba(255,255,255,0.06)]" />

                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] font-medium tracking-[0.1em] text-[#4A4A5A] uppercase block">Courts</span>
                    <span className="font-mono text-[20px] text-[#F1F0EE] leading-none">{sch.courts}</span>
                  </div>

                  <div className="hidden md:block w-[1px] h-8 bg-[rgba(255,255,255,0.06)]" />

                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] font-medium tracking-[0.1em] text-[#4A4A5A] uppercase block">Players</span>
                    <span className="font-mono text-[20px] text-[#F1F0EE] leading-none">
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
                        className="h-11 w-11 md:h-8 md:w-8 p-0 bg-red-950/40 border border-red-900/40 text-red-400 hover:bg-red-900/60 hover:text-red-200 cursor-pointer transition-colors"
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
            );
          })}
        </div>
      )}
    </div>
  );
}
