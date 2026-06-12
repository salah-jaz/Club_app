import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { fmtDate, fmtMoney } from "@/lib/format";
import { Wallet, Plus, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/credits")({ component: CreditsPage });

function CreditsPage() {
  const user = useCurrentUser()!;
  const s = useStore();
  const myMembers = user.role === "admin" ? s.members : s.members.filter((m) => m.userId === user.id);
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const urlMemberId = searchParams?.get("memberId") || "";
  const [memberId, setMemberId] = useState(urlMemberId || myMembers[0]?.id || "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const myReqs = s.creditRequests.filter((r) =>
    user.role === "admin" ? true : myMembers.some((m) => m.id === r.memberId),
  );

  const pendingCount = myReqs.filter((r) => r.status === "created").length;
  const totalPendingAmount = myReqs.filter((r) => r.status === "created").reduce((sum, r) => sum + r.amount, 0);
  const totalApprovedAmount = myReqs.filter((r) => r.status === "approved").reduce((sum, r) => sum + r.amount, 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !amount) return;
    try {
      await s.requestCredit(memberId, parseFloat(amount), date);
      toast.success(
        user.role === "admin"
          ? "Credit added manually successfully"
          : "Credit request submitted for approval"
      );
      setAmount("");
    } catch (error: any) {
      toast.error(error.message || "Failed to submit credit request.");
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <PageHeader 
        title="Credits" 
        description="Top-up requests and balance management." 
        actions={
          pendingCount > 0 ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20">
              <span className="inline-block size-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
              {pendingCount} Pending Requests
            </span>
          ) : null
        }
      />

      {/* ADD CREDIT FORM */}
      <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916] signature-card-top">
        <CardHeader className="flex flex-row items-center gap-3 border-b border-white/[0.03] py-4 px-6">
          <div className="size-8 rounded-lg bg-[#10B981]/10 text-[#10B981] flex items-center justify-center shrink-0">
            <Plus className="size-4.5" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold tracking-wide text-[#F1F0EE] uppercase">
              {user.role === "admin" ? "Add credit manually" : "Request credit top-up"}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={submit} className="grid sm:grid-cols-5 gap-4 items-end">
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Member</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-11 md:h-[38px] cursor-pointer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {myMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="cursor-pointer hover:bg-white/5">
                      {m.firstName} {m.lastName} — bal {fmtMoney(m.credit)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Amount</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-11 md:h-[38px] focus-visible:ring-1 focus-visible:ring-[#10B981]"
              />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-11 md:h-[38px] cursor-pointer focus-visible:ring-1 focus-visible:ring-[#10B981]"
              />
            </div>
            <Button type="submit" className="w-full sm:col-span-1 btn-premium-solid h-11 md:h-[38px] font-semibold text-xs hover:cursor-pointer flex items-center justify-center gap-1.5 transition-all">
              <Plus className="size-4 shrink-0" />
              <span>{user.role === "admin" ? "Add credit" : "Submit"}</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* REQUESTS LIST & TABLE */}
      <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916] overflow-hidden">
        <CardHeader className="border-b border-[rgba(255,255,255,0.06)] py-4.5 px-6 flex flex-row items-center justify-between">
          <CardTitle className="text-[13px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase flex items-center gap-2">
            <span>Credit Requests</span>
            {pendingCount > 0 && (
              <span className="text-[11px] font-semibold bg-[#F59E0B]/10 text-[#F59E0B] px-2 py-0.5 rounded-full">
                {pendingCount} pending
              </span>
            )}
          </CardTitle>
        </CardHeader>
        
        {/* Real-time Summary Statistics Banner */}
        <div className="grid grid-cols-3 gap-4 p-5 border-b border-[rgba(255,255,255,0.06)] bg-[#1A2120]/25 text-sm">
          <div>
            <div className="text-[10px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Pending Requests</div>
            <div className="font-mono text-base font-semibold text-[#F59E0B] mt-0.5">{pendingCount}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Pending Amount</div>
            <div className="font-mono text-base font-semibold text-[#F1F0EE] mt-0.5">{fmtMoney(totalPendingAmount)}</div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Approved Total</div>
            <div className="font-mono text-base font-semibold text-[#10B981] mt-0.5">{fmtMoney(totalApprovedAmount)}</div>
          </div>
        </div>

        <CardContent className="p-0">
          {/* Mobile view */}
          <div className="block md:hidden divide-y divide-[rgba(255,255,255,0.06)]">
            {myReqs.length === 0 ? (
              <div className="py-16 text-center text-[#8A8A98] flex flex-col items-center justify-center gap-3 max-w-sm mx-auto">
                <div className="size-14 rounded-full bg-[rgba(16,185,129,0.08)] text-[#10B981] flex items-center justify-center mb-1">
                  <Wallet className="size-7" />
                </div>
                <div>
                  <h3 className="font-playfair text-base text-[#F1F0EE] font-normal">No credit requests</h3>
                  <p className="text-xs text-[#8A8A9A] font-light mt-1.5 leading-relaxed">
                    There are currently no credit requests logged in your roster. Any manual adjustments or top-up requests will appear here.
                  </p>
                </div>
              </div>
            ) : (
              myReqs.map((r) => {
                const m = s.members.find((x) => x.id === r.memberId);
                const initials = m ? `${m.firstName[0]}${m.lastName[0]}` : "??";
                const avatarBgClass = m?.memberType.toLowerCase() === "junior" ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#10B981]";

                return (
                  <div key={r.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-8 border border-white/5">
                          <AvatarFallback className={`${avatarBgClass} font-semibold text-[11px]`}>
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-semibold text-[13.5px] text-[#F1F0EE] truncate">
                          {m ? `${m.firstName} ${m.lastName}` : "Unknown Member"}
                        </span>
                      </div>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-[#8A8A98]">Date: {fmtDate(r.date)}</span>
                      <span className="font-mono font-semibold text-[14.5px] text-[#F1F0EE]">{fmtMoney(r.amount)}</span>
                    </div>
                    {user.role === "admin" && r.status === "created" && (
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          onClick={async () => {
                            try {
                              await s.approveCredit(r.id);
                              toast.success("Request approved successfully");
                            } catch (error: any) {
                              toast.error(error.message || "Failed to approve request.");
                            }
                          }}
                          className="flex-1 min-h-[44px] py-2 text-center text-xs font-semibold rounded-lg border border-[rgba(16,185,129,0.3)] text-[#10B981] bg-[#10B981]/5 hover:bg-[#10B981]/10 active:bg-[#10B981]/20 cursor-pointer transition-all flex items-center justify-center"
                        >
                          Approve
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await s.rejectCredit(r.id);
                              toast.success("Request rejected successfully");
                            } catch (error: any) {
                              toast.error(error.message || "Failed to reject request.");
                            }
                          }}
                          className="flex-1 min-h-[44px] py-2 text-center text-xs font-semibold rounded-lg border border-[rgba(239,68,68,0.3)] text-[#EF4444] bg-[#EF4444]/5 hover:bg-[#EF4444]/10 active:bg-[#EF4444]/20 cursor-pointer transition-all flex items-center justify-center"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop view */}
          <div className="hidden md:block">
            <Table>
              <TableHeader className="bg-[#0C0F0E]/30">
                <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                  <TableHead className="text-[11px] font-medium tracking-[0.08em] text-[#4A5E58] uppercase py-3.5 px-6">Member</TableHead>
                  <TableHead className="text-[11px] font-medium tracking-[0.08em] text-[#4A5E58] uppercase py-3.5 px-6">Amount</TableHead>
                  <TableHead className="text-[11px] font-medium tracking-[0.08em] text-[#4A5E58] uppercase py-3.5 px-6">Date</TableHead>
                  <TableHead className="text-[11px] font-medium tracking-[0.08em] text-[#4A5E58] uppercase py-3.5 px-6">Status</TableHead>
                  {user.role === "admin" && (
                    <TableHead className="text-[11px] font-medium tracking-[0.08em] text-[#4A5E58] uppercase py-3.5 px-6 text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {myReqs.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={user.role === "admin" ? 5 : 4} className="py-16 text-center text-[#8A8A98]">
                      <div className="py-8 flex flex-col items-center justify-center gap-3 max-w-sm mx-auto">
                        <div className="size-14 rounded-full bg-[rgba(16,185,129,0.08)] text-[#10B981] flex items-center justify-center mb-1">
                          <Wallet className="size-7" />
                        </div>
                        <div>
                          <h3 className="font-playfair text-base text-[#F1F0EE] font-normal">No credit requests</h3>
                          <p className="text-xs text-[#8A8A9A] font-light mt-1.5 leading-relaxed">
                            There are currently no credit requests logged in your roster. Any manual adjustments or top-up requests will appear here.
                          </p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  myReqs.map((r) => {
                    const m = s.members.find((x) => x.id === r.memberId);
                    const initials = m ? `${m.firstName[0]}${m.lastName[0]}` : "??";
                    const avatarBgClass = m?.memberType.toLowerCase() === "junior" ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#10B981]";

                    return (
                      <TableRow key={r.id} className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[#1A2120]/45 transition-colors odd:bg-white/[0.01] even:bg-transparent">
                        <TableCell className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-8.5 border border-white/5">
                              <AvatarFallback className={`${avatarBgClass} font-semibold text-[12px]`}>
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-semibold text-[13.5px] text-[#F1F0EE]">
                              {m ? `${m.firstName} ${m.lastName}` : "Unknown Member"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-6 font-mono text-[14px] text-[#F1F0EE] font-medium">
                          {fmtMoney(r.amount)}
                        </TableCell>
                        <TableCell className="py-4 px-6 text-[#8A8A98] text-[13px]">
                          {fmtDate(r.date)}
                        </TableCell>
                        <TableCell className="py-4 px-6">
                          <StatusBadge status={r.status} />
                        </TableCell>
                        {user.role === "admin" && (
                          <TableCell className="py-4 px-6 text-right">
                            {r.status === "created" ? (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={async () => {
                                    try {
                                      await s.approveCredit(r.id);
                                      toast.success("Request approved successfully");
                                    } catch (error: any) {
                                      toast.error(error.message || "Failed to approve request.");
                                    }
                                  }}
                                  className="size-8 rounded-lg border border-[rgba(16,185,129,0.3)] text-[#10B981] bg-[#10B981]/5 hover:bg-[#10B981]/15 flex items-center justify-center transition-all cursor-pointer"
                                  title="Approve Request"
                                >
                                  <Check className="size-4" />
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      await s.rejectCredit(r.id);
                                      toast.success("Request rejected successfully");
                                    } catch (error: any) {
                                      toast.error(error.message || "Failed to reject request.");
                                    }
                                  }}
                                  className="size-8 rounded-lg border border-[rgba(239,68,68,0.3)] text-[#EF4444] bg-[#EF4444]/5 hover:bg-[#EF4444]/15 flex items-center justify-center transition-all cursor-pointer"
                                  title="Reject Request"
                                >
                                  <X className="size-4" />
                                </button>
                              </div>
                            ) : (
                              <span className="text-[12px] text-[#4A5E58] font-medium uppercase tracking-[0.04em]">Processed</span>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}