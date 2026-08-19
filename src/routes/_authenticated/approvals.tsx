import { createFileRoute, Navigate } from "@tanstack/react-router";
import type { Variants } from "framer-motion";

import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, fmtMoney } from "@/lib/format";
import type { Member, MemberType, User } from "@/lib/types";
import { motion } from "framer-motion";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { ResponsiveTable } from "@/components/ResponsiveTable";

export const Route = createFileRoute("/_authenticated/approvals")({ component: Approvals });

type ApproveOptions = {
  memberType: MemberType;
  grade: string;
  membership: boolean;
  trainingEligible: boolean;
  playEligible: boolean;
  skipCreditConsumption: boolean;
  applyDiscount: boolean;
};

function defaultApproveOptions(defaultGrade: string = "B"): ApproveOptions {
  return {
    memberType: "adult",
    grade: defaultGrade,
    membership: true,
    trainingEligible: false,
    playEligible: false,
    skipCreditConsumption: false,
    applyDiscount: false,
  };
}

/** Inline spinner SVG for button loading states */
function BtnSpinner() {
  return (
    <svg className="animate-spin size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function Approvals() {
  const user = useCurrentUser()!;
  if (user.role !== "admin") return <Navigate to="/dashboard" />;
  const s = useStore();
  const adultGrades = useStore((st) => st.adultGrades);
  const juniorGrades = useStore((st) => st.juniorGrades);
  const pendingU = s.users.filter((u) => u.status === "created");
  const pendingC = s.creditRequests.filter((c) => (c.type || "credit") === "credit" && c.status === "created");
  const pendingJuniors = s.members.filter(
    (m) => m.memberType === "junior" && m.status === "pending",
  );

  const [approveTarget, setApproveTarget] = useState<User | null>(null);
  const [opts, setOpts] = useState<ApproveOptions>(() => defaultApproveOptions());
  const [submitting, setSubmitting] = useState(false);

  const [juniorTarget, setJuniorTarget] = useState<Member | null>(null);
  const [juniorOpts, setJuniorOpts] = useState({
    membership: false,
    trainingEligible: true,
    playEligible: false,
    grade: "",
  });
  const [approvingJuniorId, setApprovingJuniorId] = useState<string | null>(null);
  const [rejectingJuniorId, setRejectingJuniorId] = useState<string | null>(null);

  // Per-row loading states
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  const [approvingCreditId, setApprovingCreditId] = useState<string | null>(null);
  const [rejectingCreditId, setRejectingCreditId] = useState<string | null>(null);

  const openApprove = (u: User) => {
    setApproveTarget(u);
    const defaultGrade = adultGrades.length > 0 ? adultGrades[0] : "B";
    setOpts(defaultApproveOptions(defaultGrade));
  };

  const openJuniorApprove = (m: Member) => {
    setJuniorTarget(m);
    setJuniorOpts({
      membership: m.membership ?? false,
      trainingEligible: true,
      playEligible: false,
      grade: m.grade || (juniorGrades[0] ?? ""),
    });
  };

  const confirmJuniorApprove = async () => {
    if (!juniorTarget) return;
    setApprovingJuniorId(juniorTarget.id);
    try {
      await s.approveJunior(juniorTarget.id, juniorOpts);
      toast.success(`${juniorTarget.firstName} approved`);
      setJuniorTarget(null);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to approve junior.");
    } finally {
      setApprovingJuniorId(null);
    }
  };

  const parentName = (m: Member) => {
    if (!m.parentMemberId) return "—";
    const p = s.members.find((x) => x.id === m.parentMemberId);
    return p ? `${p.firstName} ${p.lastName}` : m.parentMemberId;
  };

  const getJuniorAddress = (m: Member): string => {
    if ((m as any).address && typeof (m as any).address === "string" && (m as any).address.trim()) {
      return (m as any).address.trim();
    }
    if (m.userId) {
      const u = s.users.find((x) => x.id === m.userId);
      if (u?.address && u.address.trim()) {
        return u.address.trim();
      }
    }
    if (m.parentMemberId) {
      const p = s.members.find((x) => x.id === m.parentMemberId);
      if (p) {
        if ((p as any).address && typeof (p as any).address === "string" && (p as any).address.trim()) {
          return (p as any).address.trim();
        }
        if (p.userId) {
          const pu = s.users.find((x) => x.id === p.userId);
          if (pu?.address && pu.address.trim()) {
            return pu.address.trim();
          }
        }
      }
    }
    return "N/A";
  };

  const setMemberType = (memberType: MemberType) => {
    const relevantGrades = memberType === "junior" ? juniorGrades : adultGrades;
    const nextGrade = relevantGrades.length > 0 ? relevantGrades[0] : "";
    setOpts((p) => ({
      ...p,
      memberType,
      grade: nextGrade,
    }));
  };

  const confirmApprove = async () => {
    if (!approveTarget) return;
    setSubmitting(true);
    try {
      await s.approveUser(approveTarget.id, opts);
      toast.success(`${approveTarget.firstName} approved`);
      setApproveTarget(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to approve user.");
    } finally {
      setSubmitting(false);
    }
  };

  const staggerRow = {
    hidden: { opacity: 0, x: -8 },
    show: (i: number) => ({
      opacity: 1,
      x: 0,
      transition: { delay: i * 0.05, duration: 0.18, ease: "easeOut" as const },
    }),
  } satisfies Variants;


  return (
    <div className="space-y-6">
      <PageHeader title="Approvals" description="Review and authorize pending registrations, juniors, and credit additions." />

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex mb-6 h-auto min-h-10 max-w-full overflow-x-auto flex-wrap sm:flex-nowrap gap-1">
          <TabsTrigger
            value="users"
            className="text-[13px] font-medium px-3 sm:px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all whitespace-nowrap"
          >
            Member Requests ({pendingU.length})
          </TabsTrigger>
          <TabsTrigger
            value="juniors"
            className="text-[13px] font-medium px-3 sm:px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all whitespace-nowrap"
          >
            Junior Requests ({pendingJuniors.length})
          </TabsTrigger>
          <TabsTrigger
            value="credits"
            className="text-[13px] font-medium px-3 sm:px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all whitespace-nowrap"
          >
            Credit Requests ({pendingC.length})
          </TabsTrigger>
        </TabsList>

        {/* Member Requests Tab */}
        <TabsContent value="users" className="focus-visible:outline-none">
          {pendingU.length === 0 ? (
            <EmptyIllustration
              icon="check"
              title="All caught up!"
              description="No pending member requests. All registrations have been reviewed."
            />
          ) : (
            <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
              <CardContent className="p-0">
                <ResponsiveTable
                  mobile={
                    <div className="p-3 space-y-3">
                      {pendingU.map((u) => (
                        <div
                          key={u.id}
                          className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/50 p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-[#EEF2F0] text-[14px] truncate">
                                {u.firstName} {u.lastName}
                              </p>
                              <p className="text-[12px] text-[#C4D4CF] truncate mt-0.5">{u.email}</p>
                              <p className="text-[12px] text-[#8A8A98] font-mono mt-1">{u.mobile}</p>
                              <p className="text-[12px] text-[#C4D4CF] mt-1 truncate">
                                <span className="text-[#8A8A98]">Address: </span>
                                {u.address && u.address.trim() ? u.address.trim() : "N/A"}
                              </p>
                            </div>
                            <StatusBadge status={u.status} />
                          </div>
                          <p className="text-[11px] text-[#8A8A98]">Registered {fmtDate(u.createdAt)}</p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              className="btn-premium-solid h-9 text-[11px] px-3 font-semibold cursor-pointer flex-1 min-w-[100px]"
                              onClick={() => openApprove(u)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={rejectingUserId === u.id}
                              className="btn-premium-outline h-9 text-[11px] px-3 cursor-pointer flex-1 min-w-[100px]"
                              onClick={async () => {
                                setRejectingUserId(u.id);
                                try {
                                  await s.rejectUser(u.id);
                                  toast.success(`${u.firstName} rejected`);
                                } catch (error: any) {
                                  toast.error(error.message || "Failed to reject user.");
                                } finally {
                                  setRejectingUserId(null);
                                }
                              }}
                            >
                              {rejectingUserId === u.id ? <BtnSpinner /> : "Reject"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                  desktop={
                <Table>
                  <TableHeader className="bg-[#0C0F0E]/60">
                    <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                      <TableHead className="type-table-head h-11 px-5">Name</TableHead>
                      <TableHead className="type-table-head h-11">Email</TableHead>
                      <TableHead className="type-table-head h-11">Mobile</TableHead>
                      <TableHead className="type-table-head h-11">Address</TableHead>
                      <TableHead className="type-table-head h-11">Registered</TableHead>
                      <TableHead className="type-table-head h-11">Status</TableHead>
                      <TableHead className="type-table-head h-11 text-right px-5">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingU.map((u, i) => (
                      <motion.tr
                        key={u.id}
                        custom={i}
                        variants={staggerRow}
                        initial="hidden"
                        animate="show"
                        className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors"
                      >
                        <TableCell className="font-bold text-[#EEF2F0] text-[14px] type-table-body px-5 py-4">
                          {u.firstName} {u.lastName}
                        </TableCell>
                        <TableCell className="type-table-body text-[#C4D4CF]">{u.email}</TableCell>
                        <TableCell className="type-mono-value text-[#EEF2F0]">{u.mobile}</TableCell>
                        <TableCell className="type-table-body text-[#C4D4CF]">{u.address && u.address.trim() ? u.address.trim() : "N/A"}</TableCell>
                        <TableCell className="type-mono-value text-[#EEF2F0]">{fmtDate(u.createdAt)}</TableCell>
                        <TableCell className="py-4"><StatusBadge status={u.status} /></TableCell>
                        <TableCell className="text-right px-5 py-4 space-x-2">
                          <Button
                            size="sm"
                            className="btn-premium-solid h-8 text-[11px] px-3 font-semibold cursor-pointer min-w-[70px]"
                            onClick={() => openApprove(u)}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={rejectingUserId === u.id}
                            className="btn-premium-outline h-8 text-[11px] px-3 cursor-pointer min-w-[60px]"
                            onClick={async () => {
                              setRejectingUserId(u.id);
                              try {
                                await s.rejectUser(u.id);
                                toast.success(`${u.firstName} rejected`);
                              } catch (error: any) {
                                toast.error(error.message || "Failed to reject user.");
                              } finally {
                                setRejectingUserId(null);
                              }
                            }}
                          >
                            {rejectingUserId === u.id ? <BtnSpinner /> : "Reject"}
                          </Button>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
                  }
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Junior Requests Tab */}
        <TabsContent value="juniors" className="focus-visible:outline-none">
          {pendingJuniors.length === 0 ? (
            <EmptyIllustration
              icon="check"
              title="No pending juniors"
              description="All junior family member requests have been reviewed."
            />
          ) : (
            <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
              <CardContent className="p-0">
                <ResponsiveTable
                  mobile={
                    <div className="p-3 space-y-3">
                      {pendingJuniors.map((m) => (
                        <div
                          key={m.id}
                          className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/50 p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-bold text-[#EEF2F0] text-[14px] truncate">
                                {m.firstName} {m.lastName}
                              </p>
                              <p className="text-[12px] text-[#C4D4CF] mt-0.5">
                                Parent: {parentName(m)}
                              </p>
                              <p className="text-[12px] text-[#C4D4CF] mt-0.5 truncate">
                                <span className="text-[#8A8A98]">Address: </span>
                                {getJuniorAddress(m)}
                              </p>
                              <p className="text-[12px] text-[#8A8A98] mt-1">
                                Grade: {m.grade || "—"}
                                {m.biMemberId ? ` · ${m.biMemberId}` : ""}
                              </p>
                            </div>
                            <StatusBadge status={m.status} />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="btn-premium-solid h-8 text-[11px] px-3 font-semibold cursor-pointer flex-1"
                              onClick={() => openJuniorApprove(m)}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={rejectingJuniorId === m.id}
                              className="btn-premium-outline h-8 text-[11px] px-3 cursor-pointer flex-1"
                              onClick={async () => {
                                setRejectingJuniorId(m.id);
                                try {
                                  await s.rejectJunior(m.id);
                                  toast.success("Junior rejected");
                                } catch (error: unknown) {
                                  toast.error(
                                    error instanceof Error ? error.message : "Failed to reject junior.",
                                  );
                                } finally {
                                  setRejectingJuniorId(null);
                                }
                              }}
                            >
                              {rejectingJuniorId === m.id ? <BtnSpinner /> : "Reject"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  }
                  desktop={
                    <Table>
                      <TableHeader className="bg-[#0C0F0E]/60">
                        <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                          <TableHead className="type-table-head h-11 px-5">Junior</TableHead>
                          <TableHead className="type-table-head h-11">Parent</TableHead>
                          <TableHead className="type-table-head h-11">Address</TableHead>
                          <TableHead className="type-table-head h-11">Grade</TableHead>
                          <TableHead className="type-table-head h-11">Status</TableHead>
                          <TableHead className="type-table-head h-11 text-right px-5">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingJuniors.map((m, i) => (
                          <motion.tr
                            key={m.id}
                            custom={i}
                            variants={staggerRow}
                            initial="hidden"
                            animate="show"
                            className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors"
                          >
                            <TableCell className="font-bold text-[#EEF2F0] text-[14px] type-table-body px-5 py-4">
                              {m.firstName} {m.lastName}
                              {m.biMemberId ? (
                                <span className="block text-[11px] text-[#8A8A98] font-mono font-normal mt-0.5">
                                  {m.biMemberId}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="type-table-body text-[#C4D4CF]">{parentName(m)}</TableCell>
                            <TableCell className="type-table-body text-[#C4D4CF]">{getJuniorAddress(m)}</TableCell>
                            <TableCell className="type-table-body text-[#EEF2F0]">{m.grade || "—"}</TableCell>
                            <TableCell className="py-4">
                              <StatusBadge status={m.status} />
                            </TableCell>
                            <TableCell className="text-right px-5 py-4 space-x-2">
                              <Button
                                size="sm"
                                className="btn-premium-solid h-8 text-[11px] px-3 font-semibold cursor-pointer min-w-[70px]"
                                onClick={() => openJuniorApprove(m)}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={rejectingJuniorId === m.id}
                                className="btn-premium-outline h-8 text-[11px] px-3 cursor-pointer min-w-[60px]"
                                onClick={async () => {
                                  setRejectingJuniorId(m.id);
                                  try {
                                    await s.rejectJunior(m.id);
                                    toast.success("Junior rejected");
                                  } catch (error: unknown) {
                                    toast.error(
                                      error instanceof Error ? error.message : "Failed to reject junior.",
                                    );
                                  } finally {
                                    setRejectingJuniorId(null);
                                  }
                                }}
                              >
                                {rejectingJuniorId === m.id ? <BtnSpinner /> : "Reject"}
                              </Button>
                            </TableCell>
                          </motion.tr>
                        ))}
                      </TableBody>
                    </Table>
                  }
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Credit Requests Tab */}
        <TabsContent value="credits" className="focus-visible:outline-none">
          {pendingC.length === 0 ? (
            <EmptyIllustration
              icon="wallet"
              title="No pending credit requests"
              description="All credit top-up requests have been reviewed. Come back later."
            />
          ) : (
            <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
              <CardContent className="p-0">
                <ResponsiveTable
                  mobile={
                    <div className="p-3 space-y-3">
                      {pendingC.map((r) => {
                        const m = s.members.find((x) => x.id === r.memberId);
                        return (
                          <div
                            key={r.id}
                            className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/50 p-4 space-y-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-bold text-[#EEF2F0] text-[14px] truncate">
                                  {m?.firstName} {m?.lastName}
                                </p>
                                <p className="static-financial-credit-text type-mono-value text-[14px] font-semibold mt-1">
                                  {fmtMoney(r.amount)}
                                </p>
                                <p className="text-[11px] text-[#8A8A98] mt-1">{fmtDate(r.date)}</p>
                              </div>
                              <StatusBadge status={r.status} />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={approvingCreditId === r.id}
                                className="btn-premium-solid h-9 text-[11px] px-3 font-semibold cursor-pointer flex-1 min-w-[100px]"
                                onClick={async () => {
                                  setApprovingCreditId(r.id);
                                  try {
                                    await s.approveCredit(r.id);
                                    toast.success("Credit approved & balance updated");
                                  } catch (error: any) {
                                    toast.error(error.message || "Failed to approve credit request.");
                                  } finally {
                                    setApprovingCreditId(null);
                                  }
                                }}
                              >
                                {approvingCreditId === r.id ? <BtnSpinner /> : "Approve"}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={rejectingCreditId === r.id}
                                className="btn-premium-outline h-9 text-[11px] px-3 cursor-pointer flex-1 min-w-[100px]"
                                onClick={async () => {
                                  setRejectingCreditId(r.id);
                                  try {
                                    await s.rejectCredit(r.id);
                                    toast.success("Credit request rejected");
                                  } catch (error: any) {
                                    toast.error(error.message || "Failed to reject credit request.");
                                  } finally {
                                    setRejectingCreditId(null);
                                  }
                                }}
                              >
                                {rejectingCreditId === r.id ? <BtnSpinner /> : "Reject"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  }
                  desktop={
                <Table>
                  <TableHeader className="bg-[#0C0F0E]/60">
                    <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                      <TableHead className="type-table-head h-11 px-5">Member</TableHead>
                      <TableHead className="type-table-head h-11">Amount</TableHead>
                      <TableHead className="type-table-head h-11">Date</TableHead>
                      <TableHead className="type-table-head h-11">Status</TableHead>
                      <TableHead className="type-table-head h-11 text-right px-5">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingC.map((r, i) => {
                      const m = s.members.find((x) => x.id === r.memberId);
                      return (
                        <motion.tr
                          key={r.id}
                          custom={i}
                          variants={staggerRow}
                          initial="hidden"
                          animate="show"
                          className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors"
                        >
                          <TableCell className="font-bold text-[#EEF2F0] text-[14px] type-table-body px-5 py-4">
                            {m?.firstName} {m?.lastName}
                          </TableCell>
                          <TableCell className="static-financial-credit-text type-mono-value text-[14px] font-semibold">{fmtMoney(r.amount)}</TableCell>
                          <TableCell className="type-mono-value text-[#EEF2F0]">{fmtDate(r.date)}</TableCell>
                          <TableCell className="py-4"><StatusBadge status={r.status} /></TableCell>
                          <TableCell className="text-right px-5 py-4 space-x-2">
                            <Button
                              size="sm"
                              disabled={approvingCreditId === r.id}
                              className="btn-premium-solid h-8 text-[11px] px-3 font-semibold cursor-pointer min-w-[70px]"
                              onClick={async () => {
                                setApprovingCreditId(r.id);
                                try {
                                  await s.approveCredit(r.id);
                                  toast.success("Credit approved & balance updated");
                                } catch (error: any) {
                                  toast.error(error.message || "Failed to approve credit request.");
                                } finally {
                                  setApprovingCreditId(null);
                                }
                              }}
                            >
                              {approvingCreditId === r.id ? <BtnSpinner /> : "Approve"}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={rejectingCreditId === r.id}
                              className="btn-premium-outline h-8 text-[11px] px-3 cursor-pointer min-w-[60px]"
                              onClick={async () => {
                                setRejectingCreditId(r.id);
                                try {
                                  await s.rejectCredit(r.id);
                                  toast.success("Credit request rejected");
                                } catch (error: any) {
                                  toast.error(error.message || "Failed to reject credit request.");
                                } finally {
                                  setRejectingCreditId(null);
                                }
                              }}
                            >
                              {rejectingCreditId === r.id ? <BtnSpinner /> : "Reject"}
                            </Button>
                          </TableCell>
                        </motion.tr>
                      );
                    })}
                  </TableBody>
                </Table>
                  }
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Approve Dialog — unchanged logic, added spinner */}
      <Dialog open={!!approveTarget} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">
              Approve {approveTarget?.firstName} {approveTarget?.lastName}
            </DialogTitle>
            <DialogDescription className="text-[#8A8A98]">
              Set membership options. Invitations are sent later when you release a schedule or training.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Member type</Label>
              <Select value={opts.memberType} onValueChange={(v) => setMemberType(v as MemberType)}>
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="adult">Adult</SelectItem>
                  <SelectItem value="junior">Junior</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Grade</Label>
              <Select value={opts.grade} onValueChange={(v) => setOpts((p) => ({ ...p, grade: v }))}>
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {(opts.memberType === "junior" ? juniorGrades : adultGrades).map((g) => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>



            <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
              <div>
                <Label className="text-[11px] font-medium text-[#F1F0EE]">Club membership</Label>
                <p className="text-xs text-muted-foreground">
                  {opts.memberType === "junior"
                    ? "Paid yearly fee."
                    : "Paid yearly fee. Receives play schedule invitations."}
                </p>
              </div>
              <Switch
                checked={opts.membership}
                onCheckedChange={(membership) => setOpts((p) => ({ ...p, membership }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
              <div>
                <Label className="text-[11px] font-medium text-[#F1F0EE]">Training eligible</Label>
                <p className="text-xs text-muted-foreground">
                  {opts.memberType === "adult"
                    ? "Family can enroll children in junior training sessions"
                    : "Eligible for junior training invitations"}
                </p>
              </div>
              <Switch
                checked={opts.trainingEligible}
                onCheckedChange={(trainingEligible) => setOpts((p) => ({ ...p, trainingEligible }))}
              />
            </div>

            {opts.memberType === "junior" && (
              <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
                <div>
                  <Label className="text-[11px] font-medium text-[#F1F0EE]">Play schedule eligible</Label>
                  <p className="text-xs text-muted-foreground">
                    Family head can enroll this junior in play sessions.
                  </p>
                </div>
                <Switch
                  checked={opts.playEligible}
                  onCheckedChange={(playEligible) => setOpts((p) => ({ ...p, playEligible }))}
                />
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
              <div>
                <Label className="text-[11px] font-medium text-[#F1F0EE]">Bypass Credit Consumption</Label>
                <p className="text-xs text-muted-foreground">
                  Do not deduct credits when participating in play schedules.
                </p>
              </div>
              <Switch
                checked={opts.skipCreditConsumption}
                onCheckedChange={(skipCreditConsumption) => setOpts((p) => ({ ...p, skipCreditConsumption }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
              <div>
                <Label className="text-[11px] font-medium text-[#F1F0EE]">Apply Discount</Label>
                <p className="text-xs text-muted-foreground">
                  Use {opts.memberType === "junior" ? "junior" : "adult"} discount settings on play and training fees.
                </p>
              </div>
              <Switch
                checked={opts.applyDiscount}
                onCheckedChange={(applyDiscount) => setOpts((p) => ({ ...p, applyDiscount }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="btn-premium-outline cursor-pointer" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button
              className="btn-premium-solid cursor-pointer min-w-[130px]"
              disabled={submitting}
              onClick={confirmApprove}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <BtnSpinner /> Approving...
                </span>
              ) : (
                "Confirm approval"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!juniorTarget} onOpenChange={(open) => !open && setJuniorTarget(null)}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">
              Approve {juniorTarget?.firstName} {juniorTarget?.lastName}
            </DialogTitle>
            <DialogDescription className="text-[#8A8A98]">
              Activate this junior and set membership options. Parent:{" "}
              {juniorTarget ? parentName(juniorTarget) : "—"}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Grade</Label>
              <Select
                value={juniorOpts.grade || undefined}
                onValueChange={(grade) => setJuniorOpts((p) => ({ ...p, grade }))}
              >
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select grade" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {juniorGrades.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
              <div>
                <Label className="text-[11px] font-medium text-[#F1F0EE]">Club membership</Label>
                <p className="text-xs text-muted-foreground">Paid yearly fee.</p>
              </div>
              <Switch
                checked={juniorOpts.membership}
                onCheckedChange={(membership) => setJuniorOpts((p) => ({ ...p, membership }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
              <div>
                <Label className="text-[11px] font-medium text-[#F1F0EE]">Play schedule eligible</Label>
                <p className="text-xs text-muted-foreground">
                  Family head can enroll this junior in play sessions.
                </p>
              </div>
              <Switch
                checked={juniorOpts.playEligible}
                onCheckedChange={(playEligible) => setJuniorOpts((p) => ({ ...p, playEligible }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
              <div>
                <Label className="text-[11px] font-medium text-[#F1F0EE]">Training eligible</Label>
                <p className="text-xs text-muted-foreground">Can be invited to junior training sessions.</p>
              </div>
              <Switch
                checked={juniorOpts.trainingEligible}
                onCheckedChange={(trainingEligible) =>
                  setJuniorOpts((p) => ({ ...p, trainingEligible }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              className="btn-premium-outline cursor-pointer"
              onClick={() => setJuniorTarget(null)}
            >
              Cancel
            </Button>
            <Button
              className="btn-premium-solid cursor-pointer min-w-[130px]"
              disabled={!!approvingJuniorId || !juniorOpts.grade}
              onClick={() => void confirmJuniorApprove()}
            >
              {approvingJuniorId ? (
                <span className="flex items-center gap-2">
                  <BtnSpinner /> Approving...
                </span>
              ) : (
                "Confirm approval"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
