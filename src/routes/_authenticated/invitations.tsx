import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { CalendarDays, GraduationCap, Plus } from "lucide-react";
import type { Training } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/invitations")({ component: Invitations });

function Invitations() {
  const user = useCurrentUser()!;
  const s = useStore();
  const enrollTraining = useStore((st) => st.enrollTraining);
  const syncData = useStore((st) => st.syncData);
  const myMembers = s.members.filter((m) => m.userId === user.id);
  const myIds = myMembers.map((m) => m.id);
  const juniorChildren = myMembers.filter(
    (m) => m.memberType === "junior" && m.status === "active",
  );
  const playInvs = s.playInvites.filter((i) => myIds.includes(i.memberId));
  const trainInvs = s.trainingInvites.filter((i) => myIds.includes(i.memberId));
  const activePrograms = s.trainings.filter((t) => t.status === "released" || t.status === "open");

  const [enrollSelections, setEnrollSelections] = useState<Record<string, string[]>>({});
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  useEffect(() => {
    void syncData();
  }, [syncData]);

  const name = (mid: string) => {
    const m = s.members.find((x) => x.id === mid);
    return m ? `${m.firstName} ${m.lastName}` : "";
  };

  const invitedMemberIds = (trainingId: string) =>
    s.trainingInvites.filter((i) => i.trainingId === trainingId).map((i) => i.memberId);

  const availableChildren = (trainingId: string) =>
    juniorChildren.filter((c) => !invitedMemberIds(trainingId).includes(c.id));

  const toggleEnrollChild = (trainingId: string, memberId: string, checked: boolean) => {
    setEnrollSelections((prev) => {
      const current = prev[trainingId] ?? [];
      const next = checked ? [...current, memberId] : current.filter((id) => id !== memberId);
      return { ...prev, [trainingId]: next };
    });
  };

  const trainingPrograms: Training[] = [
    ...activePrograms,
    ...trainInvs
      .map((i) => s.trainings.find((t) => t.id === i.trainingId))
      .filter((t): t is Training => !!t && !activePrograms.some((p) => p.id === t.id)),
  ];

  const uniquePrograms = trainingPrograms.filter(
    (t, idx, arr) => arr.findIndex((x) => x.id === t.id) === idx,
  );

  const invitesForTraining = (trainingId: string) =>
    trainInvs.filter((i) => i.trainingId === trainingId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My invitations"
        description="Enroll your children in training programs and respond to session invitations."
      />

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
            {uniquePrograms.length === 0 && (
              <div className="py-4 space-y-3">
                <p className="text-[13px] font-light text-[#4A5E58] text-center">
                  No training programs are open yet.
                </p>
                {juniorChildren.length === 0 && (
                  <div className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 rounded-lg p-4 flex flex-col items-center gap-3">
                    <p className="text-[13px] text-muted-foreground text-center">
                      Add a junior family member to enroll when a program opens.
                    </p>
                    <Button asChild size="sm" className="btn-premium-solid h-8 text-[11px]">
                      <Link to="/members/add"><Plus className="size-3.5 mr-1" /> Add family member</Link>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {uniquePrograms.map((t) => {
              const children = availableChildren(t.id);
              const selected = enrollSelections[t.id] ?? [];
              const programInvites = invitesForTraining(t.id);
              const canEnroll = t.status === "open" || t.status === "released";

              return (
                <div
                  key={t.id}
                  className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="font-semibold text-[#F1F0EE] text-[14px]">{t.name}</div>
                      <div className="text-[11px] text-[#8A8A98] mt-1 font-light font-mono">
                        Coach {t.coach} · {fmtDate(t.startDate)} → {fmtDate(t.endDate)} · {t.sessions} sessions
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>

                  {canEnroll && juniorChildren.length === 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-white/[0.03]">
                      <p className="text-[12px] text-muted-foreground">Add a junior family member to enroll.</p>
                      <Button asChild size="sm" variant="outline" className="btn-premium-outline h-8 text-[11px] shrink-0">
                        <Link to="/members/add"><Plus className="size-3.5 mr-1" /> Add family member</Link>
                      </Button>
                    </div>
                  )}

                  {canEnroll && children.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-white/[0.03]">
                      <p className="text-[11px] font-medium tracking-[0.08em] text-[#8A8A98] uppercase">
                        Select children to invite
                      </p>
                      <div className="grid gap-2">
                        {children.map((child) => (
                          <label
                            key={child.id}
                            className="flex items-center gap-3 p-2.5 bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.3)] rounded-lg cursor-pointer transition-all"
                          >
                            <Checkbox
                              checked={selected.includes(child.id)}
                              onCheckedChange={(c) => toggleEnrollChild(t.id, child.id, !!c)}
                              className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981]"
                            />
                            <div className="min-w-0">
                              <div className="font-medium text-[#F1F0EE] text-[13px] truncate">
                                {child.firstName} {child.lastName}
                              </div>
                              <div className="text-[11px] text-muted-foreground">Grade {child.grade}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        disabled={selected.length === 0 || enrollingId === t.id}
                        className="btn-premium-solid h-8 text-[11px] font-semibold cursor-pointer w-full sm:w-auto"
                        onClick={async () => {
                          setEnrollingId(t.id);
                          try {
                            await enrollTraining(t.id, selected);
                            await syncData();
                            toast.success(`Invited ${selected.length} child${selected.length === 1 ? "" : "ren"}`);
                            setEnrollSelections((prev) => ({ ...prev, [t.id]: [] }));
                          } catch (error: any) {
                            toast.error(error.message || "Failed to send invitations.");
                          } finally {
                            setEnrollingId(null);
                          }
                        }}
                      >
                        Send invitations
                      </Button>
                    </div>
                  )}

                  {programInvites.map((i) => (
                    <div
                      key={i.id}
                      className="flex flex-col gap-2 pt-2 border-t border-white/[0.03]"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <div className="text-[11px] text-[#34D399] font-medium">Child: {name(i.memberId)}</div>
                        <StatusBadge status={i.status} />
                      </div>
                      {i.status === "open" && (
                        <div className="flex gap-2">
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
                  ))}

                  {canEnroll && juniorChildren.length > 0 && children.length === 0 && programInvites.length === 0 && (
                    <p className="text-[12px] text-muted-foreground pt-1 border-t border-white/[0.03]">
                      Select your children above to receive invitations.
                    </p>
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
