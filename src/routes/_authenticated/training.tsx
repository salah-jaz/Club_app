import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { fmtDate, fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { GraduationCap, Plus, Wallet, AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";
import type { Member, Training, TrainingInvitation, TrainingUpdateRequest } from "@/lib/types";
import { applyMemberFee, discountsFromStore } from "@/lib/fees";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/training")({ component: TrainingModule });

function scheduleDateIso(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function TrainingModule() {
  const user = useCurrentUser()!;
  const s = useStore();
  const syncData = useStore((st) => st.syncData);
  const navigate = useNavigate();

  const myMembers = s.members.filter((m) => m.userId === user.id);
  const myIds = myMembers.map((m) => m.id);
  const juniorChildren = myMembers.filter(
    (m) => m.memberType === "junior" && m.status === "active",
  );
  const adultPlayers = myMembers.filter(
    (m) => m.memberType === "adult" && m.status === "active",
  );

  const trainInvs = s.trainingInvites.filter((i) => myIds.includes(i.memberId));
  const invitedTrainingIds = new Set(trainInvs.map((i) => i.trainingId));

  const pendingTrainingUpdateRequests = useMemo(() => {
    return (s.trainingUpdateRequests ?? []).filter(
      (ur) => myIds.includes(ur.memberId) && ur.status === "pending"
    );
  }, [s.trainingUpdateRequests, myIds]);

  const [bulkAcceptPopup, setBulkAcceptPopup] = useState<{
    member: Member;
    training: Training;
    monthSessions: Training[];
    invitedMonthSessions: Training[];
    invites: TrainingInvitation[];
  } | null>(null);

  const [creditGap, setCreditGap] = useState<{
    memberId: string;
    balance: number;
    required: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await syncData();
    };
    void run();
    return () => { cancelled = true; };
  }, [user.id, syncData]);

  const name = (mid: string) => {
    const m = s.members.find((x) => x.id === mid);
    return m ? `${m.firstName} ${m.lastName}` : "?";
  };

  const getHolidayName = (dateStr: string) => {
    const iso = scheduleDateIso(dateStr);
    if (!iso) return null;
    const match = (s.holidayItems ?? []).find((h) => h.date === iso);
    if (match) return match.name;
    if ((s.holidays ?? []).includes(iso)) return "Holiday";
    return null;
  };

  const trainingPrograms = s.trainings.filter((t) => invitedTrainingIds.has(t.id));

  // Build monthly cards: one entry per (parentId, monthIndex) group
  interface MonthlyTrainingCard {
    key: string;
    parentId: string;
    monthIndex: number;
    primarySession: Training;
    monthSessions: Training[];
    repeatWeeks: number;
  }

  const monthlyTrainingCards = useMemo((): MonthlyTrainingCard[] => {
    const seriesMap = new Map<string, Training[]>();
    for (const t of trainingPrograms) {
      const pid = t.parentId || t.id;
      if (!seriesMap.has(pid)) seriesMap.set(pid, []);
      seriesMap.get(pid)!.push(t);
    }

    const cards: MonthlyTrainingCard[] = [];
    for (const [pid, sessions] of seriesMap.entries()) {
      const sorted = [...sessions].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
      if (sorted.length === 0) continue;

      const first = sorted[0];
      const rw = Math.max(1, first.repeatWeeks || 3);

      const allSeriesSessions = s.trainings
        .filter(x => (x.parentId || x.id) === pid)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

      const monthGroups: Record<string, Training[]> = {};
      for (const session of allSeriesSessions) {
        const d = new Date(session.startDate);
        if (Number.isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthGroups[key]) monthGroups[key] = [];
        monthGroups[key].push(session);
      }

      const monthKeys = Object.keys(monthGroups).sort();
      const relevantIds = new Set(sorted.map(sess => sess.id));

      monthKeys.forEach((key, m) => {
        const fullMonthSessions = monthGroups[key];
        if (fullMonthSessions.length === 0) return;

        const primary = fullMonthSessions[0];
        const hasRelevantSession = fullMonthSessions.some(sess => relevantIds.has(sess.id));
        if (!hasRelevantSession) return;

        cards.push({
          key: `${pid}_m${m}`,
          parentId: pid,
          monthIndex: m,
          primarySession: primary,
          monthSessions: fullMonthSessions,
          repeatWeeks: rw,
        });
      });
    }

    return cards.sort(
      (a, b) => new Date(a.primarySession.startDate).getTime() - new Date(b.primarySession.startDate).getTime()
    );
  }, [trainingPrograms, s.trainings]);

  return (
    <div className="space-y-6">
      {/* Credit gap dialog */}
      <AlertDialog open={!!creditGap} onOpenChange={(open) => !open && setCreditGap(null)}>
        <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[#F1F0EE]">
              <Wallet className="size-5 text-[#F59E0B]" />
              Insufficient credits
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#8A8A98] text-left space-y-2">
              <span className="block">
                You need more credits before you can accept this training program.
              </span>
              {creditGap && (
                <span className="block font-mono text-[13px] text-[#F1F0EE]">
                  Balance {fmtMoney(creditGap.balance)} · Required {fmtMoney(creditGap.required)}
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

      {/* Bulk accept training dialog */}
      {bulkAcceptPopup && (() => {
        const { member, training, monthSessions, invitedMonthSessions, invites } = bulkAcceptPopup;
        const isAdult = training.targetType === "adult";

        const repeatWeeks = Math.max(1, training.repeatWeeks || 3);
        const discountedMonthlyFee = applyMemberFee(training.fees || 0, member, discountsFromStore(s));
        const feePerWeek = discountedMonthlyFee / repeatWeeks;
        const invitedWeeksCount = invitedMonthSessions.length;
        const totalFee = feePerWeek * invitedWeeksCount;
        const balanceAfter = member.credit - totalFee;

        return (
          <AlertDialog open={!!bulkAcceptPopup} onOpenChange={(open) => !open && setBulkAcceptPopup(null)}>
            <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[#F1F0EE]">
                  Accept Training Program
                </AlertDialogTitle>
                <AlertDialogDescription className="text-[#8A8A98] text-left space-y-4 pt-2">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-[#F1F0EE]">{training.name}</div>
                    <div className="text-xs">Coach {training.coach} · {training.location}</div>
                    <div className="text-xs">{isAdult ? "Adult" : "Junior"} Training</div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[#F1F0EE]">Invited Dates (This Month):</div>
                    <ul className="list-disc pl-4 text-xs space-y-0.5 text-[#8A8A98]">
                      {invitedMonthSessions.map(ct => (
                        <li key={ct.id}>{fmtDate(ct.startDate)}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2 border-t border-[rgba(255,255,255,0.1)] pt-3">
                    <div className="flex justify-between text-xs text-[#8A8A98]">
                      <span>Monthly Fee ({repeatWeeks} week{repeatWeeks !== 1 ? "s" : ""})</span>
                      <span className="font-mono">{fmtMoney(discountedMonthlyFee)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-[#8A8A98]">
                      <span>Fee Per Week</span>
                      <span className="font-mono text-[#3B82F6]">{fmtMoney(feePerWeek)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-[#F1F0EE]">
                      <span>Total Deduction ({invitedWeeksCount} invited week{invitedWeeksCount !== 1 ? "s" : ""})</span>
                      <span className="font-mono">{fmtMoney(totalFee)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-[#8A8A98]">
                      <span>Current Wallet Balance</span>
                      <span className="font-mono">{fmtMoney(member.credit)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-[#F1F0EE]">
                      <span>Wallet Deduction</span>
                      <span className="font-mono">{fmtMoney(totalFee)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold pt-1 border-t border-white/5">
                      <span>Balance After Deduction</span>
                      <span className={cn("font-mono", balanceAfter < 0 ? "text-red-400" : "text-green-400")}>
                        {fmtMoney(balanceAfter)}
                      </span>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="btn-premium-outline cursor-pointer mt-0">
                  Cancel
                </AlertDialogCancel>
                <Button
                  className="btn-premium-solid cursor-pointer"
                  onClick={async () => {
                    if (balanceAfter < 0 && !member.skipCreditConsumption) {
                      setBulkAcceptPopup(null);
                      setCreditGap({
                        memberId: member.id,
                        balance: member.credit,
                        required: totalFee,
                      });
                      return;
                    }

                    try {
                      await s.respondTrainingBulk(invites.map(i => i.id), "accepted");
                      toast.success("Training program accepted successfully!");
                      setBulkAcceptPopup(null);
                    } catch (error: any) {
                      toast.error(error.message || "Failed to accept training program.");
                    }
                  }}
                >
                  Confirm Accept
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      <PageHeader
        title="Training"
        description="View and manage your training program invitations. Accept or decline monthly sessions assigned by your coach."
      />

      <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
        <CardHeader className="pb-3 border-b border-white/[0.03]">
          <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase flex items-center gap-2">
            <GraduationCap className="size-4 text-[#3B82F6]" /> Training Programs
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-3">
          {/* Pending Training Update Requests Banner */}
          {pendingTrainingUpdateRequests.map((ur) => {
            const member = s.members.find((m) => m.id === ur.memberId);
            if (!member) return null;

            const tr = s.trainings.find((x) => x.id === ur.trainingId) || s.trainings.find((x) => (x.parentId || x.id) === ur.trainingId);
            const trName = tr ? tr.name : "Training Program";

            const existingSessions = (ur.existingSessionIds ?? [])
              .map((sid) => s.trainings.find((x) => x.id === sid))
              .filter((x): x is Training => !!x);
            const newSessions = (ur.newSessionIds ?? [])
              .map((sid) => s.trainings.find((x) => x.id === sid))
              .filter((x): x is Training => !!x);

            return (
              <div key={ur.id} className="p-4 rounded-xl bg-[#131916] border border-[#3B82F6]/40 space-y-3 signature-card-top shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/30 mb-1">
                      <RefreshCw className="size-3" /> Training Program Updated
                    </div>
                    <h4 className="font-semibold text-sm text-[#F1F0EE]">{trName}</h4>
                    <p className="text-xs text-[#8A8A98]">
                      Update request for <strong className="text-white">{member.firstName} {member.lastName}</strong>
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-[#8A8A98] uppercase tracking-wider font-medium">
                      {ur.additionalAmount < 0 ? "Wallet Refund" : "Additional Fee"}
                    </div>
                    <div className={cn(
                      "font-mono font-bold text-sm",
                      ur.additionalAmount > 0 ? "text-[#34D399]" : ur.additionalAmount < 0 ? "text-[#A78BFA]" : "text-[#8A8A98]"
                    )}>
                      {ur.additionalAmount < 0 ? `-${fmtMoney(Math.abs(ur.additionalAmount))}` : fmtMoney(ur.additionalAmount)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1">
                  <div className="p-2.5 rounded-lg bg-[#1A2120] border border-white/5 space-y-1">
                    <div className="text-[10px] font-semibold text-[#8A8A98] uppercase tracking-wider">Previously Accepted Sessions</div>
                    <div className="flex flex-wrap gap-1">
                      {existingSessions.map((sItem) => (
                        <span key={sItem.id} className="text-[11px] font-medium bg-[#10B981]/10 text-[#34D399] px-2 py-0.5 rounded">
                          ✓ {fmtDate(sItem.startDate)}
                        </span>
                      ))}
                      {existingSessions.length === 0 && <span className="text-[11px] text-[#8A8A98]">None</span>}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#1A2120] border border-white/5 space-y-1">
                    <div className="text-[10px] font-semibold text-[#3B82F6] uppercase tracking-wider">New Sessions Added</div>
                    <div className="flex flex-wrap gap-1">
                      {newSessions.map((sItem) => (
                        <span key={sItem.id} className="text-[11px] font-medium bg-[#3B82F6]/10 text-[#60A5FA] px-2 py-0.5 rounded">
                          + {fmtDate(sItem.startDate)}
                        </span>
                      ))}
                      {newSessions.length === 0 && <span className="text-[11px] text-[#8A8A98]">None</span>}
                    </div>
                  </div>
                </div>

                {/* Payment Summary */}
                <div className="p-3 rounded-lg bg-[#1A2120] border border-white/10 space-y-1.5 text-xs">
                  <div className="text-[10px] font-semibold text-[#34D399] uppercase tracking-wider">Payment Summary</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-[#8A8A98]">
                    <div>
                      <span>Previously Paid: </span>
                      <strong className="text-white font-mono">{fmtMoney(ur.previouslyPaidAmount ?? 0)}</strong>
                    </div>
                    <div>
                      <span>Updated Fee: </span>
                      <strong className="text-white font-mono">{fmtMoney(ur.updatedMonthlyFee ?? 0)}</strong>
                    </div>
                    <div>
                      <span>New Per Session: </span>
                      <strong className="text-white font-mono">{fmtMoney(ur.newPerSessionFee ?? 0)}</strong>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.04]">
                  <Button
                    size="sm"
                    variant="outline"
                    className="btn-premium-outline h-8 text-xs cursor-pointer"
                    onClick={async () => {
                      try {
                        await s.respondTrainingUpdateRequest(ur.id, "declined");
                        toast.success("Training update request declined. Original invitation remains unchanged.");
                      } catch (error: any) {
                        toast.error(error.message || "Failed to decline update request.");
                      }
                    }}
                  >
                    Decline Update
                  </Button>
                  <Button
                    size="sm"
                    className="btn-premium-solid h-8 text-xs font-semibold cursor-pointer"
                    onClick={async () => {
                      if (ur.additionalAmount > 0 && ur.additionalAmount > member.credit && !member.skipCreditConsumption) {
                        setCreditGap({
                          memberId: member.id,
                          balance: member.credit,
                          required: ur.additionalAmount,
                        });
                        return;
                      }
                      try {
                        await s.respondTrainingUpdateRequest(ur.id, "accepted");
                        if (ur.additionalAmount > 0) {
                          toast.success(`Training update accepted! ${fmtMoney(ur.additionalAmount)} debited from wallet.`);
                        } else if (ur.additionalAmount < 0) {
                          toast.success(`Training update accepted! ${fmtMoney(Math.abs(ur.additionalAmount))} credited to wallet.`);
                        } else {
                          toast.success("Training update accepted!");
                        }
                      } catch (error: any) {
                        toast.error(error.message || "Failed to accept update request.");
                      }
                    }}
                  >
                    Accept Update
                  </Button>
                </div>
              </div>
            );
          })}

          {monthlyTrainingCards.length === 0 && pendingTrainingUpdateRequests.length === 0 && (
            <div className="py-4 space-y-3">
              <p className="text-[13px] font-light text-[#8A8A98] text-center">
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

          {monthlyTrainingCards.map((card) => {
            const t = card.primarySession;
            const targetType = t.targetType || "junior";
            const monthSessions = card.monthSessions;
            const monthSessionIds = new Set(monthSessions.map(ms => ms.id));

            const isCancelled = t.status === "cancelled" || monthSessions.some(ms => ms.status === "cancelled");
            const cancelReason = t.cancelReason || monthSessions.find(ms => ms.cancelReason)?.cancelReason || "No reason specified.";

            const familyMonthInvites = trainInvs.filter(i => monthSessionIds.has(i.trainingId));

            const memberInvitesMap = new Map<string, typeof familyMonthInvites>();
            for (const inv of familyMonthInvites) {
              if (!memberInvitesMap.has(inv.memberId)) memberInvitesMap.set(inv.memberId, []);
              memberInvitesMap.get(inv.memberId)!.push(inv);
            }

            const canEnroll = !isCancelled && (t.status === "open" || t.status === "released");
            const holidayName = getHolidayName(t.startDate);
            const familyMatchingMembers = targetType === "adult" ? adultPlayers : juniorChildren;

            const monthDate = new Date(t.startDate);
            const monthLabel = Number.isNaN(monthDate.getTime())
              ? ""
              : monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

            return (
              <div
                key={card.key}
                className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 rounded-lg p-4 space-y-3"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold text-[#F1F0EE] text-[14px]">{t.name}</div>
                      {monthLabel && (
                        <span className="inline-flex items-center rounded-md border border-[#34D399]/30 bg-[#34D399]/10 px-2 py-0.5 text-[11px] font-semibold text-[#34D399]">
                          {monthLabel}
                        </span>
                      )}
                      {isCancelled ? (
                        <span className="inline-flex items-center rounded-md border border-[#EF4444]/35 bg-[#EF4444]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#EF4444] uppercase">
                          Cancelled
                        </span>
                      ) : holidayName ? (
                        <span className="inline-flex items-center rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#FBBF24] uppercase">
                          Holiday
                        </span>
                      ) : null}
                      <span className="inline-flex items-center rounded-md border border-[#10B981]/30 bg-[#10B981]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#10B981] uppercase">
                        {targetType === "adult" ? "Adult" : "Junior"}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#8A8A98] font-mono font-light">
                      Coach {t.coach} · {t.location}
                      {familyMonthInvites.length > 0 && (
                        <span className="ml-1">
                          · {monthSessions.filter(ms => familyMonthInvites.some(inv => inv.trainingId === ms.id)).map(ms => new Date(ms.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={isCancelled ? "cancelled" : t.status} />
                </div>

                {isCancelled && familyMonthInvites.length === 0 && (
                  <div className="text-[11px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5 font-light">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[#EF4444]" />
                    <div className="space-y-0.5">
                      <div className="font-semibold text-[#EF4444]">Cancelled Reason:</div>
                      <div className="text-[#EF4444]/90 font-light">{cancelReason}</div>
                    </div>
                  </div>
                )}

                {canEnroll && familyMatchingMembers.length === 0 && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
                    <p className="text-[12px] text-muted-foreground">
                      {targetType === "adult"
                        ? "Add an adult family member to enroll."
                        : "Add a junior family member to enroll."}
                    </p>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="btn-premium-outline h-7 text-[11px] shrink-0"
                    >
                      <Link to="/members/add">
                        <Plus className="size-3.5 mr-1" /> Add family member
                      </Link>
                    </Button>
                  </div>
                )}

                {Array.from(memberInvitesMap.entries()).map(([memberId, mInvites]) => {
                  const member = s.members.find(m => m.id === memberId);
                  if (!member) return null;

                  const hasOpen = !isCancelled && mInvites.some(i => i.status === "open");
                  const isAllAccepted = mInvites.every(i => i.status === "accepted");
                  const displayStatus = isCancelled ? "cancelled" : isAllAccepted ? "accepted" : hasOpen ? "open" : mInvites[0].status;

                  const invitedMonthSessions = monthSessions.filter(ms =>
                    mInvites.some(i => i.trainingId === ms.id)
                  );

                  return (
                    <div key={memberId} className="pt-2.5 border-t border-white/[0.04] space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-[#F1F0EE] truncate">
                            <span className="text-[11px] text-[#8A8A98] font-normal mr-1.5">
                              {targetType === "adult" ? "Member:" : "Child:"}
                            </span>
                            {name(memberId)}
                          </div>
                          <div className="text-[11px] text-[#8A8A98]">
                            {invitedMonthSessions.length} invited session{invitedMonthSessions.length !== 1 ? "s" : ""} this month
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge kind="invitation" status={displayStatus} />
                          {hasOpen && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="btn-premium-solid h-7.5 px-3 text-[11px] font-semibold cursor-pointer"
                                onClick={() => {
                                  setBulkAcceptPopup({
                                    member,
                                    training: t,
                                    monthSessions,
                                    invitedMonthSessions,
                                    invites: mInvites.filter(i => i.status !== "accepted")
                                  });
                                }}
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="btn-premium-outline h-7.5 px-3 text-[11px] cursor-pointer"
                                onClick={async () => {
                                  try {
                                    await s.respondTrainingBulk(mInvites.map(i => i.id), "declined");
                                    toast.success("Declined invitation");
                                  } catch (error: any) {
                                    toast.error(error.message || "Failed to decline invitation.");
                                  }
                                }}
                              >
                                Decline
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Read-Only Attendance Status for Accepted Members */}
                      {isAllAccepted && !isCancelled && (
                        <div className="mt-4 bg-white dark:bg-[#1A2120] rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden shadow-sm">
                          <div className="px-3 py-2.5 border-b border-emerald-100 dark:border-white/5 bg-gradient-to-r from-emerald-50 to-transparent dark:from-emerald-500/10">
                            <h4 className="text-[11px] font-bold tracking-widest text-emerald-600 dark:text-emerald-400 uppercase flex items-center gap-2">
                              <CheckCircle2 className="size-3.5" />
                              Attendance Status
                            </h4>
                          </div>
                          <div className="p-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {invitedMonthSessions.map((ms) => {
                                const dateRec = s.trainingDates.find(
                                  (d) => d.trainingId === ms.id && d.memberId === memberId
                                );
                                const dateLabel = new Date(ms.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                                const isPresent = dateRec?.attended === true;
                                const isAbsent = dateRec?.attended === false;
                                const refundStatus = dateRec?.refundStatus;

                                return (
                                  <div key={ms.id} className="group flex items-center justify-between text-xs p-2 rounded-lg bg-gray-50 dark:bg-[#131916] border border-gray-100 dark:border-white/5 transition-colors hover:bg-gray-100 dark:hover:bg-[#1A2120] hover:border-gray-200 dark:hover:border-white/10">
                                    <div className="flex items-center gap-2.5">
                                      <div className={`size-1.5 rounded-full ${
                                        isPresent ? 'bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.5)]' :
                                        isAbsent ? 'bg-red-500 shadow-[0_0_8px_rgba(248,113,113,0.5)]' :
                                        'bg-zinc-400'
                                      }`} />
                                      <span className="text-gray-900 group-hover:text-black dark:text-[#E8E8E6] font-bold">{dateLabel}</span>
                                    </div>
                                    <div className="flex items-center">
                                      {isPresent ? (
                                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-100 dark:bg-emerald-400/10 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">Present</span>
                                      ) : isAbsent ? (
                                        refundStatus === "half" ? (
                                          <span className="text-purple-700 dark:text-purple-400 font-semibold bg-purple-100 dark:bg-purple-400/10 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">Absent (50% Refund)</span>
                                        ) : refundStatus === "full" ? (
                                          <span className="text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-100 dark:bg-emerald-400/10 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">Absent (Refunded)</span>
                                        ) : (
                                          <span className="text-red-700 dark:text-red-400 font-semibold bg-red-100 dark:bg-red-400/10 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">Absent</span>
                                        )
                                      ) : (
                                        <span className="text-zinc-500 dark:text-zinc-400 font-medium text-[10px] uppercase tracking-wider bg-gray-200 dark:bg-white/5 px-2 py-0.5 rounded">Pending</span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {isCancelled && familyMonthInvites.length > 0 && (
                        <div className="text-[11px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5 font-light">
                          <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[#EF4444]" />
                          <div className="space-y-0.5">
                            <div className="font-semibold text-[#EF4444]">Cancelled Reason:</div>
                            <div className="text-[#EF4444]/90 font-light">{cancelReason}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
