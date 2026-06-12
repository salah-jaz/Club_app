import { createFileRoute, Navigate, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useStore, useCurrentUser } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { Shuffle, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/schedules/$id")({ component: SchedulePage });

function SchedulePage() {
  const { id } = Route.useParams();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (pathname !== `/schedules/${id}`) return <Outlet />;

  const s = useStore();
  const user = useCurrentUser()!;
  const sch = s.schedules.find((x) => x.id === id);
  if (!sch) return <Navigate to="/schedules" />;
  const invs = s.playInvites.filter((i) => i.scheduleId === id);
  const rot = s.rotations.find((r) => r.scheduleId === id);
  const memberName = (mid: string) => {
    if (typeof mid === "string" && mid.startsWith("guest_")) {
      return `Guest Player ${mid.split("_")[1]}`;
    }
    const m = s.members.find((x) => x.id === mid);
    return m ? `${m.firstName} ${m.lastName}` : "?";
  };
  const grouped = {
    accepted: invs.filter((i) => i.status === "accepted"),
    declined: invs.filter((i) => i.status === "declined"),
    waiting: invs.filter((i) => i.status === "open"),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={sch.name}
        description={`${fmtDateTime(sch.date)} · ${sch.location}`}
        backTo="/schedules"
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={sch.status} />
            {user.role === "admin" && (
              <>
                <Button asChild variant="outline" size="sm" className="btn-premium-outline h-9 px-4 text-xs cursor-pointer">
                  <Link to="/schedules/$id/edit" params={{ id: sch.id }}>
                    Edit
                  </Link>
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="h-9 px-4 text-xs bg-red-950/40 border border-red-900/40 text-red-400 hover:bg-red-900/60 hover:text-red-200 cursor-pointer"
                  onClick={async () => {
                    if (confirm("Are you sure you want to delete this schedule?")) {
                      try {
                        await s.deleteSchedule(sch.id);
                        toast.success("Play schedule deleted");
                        window.history.back();
                      } catch (error: any) {
                        toast.error(error.message || "Failed to delete schedule.");
                      }
                    }
                  }}
                >
                  Delete
                </Button>
              </>
            )}
            {sch.status === "released" && grouped.accepted.length > 0 && (
              <Button 
                className="btn-premium-solid h-9 px-4 text-xs font-semibold cursor-pointer" 
                onClick={async () => {
                  try {
                    await s.generateRotation(sch.id);
                    toast.success("Rotation generated & fees deducted");
                  } catch (error: any) {
                    toast.error(error.message || "Failed to generate rotation.");
                  }
                }}
              >
                <Shuffle className="size-3.5 mr-1" /> Generate rotation
              </Button>
            )}
            {sch.status !== "closed" && (
              <Button 
                variant="outline" 
                className="btn-premium-outline h-9 px-4 text-xs cursor-pointer" 
                onClick={async () => {
                  try {
                    await s.closeSchedule(sch.id);
                    toast.success("Schedule closed");
                  } catch (error: any) {
                    toast.error(error.message || "Failed to close schedule.");
                  }
                }}
              >
                Close Session
              </Button>
            )}
          </div>
        }
      />

      {/* Roster Cards */}
      <div className="grid lg:grid-cols-3 gap-5 mb-8">
        {(["accepted", "waiting", "declined"] as const).map((k) => {
          let listColor = "text-[#2DD4BF]";
          if (k === "waiting") listColor = "text-[#F59E0B]";
          if (k === "declined") listColor = "text-[#EF4444]";

          return (
            <Card key={k} className="bg-[#131916] border-[rgba(255,255,255,0.06)]">
              <CardHeader className="pb-3 border-b border-[rgba(255,255,255,0.04)]">
                <CardTitle className="text-[11px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase flex items-center justify-between">
                  <span>{k}</span>
                  <span className={cn("font-mono text-xs", listColor)}>({grouped[k].length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-2.5 max-h-[280px] overflow-y-auto">
                {grouped[k].length === 0 ? (
                  <p className="text-[13px] font-light text-[#4A5E58] py-3 text-center">No members listed.</p>
                ) : (
                  grouped[k].map((i) => (
                    <div key={i.id} className="text-[13px] text-[#F1F0EE] py-2 border-b border-white/[0.03] last:border-0 font-medium">
                      {memberName(i.memberId)}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {rot && (
        <div className="space-y-6">
          <div className="signature-divider !h-[1px] my-6" />
          <span className="text-[11px] font-medium tracking-[0.14em] text-[#34D399] uppercase block mb-4">
            COURT ROTATIONS & MATCHUPS
          </span>
          <Tabs defaultValue="r1" className="w-full">
            <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex mb-6 h-10">
              {rot.rounds.map((r) => (
                <TabsTrigger 
                  key={r.round} 
                  value={`r${r.round}`}
                  className="text-[13px] font-medium px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all"
                >
                  Round {r.round}
                </TabsTrigger>
              ))}
            </TabsList>
            
            {rot.rounds.map((r) => (
              <TabsContent key={r.round} value={`r${r.round}`} className="focus-visible:outline-none space-y-6">
                <div className="grid md:grid-cols-2 gap-5">
                  {r.courts.map((c) => (
                    <Card key={c.courtNo} className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
                      <CardHeader className="pb-3 border-b border-white/[0.03]">
                        <CardTitle className="text-[12px] font-semibold text-[#F1F0EE] flex items-center gap-2">
                          <Trophy className="size-4 text-[#34D399]" /> Court {c.courtNo}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 grid grid-cols-2 gap-2.5">
                        {c.players.map((p, idx) => (
                          <div key={idx} className="rounded-lg bg-[#1A2120] border border-[rgba(255,255,255,0.06)] px-3 py-2.5 text-center text-[13px] font-semibold text-[#F1F0EE] truncate hover:border-[rgba(16,185,129,0.3)] transition-colors">
                            {memberName(p)}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                  
                  {r.resting.length > 0 && (
                    <Card className="md:col-span-2 bg-[#131916] border-[rgba(255,255,255,0.06)]">
                      <CardHeader className="pb-3 border-b border-white/[0.03]">
                        <CardTitle className="text-[11px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase">
                          Resting Players (Bye)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-4 flex flex-wrap gap-2">
                        {r.resting.map((p) => (
                          <div key={p} className="rounded-full bg-white/5 border border-white/10 px-3.5 py-1 text-[13px] font-medium text-[#F1F0EE]">
                            {memberName(p)}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
    </div>
  );
}