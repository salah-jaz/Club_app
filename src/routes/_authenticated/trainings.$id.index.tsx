import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Send, UserCheck, AlertTriangle, Lock, RefreshCw, CheckCircle2, XCircle, RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtMoney } from "@/lib/format";
import { applyMemberFee, discountsFromStore, resolveWalletMember } from "@/lib/fees";
import { useNow } from "@/hooks/useNow";
import { aggregateOpenInvitePhase, resolveTrainingDisplayStatus } from "@/lib/sessionTiming";
import {
  ConfirmActionDialog,
  type ConfirmActionRequest,
} from "@/components/ConfirmActionDialog";
import type { Member, Training } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/trainings/$id/")({ component: TrainingPage });

function TrainingPage() {
  const { id } = Route.useParams();
  const user = useCurrentUser()!;
  const s = useStore();
  const now = useNow();

  const t = s.trainings.find((x) => x.id === id);
  if (!t) return <Navigate to="/trainings" />;

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  // Refund dialog state — Absent opens this; user picks refund type then confirms
  const [refundDialog, setRefundDialog] = useState<{
    dateId: string;
    memberName: string;
    dateFormatted: string;
    weeklyFee: number;
    refundType: "none" | "half" | "full";
    refundAmountAlready?: number;
  } | null>(null);
  const [processingRefund, setProcessingRefund] = useState(false);

  // Overpayment Refund dialog state
  const [overpaymentRefundDialog, setOverpaymentRefundDialog] = useState<{
    member: Member;
    refundAmount: number;
  } | null>(null);
  const [processingOverpaymentRefund, setProcessingOverpaymentRefund] = useState(false);

  // Send Update Request Dialog state
  const [sendUpdateDialog, setSendUpdateDialog] = useState<{
    member: Member;
    existingSessions: Training[];
    newSessions: Training[];
    previouslyPaidAmount: number;
    updatedMonthlyFee: number;
    newPerSessionFee: number;
    additionalAmount: number;
  } | null>(null);
  const [sendingUpdate, setSendingUpdate] = useState(false);
  const [actionRequest, setActionRequest] = useState<ConfirmActionRequest | null>(null);

  const handleCancelTraining = async () => {
    if (!cancelReason.trim()) return;
    setCancelling(true);
    try {
      await s.cancelTraining(t.id, cancelReason.trim());
      toast.success("Training program cancelled and member fees refunded.");
      setCancelDialogOpen(false);
      setCancelReason("");
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel training program.");
    } finally {
      setCancelling(false);
    }
  };

  const parentId = t.parentId || t.id;
  const series = useMemo(() => {
    return s.trainings
      .filter((x) => (x.parentId || x.id) === parentId)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [s.trainings, parentId]);

  const repeatWeeks = Math.max(1, Math.min(5, t.repeatWeeks || 3));
  const tDate = new Date(t.startDate);

  const monthGroups = useMemo(() => {
    const map: Record<string, typeof series> = {};
    for (const session of series) {
      const d = new Date(session.startDate);
      if (Number.isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map[key]) map[key] = [];
      map[key].push(session);
    }
    return map;
  }, [series]);

  const monthKeys = useMemo(() => Object.keys(monthGroups).sort(), [monthGroups]);
  const currentMonthKey = Number.isNaN(tDate.getTime())
    ? monthKeys[0]
    : `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, "0")}`;
  const monthIdx = Math.max(0, monthKeys.indexOf(currentMonthKey));

  const monthSessions = useMemo(() => {
    return monthGroups[currentMonthKey] || [t];
  }, [monthGroups, currentMonthKey, t]);

  const monthDate = new Date(t.startDate);
  const monthName = Number.isNaN(monthDate.getTime())
    ? `Month ${monthIdx + 1}`
    : monthDate.toLocaleString("en-US", { month: "long", year: "numeric" });
  const monthTitle = `Month ${monthIdx + 1} (${monthName})`;

  const sessionFee = t.fees / repeatWeeks;
  const targetType = t.targetType || "junior";

  const eligibleMembers = useMemo(() => {
    return s.members.filter(
      (m) =>
        m.memberType === targetType &&
        m.status === "active" &&
        Boolean(m.trainingEligible),
    );
  }, [s.members, targetType]);

  const [memberSearch, setMemberSearch] = useState("");

  const filteredEligibleMembers = useMemo(() => {
    const term = memberSearch.trim().toLowerCase();
    if (!term) return eligibleMembers;

    return eligibleMembers.filter((m) => {
      const name = `${m.firstName} ${m.lastName}`.toLowerCase();
      const grade = String(m.grade ?? "").toLowerCase();
      const parent = m.parentMemberId
        ? s.members.find((x) => x.id === m.parentMemberId)
        : null;
      const parentName = parent
        ? `${parent.firstName} ${parent.lastName}`.toLowerCase()
        : "";
      return (
        name.includes(term) ||
        grade.includes(term) ||
        parentName.includes(term)
      );
    });
  }, [eligibleMembers, memberSearch, s.members]);

  // Selected weekly date checkboxes per member
  const [memberSelectedDates, setMemberSelectedDates] = useState<Record<string, string[]>>({});

  const getSelectedDatesForMember = (memberId: string): string[] => {
    if (memberSelectedDates[memberId] !== undefined) {
      return memberSelectedDates[memberId];
    }
    const sessionIds = monthSessions.map((ms) => ms.id);
    const existingInvs = s.trainingInvites.filter(
      (i) => sessionIds.includes(i.trainingId) && i.memberId === memberId
    );
    if (existingInvs.length > 0) {
      const activeSids = existingInvs
        .filter((i) => i.status === "open" || i.status === "accepted" || i.status === "pending" || i.status === "waiting")
        .map((i) => i.trainingId);
      if (activeSids.length > 0) {
        return activeSids;
      }
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
  const getMemberStatus = (memberId: string): { statusLabel: string; kind: "default" | "invitation"; statusValue: string; isAccepted: boolean; isSentYetToAccept: boolean } => {
    const sessionIds = monthSessions.map((ms) => ms.id);
    const memberInvs = s.trainingInvites.filter(
      (i) => sessionIds.includes(i.trainingId) && i.memberId === memberId
    );
    if (memberInvs.length === 0 || memberInvs.every((i) => i.status === "pending")) {
      return { statusLabel: "Pending", kind: "invitation", statusValue: "pending", isAccepted: false, isSentYetToAccept: false };
    }
    if (memberInvs.some((i) => i.status === "accepted")) {
      return { statusLabel: "Accepted", kind: "invitation", statusValue: "accepted", isAccepted: true, isSentYetToAccept: false };
    }
    if (memberInvs.some((i) => i.status === "open" || i.status === "waiting")) {
      return { statusLabel: "Yet to Accept", kind: "invitation", statusValue: "open", isAccepted: false, isSentYetToAccept: true };
    }
    return { statusLabel: "Pending", kind: "invitation", statusValue: "pending", isAccepted: false, isSentYetToAccept: false };
  };

  // Send or Update invitation action for member
  const handleSendOrUpdate = async (memberId: string, memberName: string, isUpdate: boolean) => {
    const selectedSids = getSelectedDatesForMember(memberId);
    if (selectedSids.length === 0) {
      toast.error("Please select at least one weekly session date.");
      return;
    }
    const m = s.members.find((x) => x.id === memberId);
    const memberDiscountedMonthlyFee = applyMemberFee(t.fees, m, discountsFromStore(s));
    const memberPerWeekFee = memberDiscountedMonthlyFee / repeatWeeks;
    const totalCharge = selectedSids.length * memberPerWeekFee;
    try {
      await s.updateMemberTrainingInvitation(t.id, memberId, selectedSids);
      toast.success(
        isUpdate
          ? `Invitation updated for ${memberName} (${selectedSids.length} week(s), ${fmtMoney(totalCharge)})`
          : `Invitation sent to ${memberName} for ${selectedSids.length} week(s) (${fmtMoney(totalCharge)})`
      );
    } catch (error: any) {
      toast.error(error.message || "Failed to send invitation.");
    }
  };

  // Force Accept action for member (admin override — may take wallet negative)
  const handleForceAccept = async (memberId: string, memberName: string) => {
    const selectedSids = getSelectedDatesForMember(memberId);
    if (selectedSids.length === 0) {
      toast.error("Please select at least one weekly session date to force accept.");
      return;
    }

    const member = s.members.find((m) => m.id === memberId);
    if (!member) {
      toast.error("Member not found.");
      return;
    }

    const memberPerWeekFee = applyMemberFee(t.fees, member, discountsFromStore(s)) / repeatWeeks;
    const totalCharge = Math.round(selectedSids.length * memberPerWeekFee * 100) / 100;
    const walletRef = resolveWalletMember(member, s.members);
    const walletMember = s.members.find((m) => m.id === walletRef.id) ?? member;
    const walletBalance = walletMember.credit ?? 0;
    const willGoNegative =
      !walletMember.skipCreditConsumption && totalCharge > 0 && walletBalance < totalCharge;
    const balanceAfter = Math.round((walletBalance - totalCharge) * 100) / 100;

    const runForceAccept = async () => {
      try {
        await s.updateMemberTrainingInvitation(t.id, memberId, selectedSids, true);
        toast.success(
          willGoNegative
            ? `Force accepted for ${memberName}. Wallet is now ${fmtMoney(balanceAfter)}.`
            : `Force accepted training invitation for ${memberName}`,
        );
      } catch (error: any) {
        toast.error(error.message || "Failed to force accept invitation.");
        throw error;
      }
    };

    if (willGoNegative) {
      setActionRequest({
        title: "Force accept with insufficient balance?",
        description: (
          <>
            <p>
              <strong className="text-[#F1F0EE]">{memberName}</strong> wallet balance is{" "}
              <span className="font-mono text-[#FBBF24]">{fmtMoney(walletBalance)}</span>, but
              this acceptance costs{" "}
              <span className="font-mono text-[#F1F0EE]">{fmtMoney(totalCharge)}</span>.
            </p>
            <p>
              Force Accept will debit the fee and leave the wallet at{" "}
              <span className="font-mono text-[#EF4444]">{fmtMoney(balanceAfter)}</span>{" "}
              (negative balance).
            </p>
          </>
        ),
        confirmLabel: "Force Accept",
        onConfirm: runForceAccept,
      });
      return;
    }

    await runForceAccept();
  };

  const openAbsentRefundDialog = (
    dateId: string,
    memberName: string,
    dateFormatted: string,
    weeklyFee: number,
  ) => {
    setRefundDialog({
      dateId,
      memberName,
      dateFormatted,
      weeklyFee,
      refundType: "none",
    });
  };

  const handleProcessRefundSubmit = async () => {
    if (!refundDialog) return;
    setProcessingRefund(true);
    try {
      await s.markAttendance(refundDialog.dateId, false);
      await s.processTrainingRefund(refundDialog.dateId, refundDialog.refundType);
      const typeLabel =
        refundDialog.refundType === "half"
          ? "50% Refund"
          : refundDialog.refundType === "full"
            ? "Full Refund"
            : "No Refund";
      toast.success(`${typeLabel} confirmed for ${refundDialog.memberName} (Absent).`);
      setRefundDialog(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to process refund.");
    } finally {
      setProcessingRefund(false);
    }
  };

  const handleMarkPresent = (
    dateRec: { id: string; refundStatus?: "none" | "half" | "full" | null; refundAmount?: number | null },
    memberName: string,
    dateFormatted: string,
  ) => {
    const refundStatus = dateRec.refundStatus ?? null;
    const refundAmount = dateRec.refundAmount ?? 0;

    const runPresent = async () => {
      try {
        await s.markAttendance(dateRec.id, true);
        toast.success(
          refundStatus === "half" || refundStatus === "full"
            ? `Marked Present for ${memberName}. Refund of ${fmtMoney(refundAmount)} was reversed.`
            : `Marked Present for ${memberName}.`,
        );
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : "Failed to mark attendance.");
        throw error;
      }
    };

    if (refundStatus === "half" || refundStatus === "full") {
      setActionRequest({
        title: "Mark Present after refund?",
        description: (
          <>
            <p>
              <strong className="text-[#F1F0EE]">{memberName}</strong> already received a{" "}
              {refundStatus === "half" ? "50%" : "full"} refund (
              <span className="font-mono text-[#34D399]">{fmtMoney(refundAmount)}</span>) for{" "}
              <strong className="text-[#F1F0EE]">{dateFormatted}</strong>.
            </p>
            <p>
              Marking Present will <strong className="text-[#FBBF24]">reverse that refund</strong>{" "}
              (debit the wallet again) and clear the absent status.
            </p>
          </>
        ),
        confirmLabel: "Mark Present & Reverse Refund",
        destructive: true,
        onConfirm: runPresent,
      });
      return;
    }

    void runPresent();
  };

  const handleOverpaymentRefundSubmit = async () => {
    if (!overpaymentRefundDialog) return;
    setProcessingOverpaymentRefund(true);
    try {
      const res = await s.processOverpaymentRefund(
        t.id,
        overpaymentRefundDialog.member.id,
        overpaymentRefundDialog.refundAmount
      );
      toast.success(res.message || `Refund of ${fmtMoney(overpaymentRefundDialog.refundAmount)} credited to wallet.`);
      setOverpaymentRefundDialog(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to process overpayment refund.");
    } finally {
      setProcessingOverpaymentRefund(false);
    }
  };

  const handleSendUpdateRequestSubmit = async () => {
    if (!sendUpdateDialog) return;
    setSendingUpdate(true);
    try {
      await s.sendTrainingUpdateRequest(
        t.id,
        sendUpdateDialog.member.id,
        sendUpdateDialog.existingSessions.map((x) => x.id),
        sendUpdateDialog.newSessions.map((x) => x.id),
        sendUpdateDialog.additionalAmount,
        sendUpdateDialog.previouslyPaidAmount,
        sendUpdateDialog.updatedMonthlyFee,
        sendUpdateDialog.newPerSessionFee,
      );
      toast.success(
        `Training update request sent to ${sendUpdateDialog.member.firstName} ${sendUpdateDialog.member.lastName}.`
      );
      setSendUpdateDialog(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to send training update request.");
    } finally {
      setSendingUpdate(false);
    }
  };

  const formattedDatePill = (startDateStr: string) => {
    const d = new Date(startDateStr);
    return Number.isNaN(d.getTime())
      ? startDateStr
      : d.toLocaleString("en-US", { month: "short", day: "numeric" });
  };

  const sessionPhase =
    t.status !== "cancelled" ? aggregateOpenInvitePhase(monthSessions, now) : null;

  const getInviteRowData = (m: Member) => {
    const sessionIds = monthSessions.map((ms) => ms.id);
    const memberInvs = s.trainingInvites.filter(
      (i) => sessionIds.includes(i.trainingId) && i.memberId === m.id
    );
    const statusInfo = getMemberStatus(m.id);
    const isAccepted = statusInfo.isAccepted;
    const isSentYetToAccept = statusInfo.isSentYetToAccept;

    const acceptedInvs = memberInvs.filter((i) => i.status === "accepted");
    const acceptedSessionIds = acceptedInvs.map((i) => i.trainingId);
    const existingAcceptedSessions = monthSessions.filter((ms) => acceptedSessionIds.includes(ms.id));
    const unacceptedMonthSessions = monthSessions.filter((ms) => !acceptedSessionIds.includes(ms.id));
    const hasUnacceptedSessions = isAccepted && unacceptedMonthSessions.length > 0;

    const memberUpdateReq = (s.trainingUpdateRequests ?? []).find(
      (ur) => (ur.trainingId === t.id || ur.trainingId === parentId) && ur.memberId === m.id
    );
    const isUpdatePending = memberUpdateReq?.status === "pending";
    const isUpdateDeclined = memberUpdateReq?.status === "declined";

    const selectedSids = getSelectedDatesForMember(m.id);
    const memberName = `${m.firstName} ${m.lastName}`;
    const parentMember = m.parentMemberId
      ? s.members.find((x) => x.id === m.parentMemberId)
      : null;
    const parentName = parentMember
      ? `${parentMember.firstName} ${parentMember.lastName}`
      : null;

    // Fee for member after member discount if applicable
    const baseMemberWeekFee = applyMemberFee(t.fees, m, discountsFromStore(s)) / repeatWeeks;

    const getInvPaidAmount = (inv: (typeof acceptedInvs)[number]) => {
      if (inv.acceptedAmount !== undefined && inv.acceptedAmount !== null) {
        return inv.acceptedAmount;
      }
      if (inv.acceptedPerSessionFee !== undefined && inv.acceptedPerSessionFee !== null) {
        return inv.acceptedPerSessionFee;
      }
      if (inv.acceptedMonthlyFee && inv.acceptedRepeatWeeks) {
        return inv.acceptedMonthlyFee / inv.acceptedRepeatWeeks;
      }
      return baseMemberWeekFee;
    };

    const initialOrPreviousPaid = acceptedInvs.reduce(
      (acc, i) => acc + getInvPaidAmount(i),
      0
    );

    const acceptedUpdateReq = (s.trainingUpdateRequests ?? [])
      .filter((ur) => (ur.trainingId === t.id || ur.trainingId === parentId) && ur.memberId === m.id && ur.status === "accepted")
      .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())[0];

    const totalAlreadyPaid = acceptedUpdateReq
      ? (acceptedUpdateReq.updatedMonthlyFee ?? ((acceptedUpdateReq.previouslyPaidAmount ?? 0) + (acceptedUpdateReq.additionalAmount ?? 0)))
      : initialOrPreviousPaid;

    const updatedMonthlyFeeVal = applyMemberFee(t.fees, m, discountsFromStore(s));

    let targetTotalFee: number;
    if (isAccepted) {
      if (acceptedInvs.length >= repeatWeeks) {
        targetTotalFee = updatedMonthlyFeeVal;
      } else {
        targetTotalFee = totalAlreadyPaid;
      }
    } else {
      targetTotalFee = selectedSids.length === repeatWeeks
        ? updatedMonthlyFeeVal
        : Math.round(selectedSids.length * baseMemberWeekFee * 100) / 100;
    }

    const remainingPayable = Math.round((targetTotalFee - totalAlreadyPaid) * 100) / 100;
    const totalPayable = isAccepted ? remainingPayable : targetTotalFee;
    const countWeeksDisplay = isAccepted ? acceptedInvs.length : selectedSids.length;

    const additionalAmountForUpdate = unacceptedMonthSessions.length * baseMemberWeekFee;

    return {
      memberInvs,
      statusInfo,
      isAccepted,
      isSentYetToAccept,
      acceptedInvs,
      acceptedSessionIds,
      existingAcceptedSessions,
      unacceptedMonthSessions,
      hasUnacceptedSessions,
      isUpdatePending,
      isUpdateDeclined,
      selectedSids,
      memberName,
      parentName,
      baseMemberWeekFee,
      totalAlreadyPaid,
      remainingPayable,
      totalPayable,
      countWeeksDisplay,
      additionalAmountForUpdate,
    };
  };

  return (
    <div className="space-y-6">
      <ConfirmActionDialog
        request={actionRequest}
        onOpenChange={(open) => !open && setActionRequest(null)}
      />
      <PageHeader
        title={`${t.name} - ${monthTitle}`}
        description={`Coach ${t.coach} · ${t.location} · Training For: ${targetType === "adult" ? "Adult" : "Junior"} · Monthly Fee: ${fmtMoney(t.fees)} (${fmtMoney(sessionFee)}/session)`}
        backTo="/trainings"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={resolveTrainingDisplayStatus(t.status, sessionPhase)} />
            {t.status !== "closed" && t.status !== "cancelled" && user.role === "admin" && (
              <Button
                variant="outline"
                className="bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/20 hover:text-white h-9 px-4 text-xs font-semibold cursor-pointer w-full sm:w-auto"
                onClick={() => setCancelDialogOpen(true)}
              >
                Cancel Training
              </Button>
            )}
          </div>
        }
      />

      <Dialog
        open={cancelDialogOpen}
        onOpenChange={(open) => {
          if (!open && !cancelling) {
            setCancelDialogOpen(false);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">Cancel Training Program</DialogTitle>
            <DialogDescription className="text-[#C4D4CF] text-xs">
              Enter a reason for cancelling <strong className="text-[#F1F0EE]">“{t.name}”</strong>. Members will be notified and any paid fees will be refunded automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs font-medium text-[#C4D4CF]">
              Reason <span className="text-red-400">*</span>
            </Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter cancellation reason (e.g. Coach unavailable, Court maintenance)..."
              rows={3}
              className="bg-[#1A2120] border-[rgba(255,255,255,0.1)] text-white text-xs placeholder:text-[#64748B] focus:border-[#EF4444]"
            />
            {!cancelReason.trim() && (
              <p className="text-[11px] text-red-400 font-light">Reason is required to cancel this training program.</p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="btn-premium-outline cursor-pointer text-xs"
              disabled={cancelling}
              onClick={() => {
                setCancelDialogOpen(false);
                setCancelReason("");
              }}
            >
              Close
            </Button>
            <Button
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white cursor-pointer text-xs font-semibold"
              disabled={!cancelReason.trim() || cancelling}
              onClick={() => void handleCancelTraining()}
            >
              {cancelling ? "Cancelling…" : "Cancel Training"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Absent → choose refund in popup (mobile + desktop) */}
      <Dialog open={!!refundDialog} onOpenChange={(open) => !open && !processingRefund && setRefundDialog(null)}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">Mark Absent & Choose Refund</DialogTitle>
            <DialogDescription className="text-[#C4D4CF] text-xs">
              Confirm absence for <strong className="text-white">{refundDialog?.memberName}</strong> on{" "}
              <strong className="text-white">{refundDialog?.dateFormatted}</strong>, then choose a refund option.
            </DialogDescription>
          </DialogHeader>

          {refundDialog && (
            <div className="space-y-3 py-1 text-xs">
              <div className="p-3 rounded-lg bg-[#1A2120] border border-white/5 flex justify-between">
                <span className="text-[#8A8A98]">Weekly session fee</span>
                <span className="font-mono text-white">{fmtMoney(refundDialog.weeklyFee)}</span>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold tracking-[0.12em] text-[#8A8A98] uppercase">
                  Refund option
                </div>
                {(
                  [
                    { type: "none" as const, label: "No Refund", amount: 0, className: "border-white/15 data-[active=true]:border-white/40 data-[active=true]:bg-white/[0.06]" },
                    { type: "half" as const, label: "50% Refund", amount: refundDialog.weeklyFee * 0.5, className: "border-violet-500/30 data-[active=true]:border-violet-400/60 data-[active=true]:bg-violet-500/15" },
                    { type: "full" as const, label: "Full Refund", amount: refundDialog.weeklyFee, className: "border-emerald-500/30 data-[active=true]:border-emerald-400/60 data-[active=true]:bg-emerald-500/15" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.type}
                    type="button"
                    data-active={refundDialog.refundType === opt.type}
                    onClick={() => setRefundDialog({ ...refundDialog, refundType: opt.type })}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 py-3 rounded-lg border text-left cursor-pointer transition-colors",
                      opt.className,
                    )}
                  >
                    <span className="font-semibold text-[13px] text-[#F1F0EE]">{opt.label}</span>
                    <span className="font-mono text-[12px] text-[#C4D4CF]">{fmtMoney(opt.amount)}</span>
                  </button>
                ))}
              </div>

              <p className="text-[11px] text-[#8A8A98] font-light leading-relaxed">
                {refundDialog.refundType === "none"
                  ? "Marked Absent with no wallet credit. Refund choice is locked after confirm."
                  : "Credits are added to the wallet immediately. Refund choice is locked after confirm."}
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="btn-premium-outline cursor-pointer text-xs"
              disabled={processingRefund}
              onClick={() => setRefundDialog(null)}
            >
              Cancel
            </Button>
            <Button
              className={cn(
                "cursor-pointer text-xs font-semibold text-white",
                refundDialog?.refundType === "half"
                  ? "bg-purple-600 hover:bg-purple-700"
                  : refundDialog?.refundType === "full"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-rose-600 hover:bg-rose-700",
              )}
              disabled={processingRefund}
              onClick={() => void handleProcessRefundSubmit()}
            >
              {processingRefund ? "Processing…" : "Confirm Absent"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overpayment Refund Confirmation Dialog */}
      <Dialog open={!!overpaymentRefundDialog} onOpenChange={(open) => !open && setOverpaymentRefundDialog(null)}>
        <DialogContent className="bg-[#131916] border border-white/10 text-[#F1F0EE] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE] flex items-center gap-2">
              <RotateCcw className="size-5 text-[#A78BFA]" />
              Issue Overpayment Wallet Refund
            </DialogTitle>
            <DialogDescription className="text-[#8A8A98]">
              Process an overpayment refund to the member's wallet balance.
            </DialogDescription>
          </DialogHeader>

          {overpaymentRefundDialog && (
            <div className="space-y-4 py-2 text-xs">
              <div className="bg-[#1A2120] p-3 rounded-lg border border-white/5 space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#8A8A98]">Member Name:</span>
                  <span className="font-medium text-[#F1F0EE]">{overpaymentRefundDialog.member.firstName} {overpaymentRefundDialog.member.lastName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8A8A98]">Training Program:</span>
                  <span className="font-medium text-[#F1F0EE]">{t.name}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-white/10 font-semibold text-sm">
                  <span className="text-[#A78BFA]">Wallet Refund Amount:</span>
                  <span className="text-[#A78BFA]">{fmtMoney(overpaymentRefundDialog.refundAmount)}</span>
                </div>
              </div>
              <p className="text-[11px] text-[#8A8A98] italic">
                This will credit {fmtMoney(overpaymentRefundDialog.refundAmount)} directly back into {overpaymentRefundDialog.member.firstName}'s account wallet balance.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              disabled={processingOverpaymentRefund}
              onClick={() => setOverpaymentRefundDialog(null)}
              className="btn-premium-outline text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={processingOverpaymentRefund}
              onClick={handleOverpaymentRefundSubmit}
              className="bg-[#8B5CF6] hover:bg-[#7C3AED] text-white text-xs font-semibold cursor-pointer"
            >
              {processingOverpaymentRefund ? "Processing…" : "Confirm & Credit Wallet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Update Request Dialog */}
      <Dialog open={!!sendUpdateDialog} onOpenChange={(open) => !open && setSendUpdateDialog(null)}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">Send Training Update Request</DialogTitle>
            <DialogDescription className="text-[#C4D4CF] text-xs">
              Send an update request to <strong className="text-white">{sendUpdateDialog?.member.firstName} {sendUpdateDialog?.member.lastName}</strong> for modified sessions in <strong className="text-white">{t.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          {sendUpdateDialog && (
            <div className="space-y-4 py-2 text-xs">
              {/* Existing Accepted Sessions */}
              <div className="p-3 rounded-lg bg-[#1A2120] border border-white/5 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#8A8A98]">
                  Existing Accepted Sessions
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {sendUpdateDialog.existingSessions.map((sItem) => (
                    <span key={sItem.id} className="inline-flex items-center gap-1 text-[11px] font-medium bg-[#10B981]/10 text-[#34D399] px-2 py-0.5 rounded border border-[#10B981]/20">
                      <CheckCircle2 className="size-3" /> {formattedDatePill(sItem.startDate)}
                    </span>
                  ))}
                  {sendUpdateDialog.existingSessions.length === 0 && (
                    <span className="text-[11px] text-[#8A8A98]">None</span>
                  )}
                </div>
              </div>

              {/* Newly Added Sessions */}
              <div className="p-3 rounded-lg bg-[#1A2120] border border-white/5 space-y-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#3B82F6]">
                  Newly Added Sessions
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {sendUpdateDialog.newSessions.map((sItem) => (
                    <span key={sItem.id} className="inline-flex items-center gap-1 text-[11px] font-medium bg-[#3B82F6]/10 text-[#60A5FA] px-2 py-0.5 rounded border border-[#3B82F6]/20">
                      + {formattedDatePill(sItem.startDate)} ({fmtMoney(sendUpdateDialog.newPerSessionFee)})
                    </span>
                  ))}
                  {sendUpdateDialog.newSessions.length === 0 && (
                    <span className="text-[11px] text-[#8A8A98]">No additional session dates</span>
                  )}
                </div>
              </div>

              {/* Payment Summary */}
              <div className="p-3.5 rounded-lg bg-[#1A2120] border border-white/10 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#34D399]">
                  Payment Summary
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-[#8A8A98]">
                    <span>Previously Paid Amount</span>
                    <span className="font-mono text-[#F1F0EE]">{fmtMoney(sendUpdateDialog.previouslyPaidAmount)}</span>
                  </div>

                  <div className="flex justify-between text-[#8A8A98]">
                    <span>Updated Monthly Fee</span>
                    <span className="font-mono text-[#F1F0EE]">{fmtMoney(sendUpdateDialog.updatedMonthlyFee)}</span>
                  </div>

                  <div className="flex justify-between text-[#8A8A98]">
                    <span>New Per Session Fee</span>
                    <span className="font-mono text-[#F1F0EE]">{fmtMoney(sendUpdateDialog.newPerSessionFee)}</span>
                  </div>

                  <div className="pt-2 border-t border-white/10 flex justify-between items-center font-semibold">
                    <span>
                      {sendUpdateDialog.additionalAmount < 0
                        ? "Refund Amount (To Member Wallet)"
                        : "Additional Payable Amount"}
                    </span>
                    <span className={cn(
                      "font-mono text-base font-bold",
                      sendUpdateDialog.additionalAmount > 0
                        ? "text-[#34D399]"
                        : sendUpdateDialog.additionalAmount < 0
                        ? "text-[#A78BFA]"
                        : "text-[#8A8A98]"
                    )}>
                      {sendUpdateDialog.additionalAmount < 0
                        ? `-${fmtMoney(Math.abs(sendUpdateDialog.additionalAmount))}`
                        : fmtMoney(sendUpdateDialog.additionalAmount)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-[#8A8A98] font-light leading-relaxed">
                {sendUpdateDialog.additionalAmount < 0
                  ? "Sending this update request will notify the member. When accepted, the refund amount will be credited back to their wallet."
                  : sendUpdateDialog.additionalAmount > 0
                  ? "Sending this update request will notify the member. The new sessions will be added and the additional amount will be debited from their wallet only if the member accepts."
                  : "Sending this update request will notify the member. The new sessions will be added with no additional payment required."}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              className="btn-premium-outline cursor-pointer text-xs"
              disabled={sendingUpdate}
              onClick={() => setSendUpdateDialog(null)}
            >
              Cancel
            </Button>
            <Button
              className="btn-premium-solid cursor-pointer text-xs font-semibold"
              disabled={sendingUpdate}
              onClick={handleSendUpdateRequestSubmit}
            >
              {sendingUpdate ? "Sending…" : "Send Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {t.status === "cancelled" && (
        <div className="rounded-lg border border-[#EF4444]/30 bg-[#EF4444]/10 p-4 text-[#EF4444] flex items-start gap-2.5">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="font-semibold text-sm">Training Program Cancelled</h4>
            <p className="text-xs text-[#EF4444]/90 font-light">
              <span className="font-semibold">Reason:</span> {t.cancelReason || "No reason specified."}
            </p>
          </div>
        </div>
      )}

      <Tabs defaultValue="invite" className="w-full">
        <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex mb-6 h-10 w-full sm:w-auto">
          <TabsTrigger
            value="invite"
            className="text-[13px] font-medium px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all flex-1 sm:flex-none"
          >
            Invitations
          </TabsTrigger>
          <TabsTrigger
            value="attendance"
            className="text-[13px] font-medium px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all flex-1 sm:flex-none"
          >
            Attendance & Refunds
          </TabsTrigger>
        </TabsList>

        <div className="relative mb-4 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A98] pointer-events-none z-[1]" />
          <Input
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Search members by name, grade, or parent..."
            className="search-filter-input h-9 bg-[#131916] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] text-xs rounded-lg pl-9"
          />
        </div>

        {/* Tab 1: Invitations */}
        <TabsContent value="invite" className="focus-visible:outline-none">
          <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
            <CardHeader className="pb-3 border-b border-white/[0.03] flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
                Invitations Manager - {targetType === "adult" ? "Adult" : "Junior"} Roster
              </CardTitle>
              <div className="text-xs text-[#8A8A98] font-light hidden sm:block">
                Select weeks to invite. Amount recalculates dynamically before acceptance.
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile cards (< md) */}
              <div className="block md:hidden p-4 space-y-3">
                {eligibleMembers.length === 0 ? (
                  <div className="text-center text-[#4A5E58] py-10 font-light text-[13px]">
                    No active eligible {targetType} members found.
                  </div>
                ) : filteredEligibleMembers.length === 0 ? (
                  <div className="text-center text-[#4A5E58] py-10 font-light text-[13px]">
                    No members match “{memberSearch.trim()}”.
                  </div>
                ) : (
                  filteredEligibleMembers.map((m) => {
                    const {
                      memberInvs,
                      statusInfo,
                      isAccepted,
                      isSentYetToAccept,
                      existingAcceptedSessions,
                      unacceptedMonthSessions,
                      hasUnacceptedSessions,
                      isUpdatePending,
                      isUpdateDeclined,
                      selectedSids,
                      memberName,
                      parentName,
                      remainingPayable,
                      totalPayable,
                      countWeeksDisplay,
                      totalAlreadyPaid,
                    } = getInviteRowData(m);

                    return (
                      <div
                        key={m.id}
                        className={cn(
                          "p-4 rounded-xl bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)] space-y-3",
                          isAccepted && "bg-[#10B981]/[0.02]"
                        )}
                      >
                        {/* Header: name + status */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-[#F1F0EE] text-[13px] truncate">{memberName}</span>
                              {isAccepted && <span title="Locked (Accepted)"><Lock className="size-3 text-[#10B981] shrink-0" /></span>}
                            </div>
                            {m.memberType === "junior" && (
                              <>
                                <div className="text-[11px] text-[#8A8A98] font-light">Grade {m.grade}</div>
                                {parentName && (
                                  <div className="text-[11px] text-[#8A8A98] font-light">Parent {parentName}</div>
                                )}
                              </>
                            )}
                          </div>
                          <div className="shrink-0">
                            {isAccepted && isUpdatePending ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/20">
                                Update Sent
                              </span>
                            ) : isAccepted && isUpdateDeclined ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20">
                                Update Declined
                              </span>
                            ) : (
                              <StatusBadge kind={statusInfo.kind} status={statusInfo.statusValue as any} />
                            )}
                          </div>
                        </div>

                        {/* Session week date chips */}
                        <div className="flex flex-wrap gap-2">
                          {monthSessions.map((ms) => {
                            const inv = memberInvs.find((i) => i.trainingId === ms.id);
                            const isSessionAccepted = inv?.status === "accepted";
                            const isChecked = isAccepted
                              ? isSessionAccepted
                              : selectedSids.includes(ms.id);

                            if (isAccepted && !isSessionAccepted) {
                              return (
                                <span
                                  key={ms.id}
                                  className="inline-flex items-center gap-1 text-[11px] text-[#8A8A98] font-medium bg-[#1A2120]/80 px-2 py-1 rounded border border-white/5"
                                  title="Not Included in Accepted Invitation"
                                >
                                  <Lock className="size-3 text-[#8A8A98]" />
                                  {formattedDatePill(ms.startDate)}
                                </span>
                              );
                            }

                            return (
                              <label
                                key={ms.id}
                                className={cn(
                                  "inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded border cursor-pointer",
                                  isChecked
                                    ? "bg-[#10B981]/10 text-[#34D399] border-[#10B981]/30"
                                    : "bg-[#1A2120]/80 text-[#8A8A98] border-white/5",
                                  (isAccepted || t.status === "cancelled") && "opacity-60 cursor-not-allowed"
                                )}
                              >
                                <Checkbox
                                  checked={isChecked}
                                  disabled={isAccepted || t.status === "cancelled"}
                                  onCheckedChange={() => toggleMemberDate(m.id, ms.id)}
                                  className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981] disabled:opacity-60 size-3.5"
                                />
                                <span className="font-mono">{formattedDatePill(ms.startDate)}</span>
                              </label>
                            );
                          })}
                        </div>

                        {/* Payable */}
                        <div className="font-mono text-xs font-semibold">
                          <span className="text-[10px] tracking-wider text-[#8A8A98] uppercase font-medium mr-2">Payable</span>
                          {isAccepted ? (
                            remainingPayable > 0.009 ? (
                              <span className="text-[#3B82F6]">{fmtMoney(remainingPayable)}</span>
                            ) : Math.abs(remainingPayable) <= 0.009 ? (
                              <span className="text-[#34D399]">
                                {fmtMoney(0)} <span className="text-[10px] text-[#8A8A98] font-normal">(Paid in Full)</span>
                              </span>
                            ) : (
                              <span className="text-[#A78BFA]">
                                {fmtMoney(0)} <span className="text-[10px] text-[#A78BFA]/80 font-normal">(Refund {fmtMoney(Math.abs(remainingPayable))})</span>
                              </span>
                            )
                          ) : countWeeksDisplay > 0 ? (
                            <span className="text-[#3B82F6]">
                              {fmtMoney(totalPayable)} ({countWeeksDisplay} wk{countWeeksDisplay !== 1 ? "s" : ""})
                            </span>
                          ) : (
                            <span className="text-[#8A8A98] font-normal">{fmtMoney(0)}</span>
                          )}
                        </div>

                        {/* Actions stacked full-width */}
                        <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.04]">
                          {isAccepted ? (
                            hasUnacceptedSessions ? (
                              <Button
                                size="sm"
                                disabled={t.status === "cancelled"}
                                className={cn(
                                  "h-8 w-full text-[11px] px-3 font-semibold cursor-pointer",
                                  isUpdatePending
                                    ? "bg-[#3B82F6]/20 text-[#3B82F6] hover:bg-[#3B82F6]/30 border border-[#3B82F6]/30"
                                    : "bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                                )}
                                onClick={() => {
                                  const previouslyPaid = totalAlreadyPaid;
                                  const updatedMonthlyFeeVal = applyMemberFee(t.fees, m, discountsFromStore(s));
                                  const newPerSessionFeeVal = updatedMonthlyFeeVal / repeatWeeks;
                                  const remainingPayableVal = updatedMonthlyFeeVal - previouslyPaid;

                                  setSendUpdateDialog({
                                    member: m,
                                    existingSessions: existingAcceptedSessions,
                                    newSessions: unacceptedMonthSessions,
                                    previouslyPaidAmount: previouslyPaid,
                                    updatedMonthlyFee: updatedMonthlyFeeVal,
                                    newPerSessionFee: newPerSessionFeeVal,
                                    additionalAmount: remainingPayableVal,
                                  });
                                }}
                              >
                                {isUpdatePending ? (
                                  <><RefreshCw className="size-3 mr-1" /> Update Sent</>
                                ) : (
                                  <><Send className="size-3 mr-1" /> Send Update</>
                                )}
                              </Button>
                            ) : remainingPayable < -0.009 ? (
                              <Button
                                size="sm"
                                disabled={t.status === "cancelled" || processingOverpaymentRefund}
                                className="h-8 w-full text-[11px] px-3 font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white cursor-pointer"
                                onClick={() => {
                                  setOverpaymentRefundDialog({
                                    member: m,
                                    refundAmount: Math.abs(remainingPayable),
                                  });
                                }}
                              >
                                <RotateCcw className="size-3 mr-1" /> Issue Refund ({fmtMoney(Math.abs(remainingPayable))})
                              </Button>
                            ) : (
                              <span className="inline-flex items-center justify-center gap-1 text-[11px] text-[#10B981] font-semibold h-8">
                                <Lock className="size-3" /> Locked
                              </span>
                            )
                          ) : (
                            <Button
                              size="sm"
                              disabled={selectedSids.length === 0 || t.status === "cancelled"}
                              className={cn(
                                "h-8 w-full text-[11px] px-3",
                                isSentYetToAccept ? "bg-[#3B82F6]/20 text-[#3B82F6] hover:bg-[#3B82F6]/30 border border-[#3B82F6]/30 cursor-pointer" : "btn-premium-solid cursor-pointer"
                              )}
                              onClick={() => handleSendOrUpdate(m.id, memberName, isSentYetToAccept)}
                            >
                              {isSentYetToAccept ? (
                                <><RefreshCw className="size-3 mr-1" /> Update</>
                              ) : (
                                <><Send className="size-3 mr-1" /> Send</>
                              )}
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={(isAccepted && !hasUnacceptedSessions) || t.status === "cancelled" || selectedSids.length === 0}
                            className="btn-premium-outline h-8 w-full text-[11px] px-3 cursor-pointer border-[#10B981]/30 hover:bg-[#10B981]/10 text-[#34D399] disabled:opacity-40 disabled:cursor-not-allowed"
                            onClick={() => handleForceAccept(m.id, memberName)}
                          >
                            <UserCheck className="size-3 mr-1" /> Force Accept
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader className="bg-[#0C0F0E]/60">
                  <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 px-5 min-w-[160px]">
                      Member
                    </TableHead>
                    {monthSessions.map((ms) => (
                      <TableHead
                        key={ms.id}
                        className="text-[10px] font-medium tracking-[0.12em] uppercase h-11 text-center font-mono px-3"
                      >
                        <span className="bg-white text-black px-2 py-0.5 rounded font-bold">
                          {formattedDatePill(ms.startDate)}
                        </span>
                        <span className="block text-[9px] text-[#34D399] font-normal mt-1">
                          ({fmtMoney(sessionFee)})
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 text-center px-4">
                      Payable
                    </TableHead>
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
                  {filteredEligibleMembers.map((m) => {
                    const {
                      memberInvs,
                      statusInfo,
                      isAccepted,
                      isSentYetToAccept,
                      existingAcceptedSessions,
                      unacceptedMonthSessions,
                      hasUnacceptedSessions,
                      isUpdatePending,
                      isUpdateDeclined,
                      selectedSids,
                      memberName,
                      parentName,
                      remainingPayable,
                      totalPayable,
                      countWeeksDisplay,
                      totalAlreadyPaid,
                    } = getInviteRowData(m);

                    return (
                      <TableRow
                        key={m.id}
                        className={cn(
                          "border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors",
                          isAccepted && "bg-[#10B981]/[0.02]"
                        )}
                      >
                        <TableCell className="font-semibold text-[#F1F0EE] text-[13px] px-5 py-4 min-w-[160px]">
                          <div className="flex items-center gap-1.5">
                            <span>{memberName}</span>
                            {isAccepted && <span title="Locked (Accepted)"><Lock className="size-3 text-[#10B981]" /></span>}
                          </div>
                          {m.memberType === "junior" && (
                            <>
                              <div className="text-[11px] text-[#8A8A98] font-light">Grade {m.grade}</div>
                              {parentName && (
                                <div className="text-[11px] text-[#8A8A98] font-light">Parent {parentName}</div>
                              )}
                            </>
                          )}
                        </TableCell>

                        {/* Weekly session checkbox / status columns */}
                        {monthSessions.map((ms) => {
                          const inv = memberInvs.find((i) => i.trainingId === ms.id);
                          const isSessionAccepted = inv?.status === "accepted";
                          const isChecked = isAccepted
                            ? isSessionAccepted
                            : selectedSids.includes(ms.id);

                          if (isAccepted && !isSessionAccepted) {
                            return (
                              <TableCell key={ms.id} className="text-center py-4 px-3">
                                <span className="inline-flex items-center gap-1 text-[11px] text-[#8A8A98] font-medium bg-[#1A2120]/80 px-2 py-1 rounded border border-white/5" title="Not Included in Accepted Invitation">
                                  <Lock className="size-3 text-[#8A8A98]" /> Not Included
                                </span>
                              </TableCell>
                            );
                          }

                          return (
                            <TableCell key={ms.id} className="text-center py-4 px-3">
                              <Checkbox
                                checked={isChecked}
                                disabled={isAccepted || t.status === "cancelled"}
                                onCheckedChange={() => toggleMemberDate(m.id, ms.id)}
                                className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981] disabled:opacity-60"
                              />
                            </TableCell>
                          );
                        })}

                        {/* Payable Amount Badge */}
                        <TableCell className="text-center px-4 py-4 font-mono text-xs font-semibold">
                          {isAccepted ? (
                            remainingPayable > 0.009 ? (
                              <span className="text-[#3B82F6]">{fmtMoney(remainingPayable)}</span>
                            ) : Math.abs(remainingPayable) <= 0.009 ? (
                              <span className="text-[#34D399]">
                                {fmtMoney(0)} <span className="text-[10px] text-[#8A8A98] font-normal">(Paid in Full)</span>
                              </span>
                            ) : (
                              <span className="text-[#A78BFA]">
                                {fmtMoney(0)} <span className="text-[10px] text-[#A78BFA]/80 font-normal">(Refund {fmtMoney(Math.abs(remainingPayable))})</span>
                              </span>
                            )
                          ) : countWeeksDisplay > 0 ? (
                            <span className="text-[#3B82F6]">
                              {fmtMoney(totalPayable)} ({countWeeksDisplay} wk{countWeeksDisplay !== 1 ? "s" : ""})
                            </span>
                          ) : (
                            <span className="text-[#8A8A98] font-normal">{fmtMoney(0)}</span>
                          )}
                        </TableCell>

                        {/* Status Column */}
                        <TableCell className="text-center px-4 py-4">
                          {isAccepted && isUpdatePending ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/20">
                              Update Sent
                            </span>
                          ) : isAccepted && isUpdateDeclined ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20">
                              Update Declined
                            </span>
                          ) : (
                            <StatusBadge kind={statusInfo.kind} status={statusInfo.statusValue as any} />
                          )}
                        </TableCell>

                        {/* Action Column - Send / Update Invitation Button */}
                        <TableCell className="text-center px-4 py-4">
                          {isAccepted ? (
                            hasUnacceptedSessions ? (
                              <Button
                                size="sm"
                                disabled={t.status === "cancelled"}
                                className={cn(
                                  "h-8 text-[11px] px-3 font-semibold cursor-pointer",
                                  isUpdatePending
                                    ? "bg-[#3B82F6]/20 text-[#3B82F6] hover:bg-[#3B82F6]/30 border border-[#3B82F6]/30"
                                    : "bg-[#3B82F6] hover:bg-[#2563EB] text-white"
                                )}
                                onClick={() => {
                                  const previouslyPaid = totalAlreadyPaid;
                                  const updatedMonthlyFeeVal = applyMemberFee(t.fees, m, discountsFromStore(s));
                                  const newPerSessionFeeVal = updatedMonthlyFeeVal / repeatWeeks;
                                  const remainingPayableVal = updatedMonthlyFeeVal - previouslyPaid;

                                  setSendUpdateDialog({
                                    member: m,
                                    existingSessions: existingAcceptedSessions,
                                    newSessions: unacceptedMonthSessions,
                                    previouslyPaidAmount: previouslyPaid,
                                    updatedMonthlyFee: updatedMonthlyFeeVal,
                                    newPerSessionFee: newPerSessionFeeVal,
                                    additionalAmount: remainingPayableVal,
                                  });
                                }}
                              >
                                {isUpdatePending ? (
                                  <><RefreshCw className="size-3 mr-1" /> Update Sent</>
                                ) : (
                                  <><Send className="size-3 mr-1" /> Send Update</>
                                )}
                              </Button>
                            ) : remainingPayable < -0.009 ? (
                              <Button
                                size="sm"
                                disabled={t.status === "cancelled" || processingOverpaymentRefund}
                                className="h-8 text-[11px] px-3 font-semibold bg-[#8B5CF6] hover:bg-[#7C3AED] text-white cursor-pointer"
                                onClick={() => {
                                  setOverpaymentRefundDialog({
                                    member: m,
                                    refundAmount: Math.abs(remainingPayable),
                                  });
                                }}
                              >
                                <RotateCcw className="size-3 mr-1" /> Issue Refund ({fmtMoney(Math.abs(remainingPayable))})
                              </Button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-[#10B981] font-semibold">
                                <Lock className="size-3" /> Locked
                              </span>
                            )
                          ) : (
                            <Button
                              size="sm"
                              disabled={selectedSids.length === 0 || t.status === "cancelled"}
                              className={cn(
                                "h-8 text-[11px] px-3",
                                isSentYetToAccept ? "bg-[#3B82F6]/20 text-[#3B82F6] hover:bg-[#3B82F6]/30 border border-[#3B82F6]/30 cursor-pointer" : "btn-premium-solid cursor-pointer"
                              )}
                              onClick={() => handleSendOrUpdate(m.id, memberName, isSentYetToAccept)}
                            >
                              {isSentYetToAccept ? (
                                <><RefreshCw className="size-3 mr-1" /> Update</>
                              ) : (
                                <><Send className="size-3 mr-1" /> Send</>
                              )}
                            </Button>
                          )}
                        </TableCell>

                        {/* Force Accept Column */}
                        <TableCell className="text-right px-5 py-4">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={(isAccepted && !hasUnacceptedSessions) || t.status === "cancelled" || selectedSids.length === 0}
                            className="btn-premium-outline h-8 text-[11px] px-3 cursor-pointer border-[#10B981]/30 hover:bg-[#10B981]/10 text-[#34D399] disabled:opacity-40 disabled:cursor-not-allowed"
                            onClick={() => handleForceAccept(m.id, memberName)}
                          >
                            <UserCheck className="size-3 mr-1" /> Force Accept
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {eligibleMembers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={monthSessions.length + 5}
                        className="text-center text-[#4A5E58] py-10 font-light text-[13px]"
                      >
                        No active eligible {targetType} members found.
                      </TableCell>
                    </TableRow>
                  ) : filteredEligibleMembers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={monthSessions.length + 5}
                        className="text-center text-[#4A5E58] py-10 font-light text-[13px]"
                      >
                        No members match “{memberSearch.trim()}”.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Attendance & Refunds */}
        <TabsContent value="attendance" className="focus-visible:outline-none">
          <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
            <CardHeader className="pb-3 border-b border-white/[0.03] flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
                Attendance & Refund Matrix ({monthSessions.length} weekly session{monthSessions.length === 1 ? "" : "s"})
              </CardTitle>
              <div className="text-xs text-[#8A8A98] font-light hidden sm:block">
                ✓ Present · ✕ Absent (opens refund popup). Present after a paid refund reverses it.
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {/* Mobile cards (< md) — enrolled members only, touch-friendly layout */}
              <div className="block md:hidden p-3 space-y-3">
                {(() => {
                  const enrolledMembers = filteredEligibleMembers.filter((m) =>
                    monthSessions.some((ms) =>
                      s.trainingInvites.some(
                        (i) => i.trainingId === ms.id && i.memberId === m.id && i.status === "accepted",
                      ),
                    ),
                  );

                  if (eligibleMembers.length === 0) {
                    return (
                      <div className="text-center text-[#4A5E58] py-10 font-light text-[13px]">
                        No active eligible {targetType} members found.
                      </div>
                    );
                  }

                  if (filteredEligibleMembers.length === 0) {
                    return (
                      <div className="text-center text-[#4A5E58] py-10 font-light text-[13px]">
                        No members match “{memberSearch.trim()}”.
                      </div>
                    );
                  }

                  if (enrolledMembers.length === 0) {
                    return (
                      <div className="text-center text-[#4A5E58] py-10 font-light text-[13px] px-2">
                        No accepted invitations yet. Force Accept or wait for members to accept on the Invitations tab.
                      </div>
                    );
                  }

                  return enrolledMembers.map((m) => {
                    const memberName = `${m.firstName} ${m.lastName}`;
                    const parentMember = m.parentMemberId
                      ? s.members.find((x) => x.id === m.parentMemberId)
                      : null;
                    const parentName = parentMember
                      ? `${parentMember.firstName} ${parentMember.lastName}`
                      : null;
                    const baseMemberWeekFee = applyMemberFee(t.fees, m, discountsFromStore(s)) / repeatWeeks;

                    return (
                      <div
                        key={m.id}
                        className="rounded-xl bg-[#0C0F0E] border border-[rgba(255,255,255,0.08)] overflow-hidden"
                      >
                        <div className="px-3.5 py-3 border-b border-white/[0.06] bg-[#131916]/80">
                          <div className="font-semibold text-[#F1F0EE] text-[14px]">{memberName}</div>
                          {m.memberType === "junior" && m.grade && (
                            <div className="text-[11px] text-[#8A8A98] mt-0.5">Grade {m.grade}</div>
                          )}
                          {m.memberType === "junior" && parentName && (
                            <div className="text-[11px] text-[#8A8A98] mt-0.5">Parent {parentName}</div>
                          )}
                        </div>

                        <div className="divide-y divide-white/[0.05]">
                          {monthSessions.map((ms) => {
                            const inv = s.trainingInvites.find(
                              (i) => i.trainingId === ms.id && i.memberId === m.id,
                            );
                            const isAccepted = inv?.status === "accepted";
                            const dateRec = s.trainingDates.find(
                              (d) => d.trainingId === ms.id && d.memberId === m.id,
                            );

                            if (!isAccepted) {
                              return (
                                <div
                                  key={ms.id}
                                  className="flex items-center justify-between gap-3 px-3.5 py-3"
                                >
                                  <span className="text-[12px] font-semibold text-[#C4D4CF] font-mono">
                                    {formattedDatePill(ms.startDate)}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-[11px] text-[#6B7C76] bg-white/[0.03] px-2 py-1 rounded-md border border-white/[0.05]">
                                    <Lock className="size-3" /> Not included
                                  </span>
                                </div>
                              );
                            }

                            const isPresent = dateRec?.attended === true;
                            const isAbsent = dateRec?.attended === false;
                            const refundStatus = dateRec?.refundStatus;
                            const refundLocked = refundStatus === "none" || refundStatus === "half" || refundStatus === "full";
                            const dateLabel = formattedDatePill(ms.startDate);

                            return (
                              <div key={ms.id} className="px-3.5 py-3.5 space-y-2.5">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[12px] font-semibold text-[#EEF2F0] font-mono tracking-wide">
                                    {dateLabel}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      title="Present"
                                      aria-label="Present"
                                      onClick={() => {
                                        if (dateRec) handleMarkPresent(dateRec, memberName, dateLabel);
                                      }}
                                      className={cn(
                                        "size-10 rounded-lg border flex items-center justify-center cursor-pointer transition-all",
                                        isPresent
                                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/45"
                                          : "bg-[#131916] text-[#8A8A98] border-white/[0.10] active:bg-white/[0.04]",
                                      )}
                                    >
                                      <CheckCircle2 className="size-5" />
                                    </button>
                                    <button
                                      type="button"
                                      title="Absent"
                                      aria-label="Absent"
                                      onClick={() => {
                                        if (!dateRec || refundLocked) return;
                                        openAbsentRefundDialog(dateRec.id, memberName, dateLabel, baseMemberWeekFee);
                                      }}
                                      className={cn(
                                        "size-10 rounded-lg border flex items-center justify-center transition-all",
                                        isAbsent
                                          ? "bg-rose-500/20 text-rose-400 border-rose-500/45"
                                          : "bg-[#131916] text-[#8A8A98] border-white/[0.10] active:bg-white/[0.04]",
                                        refundLocked ? "cursor-default" : "cursor-pointer",
                                      )}
                                    >
                                      <XCircle className="size-5" />
                                    </button>
                                  </div>
                                </div>

                                {isAbsent && refundLocked && (
                                  refundStatus === "half" ? (
                                    <div className="px-3 py-2 rounded-md bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[11px] font-semibold text-center">
                                      50% refunded ({fmtMoney(dateRec?.refundAmount ?? baseMemberWeekFee * 0.5)})
                                    </div>
                                  ) : refundStatus === "full" ? (
                                    <div className="px-3 py-2 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-semibold text-center">
                                      Fully refunded ({fmtMoney(dateRec?.refundAmount ?? baseMemberWeekFee)})
                                    </div>
                                  ) : (
                                    <div className="px-3 py-2 rounded-md bg-white/[0.04] border border-white/[0.08] text-[#A8B5B0] text-[11px] font-medium text-center">
                                      No refund
                                    </div>
                                  )
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Desktop table (>= md) */}
              <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader className="bg-[#0C0F0E]/60">
                  <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 px-5 min-w-[160px]">
                      Member
                    </TableHead>
                    {monthSessions.map((ms) => (
                      <TableHead
                        key={ms.id}
                        className="text-[10px] font-medium tracking-[0.12em] uppercase h-11 text-center font-mono px-4"
                      >
                        <span className="bg-white text-black px-2 py-0.5 rounded font-bold">
                          {formattedDatePill(ms.startDate)}
                        </span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEligibleMembers.map((m) => {
                    const memberName = `${m.firstName} ${m.lastName}`;
                    const parentMember = m.parentMemberId
                      ? s.members.find((x) => x.id === m.parentMemberId)
                      : null;
                    const parentName = parentMember
                      ? `${parentMember.firstName} ${parentMember.lastName}`
                      : null;
                    const baseMemberWeekFee = applyMemberFee(t.fees, m, discountsFromStore(s)) / repeatWeeks;

                    return (
                      <TableRow
                        key={m.id}
                        className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors"
                      >
                        <TableCell className="font-semibold text-[#F1F0EE] text-[13px] px-5 py-4 min-w-[160px]">
                          <div>{memberName}</div>
                          {m.memberType === "junior" && m.grade && (
                            <div className="text-[11px] text-[#8A8A98] font-light">Grade {m.grade}</div>
                          )}
                          {m.memberType === "junior" && parentName && (
                            <div className="text-[11px] text-[#8A8A98] font-light">Parent {parentName}</div>
                          )}
                        </TableCell>

                        {/* Weekly session attendance & refund columns */}
                        {monthSessions.map((ms) => {
                          const inv = s.trainingInvites.find(
                            (i) => i.trainingId === ms.id && i.memberId === m.id
                          );
                          const isAccepted = inv?.status === "accepted";

                          const dateRec = s.trainingDates.find(
                            (d) => d.trainingId === ms.id && d.memberId === m.id
                          );

                          if (!isAccepted) {
                            const statusInfo = getMemberStatus(m.id);
                            if (statusInfo.isAccepted) {
                              return (
                                <TableCell key={ms.id} className="text-center py-4 px-4 text-[#8A8A98] text-[11px] font-medium">
                                  <span className="inline-flex items-center gap-1 bg-[#1A2120]/80 px-2 py-1 rounded border border-white/5">
                                    <Lock className="size-3 text-[#8A8A98]" /> Not Included
                                  </span>
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell key={ms.id} className="text-center py-4 px-4 text-[#8A8A98] text-[12px] font-light">
                                Not Enrolled
                              </TableCell>
                            );
                          }

                          const isPresent = dateRec?.attended === true;
                          const isAbsent = dateRec?.attended === false;
                          const refundStatus = dateRec?.refundStatus;
                          const refundLocked = refundStatus === "none" || refundStatus === "half" || refundStatus === "full";
                          const dateLabel = formattedDatePill(ms.startDate);

                          return (
                            <TableCell key={ms.id} className="text-center py-4 px-3 align-top min-w-[140px]">
                              <div className="flex flex-col items-center gap-2">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    title="Present"
                                    aria-label="Present"
                                    onClick={() => {
                                      if (dateRec) handleMarkPresent(dateRec, memberName, dateLabel);
                                    }}
                                    className={cn(
                                      "size-9 rounded-lg border flex items-center justify-center cursor-pointer transition-all",
                                      isPresent
                                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/45"
                                        : "bg-[#0C0F0E] text-[#8A8A98] border-white/10 hover:text-emerald-400 hover:border-emerald-500/30",
                                    )}
                                  >
                                    <CheckCircle2 className="size-4" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Absent"
                                    aria-label="Absent"
                                    onClick={() => {
                                      if (!dateRec || refundLocked) return;
                                      openAbsentRefundDialog(dateRec.id, memberName, dateLabel, baseMemberWeekFee);
                                    }}
                                    className={cn(
                                      "size-9 rounded-lg border flex items-center justify-center transition-all",
                                      isAbsent
                                        ? "bg-rose-500/20 text-rose-400 border-rose-500/45"
                                        : "bg-[#0C0F0E] text-[#8A8A98] border-white/10 hover:text-rose-400 hover:border-rose-500/30",
                                      refundLocked ? "cursor-default" : "cursor-pointer",
                                    )}
                                  >
                                    <XCircle className="size-4" />
                                  </button>
                                </div>

                                {isAbsent && refundLocked && (
                                  refundStatus === "half" ? (
                                    <div className="w-full px-2 py-1 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 text-[10px] font-semibold">
                                      50% Refunded
                                    </div>
                                  ) : refundStatus === "full" ? (
                                    <div className="w-full px-2 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold">
                                      Refunded
                                    </div>
                                  ) : (
                                    <div className="w-full px-2 py-1 rounded bg-gray-500/15 border border-gray-500/30 text-gray-300 text-[10px]">
                                      No Refund
                                    </div>
                                  )
                                )}
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                  {eligibleMembers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={monthSessions.length + 1}
                        className="text-center text-[#4A5E58] py-10 font-light text-[13px]"
                      >
                        No active eligible {targetType} members found.
                      </TableCell>
                    </TableRow>
                  ) : filteredEligibleMembers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={monthSessions.length + 1}
                        className="text-center text-[#4A5E58] py-10 font-light text-[13px]"
                      >
                        No members match “{memberSearch.trim()}”.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
