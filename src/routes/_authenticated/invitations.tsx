import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import { CalendarDays, GraduationCap, Plus, Wallet } from "lucide-react";
import type { Member, PlaySchedule, Training } from "@/lib/types";
import { applyMemberFee, discountsFromStore, playSessionBaseFee } from "@/lib/fees";

export const Route = createFileRoute("/_authenticated/invitations")({ component: Invitations });

function isEligibleForPlaySchedule(
  member: Member,
  sch: PlaySchedule,
  leagueGroups: { id: string; memberIds: string[] }[],
) {
  if (member.memberType !== "adult" || member.status !== "active" || !member.membership) {
    return false;
  }
  if (sch.isLeagueMatch && sch.leagueGroupIds && sch.leagueGroupIds.length > 0) {
    const allowed = new Set(
      leagueGroups
        .filter((g) => sch.leagueGroupIds!.includes(g.id))
        .flatMap((g) => g.memberIds || []),
    );
    return allowed.has(member.id);
  }
  return true;
}

function Invitations() {
  const user = useCurrentUser()!;
  const s = useStore();
  const enrollTraining = useStore((st) => st.enrollTraining);
  const enrollPlay = useStore((st) => st.enrollPlay);
  const syncData = useStore((st) => st.syncData);
  const myMembers = s.members.filter((m) => m.userId === user.id);
  const myIds = myMembers.map((m) => m.id);
  const juniorChildren = myMembers.filter(
    (m) => m.memberType === "junior" && m.status === "active",
  );
  const adultPlayers = myMembers.filter(
    (m) => m.memberType === "adult" && m.status === "active",
  );
  const playInvs = s.playInvites.filter((i) => myIds.includes(i.memberId));
  const trainInvs = s.trainingInvites.filter((i) => myIds.includes(i.memberId));
  const activePrograms = s.trainings.filter((t) => t.status === "released" || t.status === "open");
  const releasedSchedules = s.schedules.filter((sch) => sch.status === "released");

  const [enrollSelections, setEnrollSelections] = useState<Record<string, string[]>>({});
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [autoInviting, setAutoInviting] = useState(false);
  const autoInviteAttempted = useRef<Set<string>>(new Set());
  const navigate = useNavigate();
  const [creditGap, setCreditGap] = useState<{
    memberId: string;
    balance: number;
    required: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await syncData();
      if (cancelled) return;

      const state = useStore.getState();
      const familyAdults = state.members.filter(
        (m) => m.userId === user.id && m.memberType === "adult" && m.status === "active",
      );
      const released = state.schedules.filter((sch) => sch.status === "released");
      const pending: { scheduleId: string; memberIds: string[] }[] = [];

      for (const sch of released) {
        const already = new Set(
          state.playInvites.filter((i) => i.scheduleId === sch.id).map((i) => i.memberId),
        );
        const missing = familyAdults
          .filter(
            (m) =>
              isEligibleForPlaySchedule(m, sch, state.leagueGroups) && !already.has(m.id),
          )
          .map((m) => m.id);

        if (missing.length === 0) continue;

        const key = `${sch.id}:${[...missing].sort().join(",")}`;
        if (autoInviteAttempted.current.has(key)) continue;
        autoInviteAttempted.current.add(key);
        pending.push({ scheduleId: sch.id, memberIds: missing });
      }

      if (pending.length === 0) return;

      setAutoInviting(true);
      try {
        for (const item of pending) {
          if (cancelled) return;
          await enrollPlay(item.scheduleId, item.memberIds);
        }
      } catch {
        // Leave invites as-is; user can refresh. Clear keys so a retry can happen.
        for (const item of pending) {
          autoInviteAttempted.current.delete(
            `${item.scheduleId}:${[...item.memberIds].sort().join(",")}`,
          );
        }
      } finally {
        if (!cancelled) setAutoInviting(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user.id, syncData, enrollPlay]);

  const name = (mid: string) => {
    const m = s.members.find((x) => x.id === mid);
    return m ? `${m.firstName} ${m.lastName}` : "";
  };

  const invitedMemberIds = (trainingId: string) =>
    s.trainingInvites.filter((i) => i.trainingId === trainingId).map((i) => i.memberId);

  const availableChildren = (trainingId: string) =>
    juniorChildren.filter((c) => !invitedMemberIds(trainingId).includes(c.id));

  const availablePlayMembers = (sch: PlaySchedule) => {
    const invited = new Set(
      s.playInvites.filter((i) => i.scheduleId === sch.id).map((i) => i.memberId),
    );
    return adultPlayers.filter(
      (m) => isEligibleForPlaySchedule(m, sch, s.leagueGroups) && !invited.has(m.id),
    );
  };

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

  const playSessions: PlaySchedule[] = [
    ...releasedSchedules,
    ...playInvs
      .map((i) => s.schedules.find((sch) => sch.id === i.scheduleId))
      .filter((sch): sch is PlaySchedule => !!sch && !releasedSchedules.some((r) => r.id === sch.id)),
  ];

  const uniquePlaySessions = playSessions.filter(
    (sch, idx, arr) => arr.findIndex((x) => x.id === sch.id) === idx,
  );

  const invitesForTraining = (trainingId: string) =>
    trainInvs.filter((i) => i.trainingId === trainingId);

  const invitesForSchedule = (scheduleId: string) =>
    playInvs.filter((i) => i.scheduleId === scheduleId);

  const renderPlayInviteActions = (
    i: (typeof playInvs)[number],
    sch: PlaySchedule,
    capacity: {
      acceptedCount: number;
      maxPlayers: number;
    },
  ) => {
    const member = s.members.find((x) => x.id === i.memberId);
    const estimatedFee = applyMemberFee(
      playSessionBaseFee(sch.sessionRate),
      member,
      discountsFromStore(s),
    );
    const hasInsufficientCredits =
      member && !member.skipCreditConsumption && member.credit < estimatedFee;
    const canAccept = i.status === "open" || i.status === "declined";
    const canDecline = i.status === "accepted" || i.status === "waiting";

    return (
      <div key={i.id} className="space-y-2 pt-2 border-t border-white/[0.03]">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-[#34D399] font-medium">Player: {name(i.memberId)}</div>
            <div className="text-[11px] text-[#8A8A98] mt-0.5 font-light">
              Session Fee:{" "}
              <span className="font-semibold font-mono text-[#34D399]">
                ${estimatedFee.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <StatusBadge status={i.status === "declined" ? "open" : i.status} />
            <div className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] px-3 py-2 min-w-[72px] text-left">
              <div className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase">
                Players
              </div>
              <div className="font-mono text-[18px] font-semibold text-[#F1F0EE] leading-tight mt-0.5">
                {capacity.acceptedCount}/{capacity.maxPlayers}
              </div>
              <div
                className="mt-1 h-[2px] w-full rounded-full bg-[#3B82F6]"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
        {canAccept && hasInsufficientCredits && (
          <div className="text-[11px] text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 font-light">
            <span className="font-semibold">Alert:</span> Insufficient credits ($
            {member!.credit.toFixed(2)} / ${estimatedFee.toFixed(2)})
          </div>
        )}
        {canAccept && (
          <Button
            size="sm"
            className="w-full btn-premium-solid h-8 text-[11px] font-semibold cursor-pointer"
            onClick={async () => {
              if (hasInsufficientCredits && member) {
                setCreditGap({
                  memberId: member.id,
                  balance: member.credit,
                  required: estimatedFee,
                });
                return;
              }
              try {
                const res = await s.respondPlay(i.id, "accepted");
                if (res.status === "waiting") {
                  toast.success("Session is full — you're on the waiting list");
                } else {
                  toast.success("Accepted invitation");
                }
              } catch (error: any) {
                const msg = error.message || "Failed to respond to invitation.";
                if (member && /insufficient credits/i.test(msg)) {
                  setCreditGap({
                    memberId: member.id,
                    balance: member.credit,
                    required: estimatedFee,
                  });
                  return;
                }
                toast.error(msg);
              }
            }}
          >
            Accept
          </Button>
        )}
        {canDecline && (
          <Button
            size="sm"
            variant="destructive"
            className="w-full btn-premium-danger h-8 text-[11px] font-semibold cursor-pointer"
            onClick={async () => {
              try {
                await s.respondPlay(i.id, "declined");
                toast.success(
                  i.status === "waiting"
                    ? "Left the waiting list"
                    : "Cancelled participation",
                );
              } catch (error: any) {
                toast.error(error.message || "Failed to cancel invitation.");
              }
            }}
          >
            Decline
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <AlertDialog open={!!creditGap} onOpenChange={(open) => !open && setCreditGap(null)}>
        <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[#F1F0EE]">
              <Wallet className="size-5 text-[#F59E0B]" />
              Insufficient credits
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#8A8A98] text-left space-y-2">
              <span className="block">
                You need more credits before you can accept this play session.
              </span>
              {creditGap && (
                <span className="block font-mono text-[13px] text-[#F1F0EE]">
                  Balance ${creditGap.balance.toFixed(2)} · Required $
                  {creditGap.required.toFixed(2)}
                </span>
              )}
              <span className="block">
                Go to the Credits page to request a top-up, then come back to accept.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="btn-premium-outline cursor-pointer mt-0">
              Not now
            </AlertDialogCancel>
            <AlertDialogAction
              className="btn-premium-solid cursor-pointer"
              onClick={() => {
                const memberId = creditGap?.memberId;
                setCreditGap(null);
                void navigate({
                  to: "/credits",
                  search: memberId ? { memberId } : {},
                });
              }}
            >
              Go to Credits
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PageHeader
        title="My invitations"
        description="Enroll in released play sessions and training programs, and respond to invitations."
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase flex items-center gap-2">
              <CalendarDays className="size-4 text-[#10B981]" /> Play Session Invitations
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {uniquePlaySessions.length === 0 && (
              <div className="py-4 space-y-3">
                <p className="text-[13px] font-light text-[#4A5E58] text-center">
                  No play sessions are open yet.
                </p>
                {adultPlayers.length === 0 && (
                  <div className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 rounded-lg p-4 flex flex-col items-center gap-3">
                    <p className="text-[13px] text-muted-foreground text-center">
                      Add an adult family member with club membership to join when a session is released.
                    </p>
                    <Button asChild size="sm" className="btn-premium-solid h-8 text-[11px]">
                      <Link to="/members/add">
                        <Plus className="size-3.5 mr-1" /> Add family member
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {uniquePlaySessions.map((sch) => {
              const available = availablePlayMembers(sch);
              const scheduleInvites = invitesForSchedule(sch.id);
              const canEnroll = sch.status === "released";
              const waitingForInvite = canEnroll && available.length > 0 && (autoInviting || scheduleInvites.length === 0);
              const acceptedCount = s.playInvites.filter(
                (i) => i.scheduleId === sch.id && i.status === "accepted",
              ).length;
              const maxPlayers = Math.max(sch.players || 0, 1);

              return (
                <div
                  key={sch.id}
                  className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="font-semibold text-[#F1F0EE] text-[14px]">{sch.name}</div>
                      <div className="text-[11px] text-[#8A8A98] mt-1 font-light font-mono">
                        {fmtDateTime(sch.date)} · {sch.location}
                      </div>
                    </div>
                    <StatusBadge status={sch.status} />
                  </div>

                  {canEnroll && adultPlayers.length === 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-white/[0.03]">
                      <p className="text-[12px] text-muted-foreground">
                        Add an adult family member to join this session.
                      </p>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="btn-premium-outline h-8 text-[11px] shrink-0"
                      >
                        <Link to="/members/add">
                          <Plus className="size-3.5 mr-1" /> Add family member
                        </Link>
                      </Button>
                    </div>
                  )}

                  {canEnroll &&
                    adultPlayers.length > 0 &&
                    available.length === 0 &&
                    scheduleInvites.length === 0 && (
                      <p className="text-[12px] text-muted-foreground pt-1 border-t border-white/[0.03]">
                        None of your members are eligible for this session yet (active adult with club
                        membership
                        {sch.isLeagueMatch ? ", and in the assigned league group" : ""}).
                      </p>
                    )}

                  {waitingForInvite && scheduleInvites.length === 0 && (
                    <p className="text-[12px] text-muted-foreground pt-1 border-t border-white/[0.03]">
                      Preparing your invitation…
                    </p>
                  )}

                  {scheduleInvites.map((i) =>
                    renderPlayInviteActions(i, sch, {
                      acceptedCount,
                      maxPlayers,
                    }),
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
                      <Link to="/members/add">
                        <Plus className="size-3.5 mr-1" /> Add family member
                      </Link>
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
                        Coach {t.coach} · {fmtDate(t.startDate)} → {fmtDate(t.endDate)} · {t.sessions}{" "}
                        sessions
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>

                  {canEnroll && juniorChildren.length === 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-white/[0.03]">
                      <p className="text-[12px] text-muted-foreground">
                        Add a junior family member to enroll.
                      </p>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="btn-premium-outline h-8 text-[11px] shrink-0"
                      >
                        <Link to="/members/add">
                          <Plus className="size-3.5 mr-1" /> Add family member
                        </Link>
                      </Button>
                    </div>
                  )}

                  {canEnroll && children.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-white/[0.03]">
                      <p className="text-[11px] font-medium tracking-[0.08em] text-[#8A8A98] uppercase">
                        Select children to invite
                      </p>
                      <div className="grid gap-2">
                        {children.map((child) => {
                          const childFee = applyMemberFee(t.fees, child, discountsFromStore(s));
                          return (
                            <label
                              key={child.id}
                              className="flex items-center gap-3 p-2.5 bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.3)] rounded-lg cursor-pointer transition-all"
                            >
                              <Checkbox
                                checked={selected.includes(child.id)}
                                onCheckedChange={(c) => toggleEnrollChild(t.id, child.id, !!c)}
                                className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981]"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-[#F1F0EE] text-[13px] truncate">
                                  {child.firstName} {child.lastName}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  Grade {child.grade} · Fee{" "}
                                  <span className="font-mono text-[#34D399]">
                                    ${childFee.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </label>
                          );
                        })}
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
                            toast.success(
                              `Invited ${selected.length} child${selected.length === 1 ? "" : "ren"}`,
                            );
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
                    <div key={i.id} className="flex flex-col gap-2 pt-2 border-t border-white/[0.03]">
                      <div className="flex justify-between items-center gap-2">
                        <div className="text-[11px] text-[#34D399] font-medium">
                          Child: {name(i.memberId)}
                        </div>
                        <StatusBadge status={i.status} />
                      </div>
                      {i.status === "open" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 btn-premium-solid h-8 text-[11px] font-semibold cursor-pointer"
                            onClick={async () => {
                              try {
                                await s.respondTraining(i.id, "accepted");
                                toast.success("Accepted invitation");
                              } catch (error: any) {
                                toast.error(error.message || "Failed to respond to invitation.");
                              }
                            }}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 btn-premium-outline h-8 text-[11px] cursor-pointer"
                            onClick={async () => {
                              try {
                                await s.respondTraining(i.id, "declined");
                                toast.success("Declined invitation");
                              } catch (error: any) {
                                toast.error(error.message || "Failed to respond to invitation.");
                              }
                            }}
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}

                  {canEnroll &&
                    juniorChildren.length > 0 &&
                    children.length === 0 &&
                    programInvites.length === 0 && (
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
