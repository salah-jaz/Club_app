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
import type { MemberType, User } from "@/lib/types";
import { motion } from "framer-motion";
import { EmptyIllustration } from "@/components/EmptyIllustration";

export const Route = createFileRoute("/_authenticated/approvals")({ component: Approvals });

type ApproveOptions = {
  memberType: MemberType;
  grade: string;
  league: boolean;
  trainingEligible: boolean;
};

function defaultApproveOptions(): ApproveOptions {
  return { memberType: "adult", grade: "Beginner", league: false, trainingEligible: false };
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
  const grades = useStore((st) => st.grades);
  const pendingU = s.users.filter((u) => u.status === "created");
  const pendingC = s.creditRequests.filter((c) => c.status === "created");

  const [approveTarget, setApproveTarget] = useState<User | null>(null);
  const [opts, setOpts] = useState<ApproveOptions>(defaultApproveOptions);
  const [submitting, setSubmitting] = useState(false);

  // Per-row loading states
  const [rejectingUserId, setRejectingUserId] = useState<string | null>(null);
  const [approvingCreditId, setApprovingCreditId] = useState<string | null>(null);
  const [rejectingCreditId, setRejectingCreditId] = useState<string | null>(null);

  const openApprove = (u: User) => {
    setApproveTarget(u);
    setOpts(defaultApproveOptions());
  };

  const setMemberType = (memberType: MemberType) => {
    setOpts((p) => ({
      ...p,
      memberType,
      league: memberType === "junior" ? false : p.league,
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
      <PageHeader title="Approvals" description="Review and authorize pending registrations and credit additions." />

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex mb-6 h-10">
          <TabsTrigger
            value="users"
            className="text-[13px] font-medium px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all"
          >
            Member Requests ({pendingU.length})
          </TabsTrigger>
          <TabsTrigger
            value="credits"
            className="text-[13px] font-medium px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all"
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
                <Table>
                  <TableHeader className="bg-[#0C0F0E]/60">
                    <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                      <TableHead className="type-table-head h-11 px-5">Name</TableHead>
                      <TableHead className="type-table-head h-11">Email</TableHead>
                      <TableHead className="type-table-head h-11">Mobile</TableHead>
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
                          <TableCell className="text-[#2DD4BF] type-mono-value text-[14px] font-semibold">{fmtMoney(r.amount)}</TableCell>
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
                  {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
              <div>
                <Label className="text-[11px] font-medium text-[#F1F0EE]">League participant</Label>
                <p className="text-xs text-muted-foreground">Eligible for play schedule invitations</p>
              </div>
              <Switch
                checked={opts.league}
                onCheckedChange={(league) => setOpts((p) => ({ ...p, league }))}
                disabled={opts.memberType === "junior"}
                className="data-[state=checked]:bg-[#10B981]"
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
                className="data-[state=checked]:bg-[#10B981]"
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
    </div>
  );
}
