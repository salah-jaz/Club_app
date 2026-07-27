import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Send, CheckCircle2, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/trainings/$id/")({ component: TrainingPage });

function TrainingPage() {
  const { id } = Route.useParams();
  const user = useCurrentUser()!;
  const s = useStore();

  const t = s.trainings.find((x) => x.id === id);
  if (!t) return <Navigate to="/trainings" />;

  const parentId = t.parentId || t.id;
  const series = useMemo(() => {
    return s.trainings
      .filter((x) => (x.parentId || x.id) === parentId)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [s.trainings, parentId]);

  const repeatWeeks = Math.max(1, t.repeatWeeks || 3);
  const idx = series.findIndex((x) => x.id === id);
  const monthIdx = idx !== -1 ? Math.floor(idx / repeatWeeks) : 0;
  const monthSessions = useMemo(() => {
    return series.slice(monthIdx * repeatWeeks, (monthIdx + 1) * repeatWeeks);
  }, [series, monthIdx, repeatWeeks]);

  const monthDate = new Date(t.startDate);
  const monthName = Number.isNaN(monthDate.getTime())
    ? `Month ${monthIdx + 1}`
    : monthDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  const monthTitle = `Month ${monthIdx + 1} (${monthName})`;

  const sessionFee = t.fees / Math.max(monthSessions.length, 1);
  const targetType = t.targetType || "junior";

  const eligibleMembers = useMemo(() => {
    return s.members.filter(
      (m) =>
        m.memberType === targetType &&
        m.status === "active" &&
        (targetType === "adult" ? true : (m.trainingEligible ?? true)),
    );
  }, [s.members, targetType]);

  // Selected weekly date checkboxes per member
  const [memberSelectedDates, setMemberSelectedDates] = useState<Record<string, string[]>>({});

  const invitedSessions = useMemo(() => {
    const sessionIds = monthSessions.map((ms) => ms.id);
    const invitedSessionIds = new Set(
      s.trainingInvites
        .filter((i) => sessionIds.includes(i.trainingId))
        .map((i) => i.trainingId)
    );
    return monthSessions.filter((ms) => invitedSessionIds.has(ms.id));
  }, [monthSessions, s.trainingInvites]);

  const getSelectedDatesForMember = (memberId: string): string[] => {
    if (memberSelectedDates[memberId] !== undefined) {
      return memberSelectedDates[memberId];
    }
    const sessionIds = monthSessions.map((ms) => ms.id);
    const existingInvs = s.trainingInvites.filter(
      (i) => sessionIds.includes(i.trainingId) && i.memberId === memberId
    );
    if (existingInvs.length > 0) {
      return existingInvs.map((i) => i.trainingId);
    }
    return sessionIds;
  };

  const toggleMemberDate = (memberId: string, sessionId: string) => {
    const current = getSelectedDatesForMember(memberId);
    const updated = current.includes(sessionId)
      ? current.filter((sid) => sid !== sessionId)
      : [...current, sessionId];
    setMemberSelectedDates((prev) => ({ ...prev, [memberId]: updated }));
  };

  // Compute status for member across month sessions
  const getMemberStatus = (memberId: string): { statusLabel: string; kind: "default" | "invitation"; statusValue: string } => {
    const sessionIds = monthSessions.map((ms) => ms.id);
    const memberInvs = s.trainingInvites.filter(
      (i) => sessionIds.includes(i.trainingId) && i.memberId === memberId
    );
    if (memberInvs.length === 0) {
      return { statusLabel: "Not Sent", kind: "default", statusValue: "created" };
    }
    if (memberInvs.some((i) => i.status === "accepted")) {
      return { statusLabel: "Accepted", kind: "invitation", statusValue: "accepted" };
    }
    if (memberInvs.some((i) => i.status === "open" || i.status === "waiting")) {
      return { statusLabel: "Yet to Accept", kind: "invitation", statusValue: "open" };
    }
    return { statusLabel: "Sent", kind: "invitation", statusValue: "open" };
  };

  // Send action for member
  const handleSend = async (memberId: string, memberName: string) => {
    const selectedSids = getSelectedDatesForMember(memberId);
    if (selectedSids.length === 0) {
      toast.error("Please select at least one weekly session date.");
      return;
    }
    try {
      for (const sid of selectedSids) {
        await s.releaseTraining(sid, [memberId]);
      }
      const totalCharge = selectedSids.length * sessionFee;
      toast.success(
        `Invitations sent to ${memberName} for ${selectedSids.length} session(s) ($${totalCharge.toFixed(2)})`
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to send invitation.");
    }
  };

  // Force Accept action for member
  const handleForceAccept = async (memberId: string, memberName: string) => {
    const selectedSids = getSelectedDatesForMember(memberId);
    if (selectedSids.length === 0) {
      toast.error("Please select at least one weekly session date to force accept.");
      return;
    }
    try {
      for (const sid of selectedSids) {
        const inv = s.trainingInvites.find(
          (i) => i.trainingId === sid && i.memberId === memberId
        );
        if (inv) {
          await s.respondTraining(inv.id, "accepted");
        } else {
          await s.releaseTraining(sid, [memberId]);
          const newInv = s.trainingInvites.find(
            (i) => i.trainingId === sid && i.memberId === memberId
          );
          if (newInv) {
            await s.respondTraining(newInv.id, "accepted");
          }
        }
      }
      toast.success(`Force accepted invitations for ${memberName}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to force accept invitation.");
    }
  };

  const formattedDatePill = (startDateStr: string) => {
    const d = new Date(startDateStr);
    return Number.isNaN(d.getTime())
      ? startDateStr
      : d.toLocaleString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${t.name} - ${monthTitle}`}
        description={`Coach ${t.coach} · ${t.location} · Training For: ${targetType === "adult" ? "Adult" : "Junior"} · Monthly Fee: $${t.fees.toFixed(2)} ($${sessionFee.toFixed(2)}/session)`}
        backTo="/trainings"
        actions={<StatusBadge status={t.status} />}
      />

      <Tabs defaultValue="invite" className="w-full">
        <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex mb-6 h-10">
          <TabsTrigger
            value="invite"
            className="text-[13px] font-medium px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all"
          >
            Invitations
          </TabsTrigger>
          <TabsTrigger
            value="attendance"
            className="text-[13px] font-medium px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all"
          >
            Attendance
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Invitations */}
        <TabsContent value="invite" className="focus-visible:outline-none">
          <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
            <CardHeader className="pb-3 border-b border-white/[0.03]">
              <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
                Invitations Manager - {targetType === "adult" ? "Adult" : "Junior"} Roster
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-[#0C0F0E]/60">
                  <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 px-5 min-w-[160px]">
                      Member
                    </TableHead>
                    {monthSessions.map((ms) => (
                      <TableHead
                        key={ms.id}
                        className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 text-center font-mono px-3"
                      >
                        {formattedDatePill(ms.startDate)}
                        <span className="block text-[9px] text-[#34D399] font-normal">
                          (${sessionFee.toFixed(0)})
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 text-center px-4">
                      Status
                    </TableHead>
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 text-center px-4">
                      Action
                    </TableHead>
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 text-right px-5">
                      Force Accept
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligibleMembers.map((m) => {
                    const sessionIds = monthSessions.map((ms) => ms.id);
                    const memberInvs = s.trainingInvites.filter(
                      (i) => sessionIds.includes(i.trainingId) && i.memberId === m.id
                    );
                    const hasSent = memberInvs.length > 0;
                    const selectedSids = getSelectedDatesForMember(m.id);
                    const memberName = `${m.firstName} ${m.lastName}`;
                    const statusInfo = getMemberStatus(m.id);

                    return (
                      <TableRow
                        key={m.id}
                        className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors"
                      >
                        <TableCell className="font-semibold text-[#F1F0EE] text-[13px] px-5 py-4 min-w-[160px]">
                          <div>{memberName}</div>
                          {m.memberType === "junior" && (
                            <div className="text-[11px] text-[#8A8A98] font-light">Grade {m.grade}</div>
                          )}
                        </TableCell>

                        {/* Weekly session checkbox columns */}
                        {monthSessions.map((ms) => {
                          const isChecked = hasSent
                            ? memberInvs.some((i) => i.trainingId === ms.id)
                            : selectedSids.includes(ms.id);
                          return (
                            <TableCell key={ms.id} className="text-center py-4 px-3">
                              <Checkbox
                                checked={isChecked}
                                disabled={hasSent}
                                onCheckedChange={() => toggleMemberDate(m.id, ms.id)}
                                className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981] disabled:opacity-60"
                              />
                            </TableCell>
                          );
                        })}

                        {/* Status Column */}
                        <TableCell className="text-center px-4 py-4">
                          <StatusBadge kind={statusInfo.kind} status={statusInfo.statusValue as any} />
                        </TableCell>

                        {/* Action Column - Send Button */}
                        <TableCell className="text-center px-4 py-4">
                          <Button
                            size="sm"
                            disabled={hasSent || selectedSids.length === 0}
                            className={cn(
                              "h-8 text-[11px] px-3",
                              hasSent
                                ? "bg-white/5 text-[#8A8A9A] border border-white/10 cursor-not-allowed hover:bg-white/5"
                                : "btn-premium-solid cursor-pointer"
                            )}
                            onClick={() => handleSend(m.id, memberName)}
                          >
                            <Send className="size-3 mr-1" /> {hasSent ? "Sent" : "Send"}
                          </Button>
                        </TableCell>

                        {/* Force Accept Column */}
                        <TableCell className="text-right px-5 py-4">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={hasSent && memberInvs.every((i) => i.status === "accepted")}
                            className="btn-premium-outline h-8 text-[11px] px-3 cursor-pointer border-[#10B981]/30 hover:bg-[#10B981]/10 text-[#34D399] disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => handleForceAccept(m.id, memberName)}
                          >
                            <UserCheck className="size-3 mr-1" /> Force Accept
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {eligibleMembers.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={monthSessions.length + 4}
                        className="text-center text-[#4A5E58] py-10 font-light text-[13px]"
                      >
                        No active eligible {targetType} members found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Attendance */}
        <TabsContent value="attendance" className="focus-visible:outline-none">
          <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
            <CardHeader className="pb-3 border-b border-white/[0.03]">
              <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
                Attendance Matrix ({invitedSessions.length} invited weekly session{invitedSessions.length === 1 ? "" : "s"})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {invitedSessions.length === 0 ? (
                <div className="text-center text-[#8A8A98] py-12 text-[13px] font-light">
                  No invitations have been sent for this training program yet. Send invitations from the Invitations tab to manage attendance.
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-[#0C0F0E]/60">
                    <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                      <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 px-5 min-w-[160px]">
                        Member
                      </TableHead>
                      {invitedSessions.map((ms) => (
                        <TableHead
                          key={ms.id}
                          className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 text-center font-mono px-4"
                        >
                          {formattedDatePill(ms.startDate)}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {eligibleMembers.map((m) => {
                      const memberName = `${m.firstName} ${m.lastName}`;

                      return (
                        <TableRow
                          key={m.id}
                          className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors"
                        >
                          <TableCell className="font-semibold text-[#F1F0EE] text-[13px] px-5 py-4 min-w-[160px]">
                            {memberName}
                          </TableCell>

                          {/* Weekly session attendance checkboxes */}
                          {invitedSessions.map((ms) => {
                            const isInvited = s.trainingInvites.some(
                              (i) => i.trainingId === ms.id && i.memberId === m.id
                            );
                            const dateRec = s.trainingDates.find(
                              (d) => d.trainingId === ms.id && d.memberId === m.id
                            );
                            const isPresent = dateRec?.attended === true;

                            if (!isInvited) {
                              return (
                                <TableCell key={ms.id} className="text-center py-4 px-4 text-[#8A8A98] text-[12px]">
                                  -
                                </TableCell>
                              );
                            }

                            return (
                              <TableCell key={ms.id} className="text-center py-4 px-4">
                                <Checkbox
                                  checked={isPresent}
                                  onCheckedChange={async (checked) => {
                                    try {
                                      if (dateRec) {
                                        await s.markAttendance(dateRec.id, !!checked);
                                      }
                                    } catch (error: any) {
                                      toast.error(error.message || "Failed to mark attendance.");
                                    }
                                  }}
                                  className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981]"
                                />
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })}
                    {eligibleMembers.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={invitedSessions.length + 1}
                          className="text-center text-[#4A5E58] py-10 font-light text-[13px]"
                        >
                          No active eligible {targetType} members found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
