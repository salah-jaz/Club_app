import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Navigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Plus, MapPin, User } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/trainings")({ component: TrainingsLayout });

function TrainingsLayout() {
  const user = useCurrentUser()!;
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (user.role !== "admin" && user.role !== "volunteer") return <Navigate to="/dashboard" />;
  if (pathname !== "/trainings") return <Outlet />;
  return <TrainingsList />;
}

function TrainingsList() {
  const s = useStore();
  const user = useCurrentUser()!;
  return (
    <div>
      <PageHeader
        title="Training programs"
        description="Coach-led programs for junior members."
        actions={user.role === "admin" && <Button asChild><Link to="/trainings/new"><Plus /> New training</Link></Button>}
      />
      {s.trainings.length === 0 ? (
        <Card><CardContent className="p-10 text-center text-muted-foreground">No training programs yet.</CardContent></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {s.trainings.map((t) => (
            <Card key={t.id} className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-all duration-200">
              <CardContent className="p-6 space-y-4">
                {/* Emerald dot & coach name */}
                <div className="flex items-center gap-2">
                  <div className="size-1.5 rounded-full bg-[#34D399]" />
                  <span className="text-xs font-semibold text-[#8A8A98]">{t.coach}</span>
                </div>

                <div>
                  <h3 className="font-semibold text-base text-[#F1F0EE]">{t.name}</h3>
                  <div className="font-mono text-[12.5px] text-[#4A5E58] mt-1">
                    {fmtDate(t.startDate)} → {fmtDate(t.endDate)}
                  </div>
                </div>

                {/* Stats Row */}
                <div className="grid grid-cols-3 gap-4 border-t border-[rgba(255,255,255,0.06)] pt-4 text-sm">
                  <div>
                    <div className="text-[10px] font-medium text-[#4A5E58] uppercase tracking-[0.08em]">Sessions</div>
                    <div className="font-mono text-[15px] text-[#F1F0EE] mt-1">{t.sessions}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium text-[#4A5E58] uppercase tracking-[0.08em]">Slots</div>
                    <div className="font-mono text-[15px] text-[#F1F0EE] mt-1">{t.slots}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium text-[#4A5E58] uppercase tracking-[0.08em]">Fees</div>
                    <div className="font-mono text-[15px] text-[#F1F0EE] mt-1">{fmtMoney(t.fees)}</div>
                  </div>
                </div>

                {/* Bottom Row */}
                <div className="flex items-center justify-between pt-2">
                  <StatusBadge status={t.status} />
                  <div className="flex items-center gap-1">
                    <Button asChild variant="ghost" className="h-11 md:h-8 px-4 text-sm md:text-xs text-[#8A8A98] hover:text-[#F1F0EE] hover:bg-white/5 cursor-pointer">
                      <Link to="/trainings/$id" params={{ id: t.id }}>Manage</Link>
                    </Button>
                    {user.role === "admin" && (
                      <>
                        <Button asChild variant="ghost" className="h-11 md:h-8 px-4 text-sm md:text-xs text-[#8A8A98] hover:text-[#F1F0EE] hover:bg-white/5 cursor-pointer">
                          <Link to="/trainings/$id/edit" params={{ id: t.id }}>Edit</Link>
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-11 md:h-8 px-4 text-sm md:text-xs text-red-400 hover:text-red-300 hover:bg-red-950/20 cursor-pointer"
                          onClick={async () => {
                            if (confirm("Are you sure you want to delete this training program?")) {
                              try {
                                await s.deleteTraining(t.id);
                                toast.success("Training program deleted");
                              } catch (error: any) {
                                toast.error(error.message || "Failed to delete training program.");
                              }
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

      )}
    </div>
  );
}