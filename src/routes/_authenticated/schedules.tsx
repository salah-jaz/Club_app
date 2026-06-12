import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { Plus, MapPin, Calendar, Users as UsersIcon, Eye, Pencil, Trash2, Send, Shuffle } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/schedules")({ component: SchedulesLayout });

function SchedulesLayout() {
  const user = useCurrentUser()!;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (user.role !== "admin") return <Navigate to="/dashboard" />;
  if (pathname !== "/schedules") return <Outlet />;
  return <SchedulesList />;
}

function SchedulesList() {
  const s = useStore();
  const [filter, setFilter] = useState<"all" | "open" | "released" | "closed">("all");

  const filtered = s.schedules.filter((sch) => {
    if (filter === "all") return true;
    if (filter === "closed") return sch.status === "rotated" || sch.status === "closed";
    return sch.status === filter;
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

      {/* Status filter tabs */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setFilter("all")}
          className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer border ${filter === "all" ? "bg-[rgba(16,185,129,0.12)] text-[#10B981] border-[rgba(16,185,129,0.4)]" : "bg-transparent text-[#8A8A98] border-transparent hover:text-[#F1F0EE]"}`}
        >
          All
        </button>
        <button
          onClick={() => setFilter("open")}
          className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer border ${filter === "open" ? "bg-[rgba(16,185,129,0.12)] text-[#10B981] border-[rgba(16,185,129,0.4)]" : "bg-transparent text-[#8A8A98] border-transparent hover:text-[#F1F0EE]"}`}
        >
          Open
        </button>
        <button
          onClick={() => setFilter("released")}
          className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer border ${filter === "released" ? "bg-[rgba(16,185,129,0.12)] text-[#10B981] border-[rgba(16,185,129,0.4)]" : "bg-transparent text-[#8A8A98] border-transparent hover:text-[#F1F0EE]"}`}
        >
          Released
        </button>
        <button
          onClick={() => setFilter("closed")}
          className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-all cursor-pointer border ${filter === "closed" ? "bg-[rgba(16,185,129,0.12)] text-[#10B981] border-[rgba(16,185,129,0.4)]" : "bg-transparent text-[#8A8A98] border-transparent hover:text-[#F1F0EE]"}`}
        >
          Closed
        </button>
      </div>

      {filtered.length === 0 ? (
        <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916]">
          <CardContent className="p-10 text-center text-[#8A8A98]">
            <div className="flex flex-col items-center justify-center gap-3">
              {/* Shuttlecock SVG icon */}
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
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((sch) => {
            const inv = s.playInvites.filter((i) => i.scheduleId === sch.id);
            const accepted = inv.filter((i) => i.status === "accepted").length;
            const maxPlayers = sch.players || 12; // fallback if players cap not specified
            const pct = Math.min((accepted / maxPlayers) * 100, 100);

            return (
              <Card key={sch.id} className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-all duration-200">
                <CardContent className="p-4 px-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Section 1: Title & details */}
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

                  {/* Section 2: Courts */}
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] font-medium tracking-[0.1em] text-[#4A4A5A] uppercase block">Courts</span>
                    <span className="font-mono text-[20px] text-[#F1F0EE] leading-none">{sch.courts}</span>
                  </div>

                  <div className="hidden md:block w-[1px] h-8 bg-[rgba(255,255,255,0.06)]" />

                  {/* Section 3: Players & capacity */}
                  <div className="flex-1 space-y-1">
                    <span className="text-[10px] font-medium tracking-[0.1em] text-[#4A4A5A] uppercase block">Players</span>
                    <span className="font-mono text-[20px] text-[#F1F0EE] leading-none">
                      {accepted}/{maxPlayers}
                    </span>
                    <div className="w-full h-[3px] bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                      <div className="h-full bg-[#10B981] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="hidden md:block w-[1px] h-8 bg-[rgba(255,255,255,0.06)]" />

                  {/* Section 4: Status badge & horizontal actions */}
                  <div className="flex-1 flex flex-col md:items-end gap-2">
                    <StatusBadge status={sch.status} />
                    <div className="flex items-center gap-1.5 mt-1 md:mt-0">
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
                        className="h-8 w-8 p-0 bg-red-950/40 border border-red-900/40 text-red-400 hover:bg-red-900/60 hover:text-red-200 cursor-pointer transition-colors"
                        title="Delete Schedule"
                        onClick={async () => {
                          if (confirm("Are you sure you want to delete this schedule?")) {
                            try {
                              await s.deleteSchedule(sch.id);
                              toast.success("Play schedule deleted");
                            } catch (error: any) {
                              toast.error(error.message || "Failed to delete schedule.");
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
                            } catch (error: any) {
                              toast.error(error.message || "Failed to release schedule.");
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
                            } catch (error: any) {
                              toast.error(error.message || "Failed to generate rotation.");
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