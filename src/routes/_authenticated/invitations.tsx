import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { CalendarDays, GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/invitations")({ component: Invitations });

function Invitations() {
  const user = useCurrentUser()!;
  const s = useStore();
  const myMembers = s.members.filter((m) => m.userId === user.id);
  const myIds = myMembers.map((m) => m.id);
  const playInvs = s.playInvites.filter((i) => myIds.includes(i.memberId));
  const trainInvs = s.trainingInvites.filter((i) => myIds.includes(i.memberId));

  const name = (mid: string) => {
    const m = s.members.find((x) => x.id === mid);
    return m ? `${m.firstName} ${m.lastName}` : "";
  };

  return (
    <div>
      <PageHeader title="My invitations" description="Accept or decline upcoming sessions." />
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase flex items-center gap-2">
              <CalendarDays className="size-4 text-[#10B981]" /> Play Session Invitations
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {playInvs.length === 0 && <p className="text-[13px] font-light text-[#4A5E58] py-4 text-center">No play invitations found.</p>}
            {playInvs.map((i) => {
              const sch = s.schedules.find((x) => x.id === i.scheduleId);
              if (!sch) return null;
              return (
                <div key={i.id} className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 hover:bg-[#1A2120]/60 rounded-lg p-4 transition-all">
                   <div className="flex justify-between items-start mb-3">
                     <div>
                       <div className="font-semibold text-[#F1F0EE] text-[14px]">{sch.name}</div>
                       <div className="text-[11px] text-[#8A8A98] mt-1 font-light font-mono">{fmtDateTime(sch.date)}</div>
                       <div className="text-[11px] text-[#34D399] mt-0.5 font-medium">Invited: {name(i.memberId)}</div>
                     </div>
                     <StatusBadge status={i.status} />
                   </div>
                    {i.status === "open" && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="flex-1 btn-premium-solid h-8 text-[11px] font-semibold cursor-pointer" onClick={async () => {
                          try {
                            await s.respondPlay(i.id, "accepted");
                            toast.success("Accepted invitation");
                          } catch (error: any) {
                            toast.error(error.message || "Failed to respond to invitation.");
                          }
                        }}>Accept</Button>
                        <Button size="sm" variant="outline" className="flex-1 btn-premium-outline h-8 text-[11px] cursor-pointer" onClick={async () => {
                          try {
                            await s.respondPlay(i.id, "declined");
                            toast.success("Declined invitation");
                          } catch (error: any) {
                            toast.error(error.message || "Failed to respond to invitation.");
                          }
                        }}>Decline</Button>
                      </div>
                    )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase flex items-center gap-2">
              <GraduationCap className="size-4 text-[#10B981]" /> Training Program Invites
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {trainInvs.length === 0 && <p className="text-[13px] font-light text-[#4A5E58] py-4 text-center">No training invitations found.</p>}
            {trainInvs.map((i) => {
              const t = s.trainings.find((x) => x.id === i.trainingId);
              if (!t) return null;
              return (
                <div key={i.id} className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 hover:bg-[#1A2120]/60 rounded-lg p-4 transition-all">
                   <div className="flex justify-between items-start mb-3">
                     <div>
                       <div className="font-semibold text-[#F1F0EE] text-[14px]">{t.name}</div>
                       <div className="text-[11px] text-[#8A8A98] mt-1 font-light font-mono">Coach {t.coach} · {t.sessions} sessions</div>
                       <div className="text-[11px] text-[#34D399] mt-0.5 font-medium">Invited: {name(i.memberId)}</div>
                     </div>
                     <StatusBadge status={i.status} />
                   </div>
                    {i.status === "open" && (
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="flex-1 btn-premium-solid h-8 text-[11px] font-semibold cursor-pointer" onClick={async () => {
                          try {
                            await s.respondTraining(i.id, "accepted");
                            toast.success("Accepted invitation");
                          } catch (error: any) {
                            toast.error(error.message || "Failed to respond to invitation.");
                          }
                        }}>Accept</Button>
                        <Button size="sm" variant="outline" className="flex-1 btn-premium-outline h-8 text-[11px] cursor-pointer" onClick={async () => {
                          try {
                            await s.respondTraining(i.id, "declined");
                            toast.success("Declined invitation");
                          } catch (error: any) {
                            toast.error(error.message || "Failed to respond to invitation.");
                          }
                        }}>Decline</Button>
                      </div>
                    )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}