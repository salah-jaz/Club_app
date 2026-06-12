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
import { Wallet } from "lucide-react";

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
    <div className="space-y-6">
      <PageHeader title="Credits" description="Top-up requests and balance management." />

      <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916]">
        <CardHeader>
          <CardTitle className="text-[13px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase">
            {user.role === "admin" ? "Add credit manually" : "Request credit top-up"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid sm:grid-cols-4 gap-4 items-end">
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Member</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px] cursor-pointer">
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
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Amount</Label>
              <Input
                type="number"
                min="1"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px]"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[11px] font-medium text-[#8A8A98] uppercase tracking-[0.08em]">Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] h-[38px] cursor-pointer"
              />
            </div>
            <Button type="submit" className="sm:col-span-4 btn-premium-solid h-[38px] font-medium hover:cursor-pointer mt-2">
              {user.role === "admin" ? "Add credit" : "Submit request"}
            </Button>
          </form>
        </CardContent>
      </Card>

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
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-[#0C0F0E]/30">
              <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                <TableHead className="text-[11px] font-medium tracking-[0.08em] text-[#4A5E58] uppercase py-3.5 px-6">Member</TableHead>
                <TableHead className="text-[11px] font-medium tracking-[0.08em] text-[#4A5E58] uppercase py-3.5 px-6">Amount</TableHead>
                <TableHead className="text-[11px] font-medium tracking-[0.08em] text-[#4A5E58] uppercase py-3.5 px-6">Date</TableHead>
                <TableHead className="text-[11px] font-medium tracking-[0.08em] text-[#4A5E58] uppercase py-3.5 px-6">Status</TableHead>
                {user.role === "admin" && (
                  <TableHead className="text-[11px] font-medium tracking-[0.08em] text-[#4A5E58] uppercase py-3.5 px-6">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {myReqs.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={user.role === "admin" ? 5 : 4} className="py-12 text-center text-[#8A8A98]">
                    <div className="flex flex-col items-center justify-center gap-2.5">
                      <Wallet className="size-8 text-[#4A5E58]" />
                      <span>No credit requests yet.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                myReqs.map((r) => {
                  const m = s.members.find((x) => x.id === r.memberId);
                  const initials = m ? `${m.firstName[0]}${m.lastName[0]}` : "??";
                  const avatarBgClass = m?.memberType.toLowerCase() === "junior" ? "bg-[#1A1A0A] text-[#F59E0B]" : "bg-[#0D2E22] text-[#10B981]";

                  return (
                    <TableRow key={r.id} className="border-b border-[rgba(255,255,255,0.06)] hover:bg-[#1A2120]/40 transition-colors">
                      <TableCell className="py-3 px-6">
                        <div className="flex items-center gap-3">
                          <Avatar className="size-7.5 border border-white/5">
                            <AvatarFallback className={`${avatarBgClass} font-semibold text-[11px]`}>
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-semibold text-[13.5px] text-[#F1F0EE]">
                            {m ? `${m.firstName} ${m.lastName}` : "Unknown Member"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-6 font-mono text-[14px] text-[#F1F0EE]">
                        {fmtMoney(r.amount)}
                      </TableCell>
                      <TableCell className="py-3 px-6 text-[#8A8A98] text-[13px]">
                        {fmtDate(r.date)}
                      </TableCell>
                      <TableCell className="py-3 px-6">
                        <StatusBadge status={r.status} />
                      </TableCell>
                      {user.role === "admin" && (
                        <TableCell className="py-3 px-6">
                          {r.status === "created" ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={async () => {
                                  try {
                                    await s.approveCredit(r.id);
                                    toast.success("Request approved successfully");
                                  } catch (error: any) {
                                    toast.error(error.message || "Failed to approve request.");
                                  }
                                }}
                                className="px-3 py-1 text-[11.5px] font-medium rounded border border-[rgba(45,212,191,0.3)] text-[#2DD4BF] hover:bg-[#2DD4BF]/10 cursor-pointer transition-all"
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
                                className="px-3 py-1 text-[11.5px] font-medium rounded border border-[rgba(239,68,68,0.3)] text-[#EF4444] hover:bg-[#EF4444]/10 cursor-pointer transition-all"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-[12px] text-[#4A5E58]">Processed</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}