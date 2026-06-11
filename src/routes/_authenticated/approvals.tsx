import { createFileRoute, Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/approvals")({ component: Approvals });

function Approvals() {
  const user = useCurrentUser()!;
  if (user.role !== "admin") return <Navigate to="/dashboard" />;
  const s = useStore();
  const pendingU = s.users.filter((u) => u.status === "created");
  const pendingC = s.creditRequests.filter((c) => c.status === "created");

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

        <TabsContent value="users" className="focus-visible:outline-none">
          <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-[#0C0F0E]/60">
                  <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 px-5">Name</TableHead>
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11">Email</TableHead>
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11">Mobile</TableHead>
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11">Registered</TableHead>
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11">Status</TableHead>
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 text-right px-5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingU.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-[#4A5E58] py-10 font-light text-[13px]">
                        All caught up. No pending member requests.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingU.map((u) => (
                      <TableRow key={u.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors">
                        <TableCell className="font-semibold text-[#F1F0EE] text-[13px] px-5 py-4">
                          {u.firstName} {u.lastName}
                        </TableCell>
                        <TableCell className="text-[#8A8A98] text-[13px]">{u.email}</TableCell>
                        <TableCell className="text-[#8A8A98] text-[13px] font-mono">{u.mobile}</TableCell>
                        <TableCell className="text-[#8A8A98] text-[13px] font-mono">{fmtDate(u.createdAt)}</TableCell>
                        <TableCell className="py-4"><StatusBadge status={u.status} /></TableCell>
                        <TableCell className="text-right px-5 py-4 space-x-2">
                          <Button 
                            size="sm" 
                            className="btn-premium-solid h-8 text-[11px] px-3 font-semibold cursor-pointer" 
                            onClick={async () => {
                              try {
                                await s.approveUser(u.id);
                                toast.success(`${u.firstName} approved`);
                              } catch (error: any) {
                                toast.error(error.message || "Failed to approve user.");
                              }
                            }}
                          >
                            Approve
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="btn-premium-outline h-8 text-[11px] px-3 cursor-pointer" 
                            onClick={async () => {
                              try {
                                await s.rejectUser(u.id);
                                toast.success(`${u.firstName} rejected`);
                              } catch (error: any) {
                                toast.error(error.message || "Failed to reject user.");
                              }
                            }}
                          >
                            Reject
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="credits" className="focus-visible:outline-none">
          <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-[#0C0F0E]/60">
                  <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 px-5">Member</TableHead>
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11">Amount</TableHead>
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11">Date</TableHead>
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11">Status</TableHead>
                    <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 text-right px-5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingC.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-[#4A5E58] py-10 font-light text-[13px]">
                        No pending credit requests.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingC.map((r) => {
                      const m = s.members.find((x) => x.id === r.memberId);
                      return (
                        <TableRow key={r.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors">
                          <TableCell className="font-semibold text-[#F1F0EE] text-[13px] px-5 py-4">
                            {m?.firstName} {m?.lastName}
                          </TableCell>
                          <TableCell className="text-[#2DD4BF] font-mono text-[14px] font-medium">{fmtMoney(r.amount)}</TableCell>
                          <TableCell className="text-[#8A8A98] text-[13px] font-mono">{fmtDate(r.date)}</TableCell>
                          <TableCell className="py-4"><StatusBadge status={r.status} /></TableCell>
                          <TableCell className="text-right px-5 py-4 space-x-2">
                            <Button 
                              size="sm" 
                              className="btn-premium-solid h-8 text-[11px] px-3 font-semibold cursor-pointer" 
                              onClick={async () => {
                                try {
                                  await s.approveCredit(r.id);
                                  toast.success("Credit approved & balance updated");
                                } catch (error: any) {
                                  toast.error(error.message || "Failed to approve credit request.");
                                }
                              }}
                            >
                              Approve
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="btn-premium-outline h-8 text-[11px] px-3 cursor-pointer" 
                              onClick={async () => {
                                try {
                                  await s.rejectCredit(r.id);
                                  toast.success("Credit request rejected");
                                } catch (error: any) {
                                  toast.error(error.message || "Failed to reject credit request.");
                                }
                              }}
                            >
                              Reject
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}