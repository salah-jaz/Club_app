import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/format";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/trainings/$id")({ component: TrainingPage });

function TrainingPage() {
  const { id } = Route.useParams();
  const user = useCurrentUser()!;
  const s = useStore();
  const t = s.trainings.find((x) => x.id === id);
  const juniors = s.members.filter((m) => m.memberType === "junior" && m.status === "active");
  const [selected, setSelected] = useState<string[]>(juniors.map((j) => j.id));
  if (!t) return <Navigate to="/trainings" />;

  const invs = s.trainingInvites.filter((i) => i.trainingId === id);
  const dates = s.trainingDates.filter((d) => d.trainingId === id);
  const uniqueDates = Array.from(new Set(dates.map((d) => d.date))).sort();
  const acceptedMembers = invs.filter((i) => i.status === "accepted").map((i) => i.memberId);

  const memberName = (mid: string) => {
    const m = s.members.find((x) => x.id === mid);
    return m ? `${m.firstName} ${m.lastName}` : "?";
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.name}
        description={`Coach ${t.coach} · ${t.location}`}
        backTo="/trainings"
        actions={<StatusBadge status={t.status} />}
      />

      <Tabs defaultValue={t.status === "open" ? "invite" : "attendance"} className="w-full">
        <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex mb-6 h-10">
          <TabsTrigger 
            value="invite"
            className="text-[13px] font-medium px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all"
          >
            Invitations
          </TabsTrigger>
          <TabsTrigger 
            value="attendance" 
            disabled={t.status === "open"}
            className="text-[13px] font-medium px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Attendance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invite" className="focus-visible:outline-none">
          {t.status === "open" && user.role === "admin" ? (
            <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
              <CardHeader className="pb-3 border-b border-white/[0.03]">
                <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
                  Select juniors to invite
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid sm:grid-cols-2 gap-3 mb-5">
                  {juniors.map((j) => (
                    <label key={j.id} className="flex items-center gap-3.5 p-3.5 bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.3)] hover:bg-[#1A2120]/80 rounded-lg cursor-pointer transition-all">
                      <Checkbox
                        checked={selected.includes(j.id)}
                        onCheckedChange={(c) => setSelected((p) => c ? [...p, j.id] : p.filter((x) => x !== j.id))}
                        className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[#F1F0EE] text-[13px] truncate">{j.firstName} {j.lastName}</div>
                        <div className="text-[11px] text-[#8A8A98] mt-0.5 font-light">Grade {j.grade}</div>
                      </div>
                    </label>
                  ))}
                  {juniors.length === 0 && <p className="text-[13px] font-light text-[#4A5E58] py-3 col-span-2">No active junior members.</p>}
                </div>
                <Button 
                  disabled={selected.length === 0} 
                  className="btn-premium-solid h-9 px-4 font-semibold text-xs cursor-pointer"
                  onClick={async () => {
                    try {
                      await s.releaseTraining(t.id, selected);
                      toast.success(`Invited ${selected.length} juniors & generated ${t.sessions} weekly sessions`);
                    } catch (error: any) {
                      toast.error(error.message || "Failed to release training.");
                    }
                  }}
                >
                  <Send className="size-3.5 mr-1" /> Release & invite
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
              <CardHeader className="pb-3 border-b border-white/[0.03]">
                <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
                  Invitations sent
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-[#0C0F0E]/60">
                    <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                      <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 px-5">Junior Roster</TableHead>
                      <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 text-right px-5">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invs.map((i) => (
                      <TableRow key={i.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors">
                        <TableCell className="font-semibold text-[#F1F0EE] text-[13px] px-5 py-4">{memberName(i.memberId)}</TableCell>
                        <TableCell className="text-right px-5 py-4"><StatusBadge status={i.status} /></TableCell>
                      </TableRow>
                    ))}
                    {invs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-[#4A5E58] py-10 font-light text-[13px]">
                          Not released yet.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="focus-visible:outline-none">
          <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
            <CardHeader className="pb-3 border-b border-white/[0.03]">
              <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
                Attendance ({uniqueDates.length} sessions)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {acceptedMembers.length === 0 ? (
                <p className="p-10 text-center text-[#4A5E58] text-[13px] font-light">No accepted juniors yet.</p>
              ) : (
                <Table>
                  <TableHeader className="bg-[#0C0F0E]/60">
                    <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                      <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 px-5 min-w-[150px]">Junior</TableHead>
                      {uniqueDates.map((d) => (
                        <TableHead key={d} className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase h-11 text-center font-mono">{fmtDate(d)}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {acceptedMembers.map((mid) => (
                      <TableRow key={mid} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors">
                        <TableCell className="font-semibold text-[#F1F0EE] text-[13px] px-5 py-4">{memberName(mid)}</TableCell>
                        {uniqueDates.map((d) => {
                          const rec = dates.find((x) => x.memberId === mid && x.date === d);
                          if (!rec) return <TableCell key={d} className="py-4" />;
                          return (
                            <TableCell key={d} className="text-center py-4">
                              <div className="inline-flex gap-1.5">
                                <button
                                  onClick={async () => {
                                    try {
                                      await s.markAttendance(rec.id, true);
                                    } catch (error: any) {
                                      toast.error(error.message || "Failed to mark attendance.");
                                    }
                                  }}
                                  className={cn(
                                    "size-7 rounded-md grid place-items-center border transition-all cursor-pointer",
                                    rec.attended === true 
                                      ? "bg-[#2DD4BF]/20 text-[#2DD4BF] border-[#2DD4BF]/40" 
                                      : "bg-white/5 border-white/10 hover:bg-[#2DD4BF]/10 hover:text-[#2DD4BF] hover:border-[#2DD4BF]/30 text-[#8A8A98]"
                                  )}
                                  title="Attended"
                                >
                                  <CheckCircle2 className="size-4" />
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      await s.markAttendance(rec.id, false);
                                    } catch (error: any) {
                                      toast.error(error.message || "Failed to mark attendance.");
                                    }
                                  }}
                                  className={cn(
                                    "size-7 rounded-md grid place-items-center border transition-all cursor-pointer",
                                    rec.attended === false 
                                      ? "bg-[#EF4444]/20 text-[#EF4444] border-[#EF4444]/40" 
                                      : "bg-white/5 border-white/10 hover:bg-[#EF4444]/10 hover:text-[#EF4444] hover:border-[#EF4444]/30 text-[#8A8A98]"
                                  )}
                                  title="Absent"
                                >
                                  <XCircle className="size-4" />
                                </button>
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
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