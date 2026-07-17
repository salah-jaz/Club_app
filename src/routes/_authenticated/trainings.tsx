import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Plus, LayoutGrid, List, Search, X } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useState, useMemo } from "react";
import { useResponsiveViewMode } from "@/hooks/use-responsive-view-mode";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ConfirmDeleteDialog,
  type ConfirmDeleteRequest,
} from "@/components/ConfirmDeleteDialog";
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

function TrainingsList() {
  const s = useStore();
  const releaseTraining = useStore((st) => st.releaseTraining);
  const user = useCurrentUser()!;
  const { viewMode, setViewMode, isMobile } = useResponsiveViewMode("clubapp-view-mode-trainings", "grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteRequest, setDeleteRequest] = useState<ConfirmDeleteRequest | null>(null);

  const requestDeleteTraining = (t: Training) => {
    const memberCount = new Set(
      (s.trainingInvites ?? []).filter((i) => i.trainingId === t.id).map((i) => i.memberId),
    ).size;
    const sessionCount = (s.trainingDates ?? []).filter((d) => d.trainingId === t.id).length;
    setDeleteRequest({
      title: "Delete training",
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

  const filteredTrainings = useMemo(() => {
    let result = [...s.trainings];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(term) ||
          t.coach.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter);
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
  }, [s.trainings, searchTerm, statusFilter, sortBy]);

  return (
    <div>
      <ConfirmDeleteDialog
        request={deleteRequest}
        onOpenChange={(open) => !open && setDeleteRequest(null)}
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
                  placeholder="Search program or coach..."
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
                  <SelectItem value="newest" className="text-xs">Newest Start Date</SelectItem>
                  <SelectItem value="oldest" className="text-xs">Oldest Start Date</SelectItem>
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
      ) : filteredTrainings.length === 0 ? (
        <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916]">
          <CardContent className="p-10 text-center text-[#8A8A98]">
            <div className="flex flex-col items-center justify-center gap-3">
              <Plus className="size-12 text-[#4A4A5A] transform rotate-45" />
              <h3 className="text-[14px] font-normal text-[#8A8A98]">No matching training programs found.</h3>
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
      ) : viewMode === "grid" ? (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="show"
          className="grid md:grid-cols-2 gap-5"
        >
          {filteredTrainings.map((t) => (
            <motion.div
              key={t.id}
              variants={staggerItem}
              whileHover={{ y: -3, boxShadow: "0 10px 28px rgba(0,0,0,0.35), 0 0 0 1px rgba(16,185,129,0.10)" }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-colors duration-200 h-full">
                <CardContent className="p-6 space-y-4">
                  {/* Emerald dot & coach name */}
                  <div className="flex items-center gap-2">
                    <div className="size-1.5 rounded-full bg-[#34D399]" />
                    <span className="text-[12px] font-semibold text-[#8FA89F]">{t.coach}</span>
                  </div>

                  <div>
                    <h3 className="font-bold text-[16px] text-[#EEF2F0]">{t.name}</h3>
                    <div className="type-mono-value text-[12.5px] text-[#C4D4CF] mt-1">
                      {fmtDate(t.startDate)} → {fmtDate(t.endDate)}
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-[rgba(255,255,255,0.06)] pt-4 text-sm">
                    <div>
                      <div className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Sessions</div>
                      <div className="type-mono-value text-[15.5px] mt-1">{t.sessions}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Slots</div>
                      <div className="type-mono-value text-[15.5px] mt-1">{t.slots}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">Fees</div>
                      <div className="type-mono-value text-[15.5px] mt-1">{fmtMoney(t.fees)}</div>
                    </div>
                  </div>

                  {/* Bottom Row */}
                  <div className="flex items-center justify-between pt-2 gap-2">
                    <StatusBadge status={t.status} />
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {user.role === "admin" && t.status === "open" && (
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
          ))}
        </motion.div>
      ) : (
        <div className="bg-[#131916] border border-[rgba(255,255,255,0.06)] rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-[#0C0F0E]/60">
              <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                <TableHead className="type-table-head h-11 px-5">Program Name</TableHead>
                <TableHead className="type-table-head h-11">Coach</TableHead>
                <TableHead className="type-table-head h-11">Schedule</TableHead>
                <TableHead className="type-table-head h-11">Sessions</TableHead>
                <TableHead className="type-table-head h-11">Slots</TableHead>
                <TableHead className="type-table-head h-11">Fees</TableHead>
                <TableHead className="type-table-head h-11">Status</TableHead>
                <TableHead className="type-table-head h-11 text-right px-5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTrainings.map((t) => (
                <TableRow key={t.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors">
                  <TableCell className="px-5 py-3.5 font-bold text-[14.5px] text-[#EEF2F0]">{t.name}</TableCell>
                  <TableCell className="type-table-body">{t.coach}</TableCell>
                  <TableCell className="type-table-body font-mono text-xs">{fmtDate(t.startDate)} → {fmtDate(t.endDate)}</TableCell>
                  <TableCell className="type-mono-value">{t.sessions}</TableCell>
                  <TableCell className="type-mono-value">{t.slots}</TableCell>
                  <TableCell className="type-mono-value">{fmtMoney(t.fees)}</TableCell>
                  <TableCell><StatusBadge status={t.status} /></TableCell>
                  <TableCell className="text-right px-5 py-3 space-x-2">
                    {user.role === "admin" && t.status === "open" && (
                      <Button
                        size="sm"
                        className="btn-premium-solid h-8 text-xs cursor-pointer"
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}