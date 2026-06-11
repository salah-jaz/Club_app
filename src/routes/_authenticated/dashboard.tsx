import { createFileRoute, Link } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { Users, Wallet, CalendarDays, GraduationCap, Inbox, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function Stat({ label, value, icon: Icon, hint }: { label: string; value: string | number; icon: any; hint?: string }) {
  return (
    <Card className="signature-card-top">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
            {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
          </div>
          <div className="size-10 rounded-lg bg-accent text-accent-foreground grid place-items-center">
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


function Dashboard() {
  const user = useCurrentUser()!;
  const s = useStore();
  const myMembers = s.members.filter((m) => m.userId === user.id);
  const totalCredit = myMembers.reduce((t, m) => t + m.credit, 0);
  const pendingUsers = s.users.filter((u) => u.status === "created").length;
  const pendingCredits = s.creditRequests.filter((c) => c.status === "created").length;
  const upcomingSchedules = s.schedules.filter((x) => x.status !== "closed");
  const myInvites = s.playInvites.filter(
    (i) => myMembers.some((m) => m.id === i.memberId) && i.status === "open",
  );

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description="Here's what's happening at your club today."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {user.role === "admin" && (
          <>
            <Stat label="Members" value={s.members.length} icon={Users} />
            <Stat label="Member requests" value={pendingUsers} icon={ShieldCheck} hint="Awaiting approval" />
            <Stat label="Pending credits" value={pendingCredits} icon={Wallet} hint="Top-up requests" />
            <Stat label="Active sessions" value={upcomingSchedules.length} icon={CalendarDays} />
          </>
        )}
        {user.role === "member" && (
          <>
            <Stat label="Family members" value={myMembers.length} icon={Users} />
            <Stat label="Total credit" value={fmtMoney(totalCredit)} icon={Wallet} />
            <Stat label="Open invitations" value={myInvites.length} icon={Inbox} />
            <Stat label="Trainings" value={s.trainings.length} icon={GraduationCap} />
          </>
        )}
        {user.role === "volunteer" && (
          <>
            <Stat label="Trainings" value={s.trainings.length} icon={GraduationCap} />
            <Stat label="Junior members" value={s.members.filter((m) => m.memberType === "junior").length} icon={Users} />
            <Stat label="Sessions to mark" value={s.trainingDates.filter((d) => d.attended === null).length} icon={Inbox} />
            <Stat label="Locations" value={s.locations.length} icon={CalendarDays} />
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        {/* LEFT - Upcoming sessions */}
        <Card className="signature-card-top flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-[13px] font-medium tracking-[0.12em] text-[#8A8A9A] uppercase">
              Upcoming Play Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center gap-3">
            {upcomingSchedules.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-10 px-4">
                <div className="text-[#4A4A5A] mb-4">
                  {/* Shuttlecock Icon */}
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a4 4 0 0 0-4 4v2.5a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V6a4 4 0 0 0-4-4Z"/>
                    <path d="M12 9v11"/>
                    <path d="m8 15 4 5 4-5"/>
                    <path d="M7 11c0 2 2.5 4 5 4s5-2 5-4"/>
                  </svg>
                </div>
                <div className="text-[14px] font-normal text-[#8A8A9A] mb-1">
                  No sessions scheduled
                </div>
                <p className="text-[12px] font-light text-[#4A4A5A] max-w-[280px] mb-6">
                  Sessions appear here once you create and release a schedule.
                </p>
                {user.role === "admin" && (
                  <Button asChild className="btn-premium-violet-outline h-[38px] px-4 font-medium text-[13px] hover:cursor-pointer">
                    <Link to="/schedules">Create a schedule →</Link>
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingSchedules.slice(0, 4).map((sch) => (
                  <div key={sch.id} className="flex items-center justify-between border border-[rgba(255,255,255,0.06)] bg-[#131916]/40 hover:bg-[#1A2120]/40 rounded-lg p-3 transition-colors">
                    <div>
                      <div className="font-semibold text-sm text-[#F1F0EE]">{sch.name}</div>
                      <div className="text-xs text-[#8A8A9A] mt-1">{fmtDateTime(sch.date)} · {sch.location}</div>
                    </div>
                    <StatusBadge status={sch.status} />
                  </div>
                ))}
                {user.role === "admin" && (
                  <Button asChild variant="outline" size="sm" className="w-full mt-4 btn-premium-outline cursor-pointer">
                    <Link to="/schedules">Manage schedules</Link>
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* RIGHT - Quick actions */}
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-[13px] font-medium tracking-[0.12em] text-[#8A8A9A] uppercase">
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            {user.role === "admin" && (
              <div className="grid grid-cols-2 gap-3">
                <Link to="/approvals" className="flex flex-col items-start gap-4 p-4 rounded-lg bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.4)] hover:bg-[rgba(16,185,129,0.12)] transition-all group">
                  <ShieldCheck className="size-5 text-[#8A8A98] group-hover:text-[#10B981] transition-colors" />
                  <span className="text-[13px] font-medium text-[#F1F0EE]">Approvals</span>
                </Link>
                <Link to="/schedules" className="flex flex-col items-start gap-4 p-4 rounded-lg bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.4)] hover:bg-[rgba(16,185,129,0.12)] transition-all group">
                  <CalendarDays className="size-5 text-[#8A8A98] group-hover:text-[#10B981] transition-colors" />
                  <span className="text-[13px] font-medium text-[#F1F0EE]">New schedule</span>
                </Link>
                <Link to="/trainings" className="flex flex-col items-start gap-4 p-4 rounded-lg bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.4)] hover:bg-[rgba(16,185,129,0.12)] transition-all group">
                  <GraduationCap className="size-5 text-[#8A8A98] group-hover:text-[#10B981] transition-colors" />
                  <span className="text-[13px] font-medium text-[#F1F0EE]">New training</span>
                </Link>
                <Link to="/members" className="flex flex-col items-start gap-4 p-4 rounded-lg bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.4)] hover:bg-[rgba(16,185,129,0.12)] transition-all group">
                  <Users className="size-5 text-[#8A8A98] group-hover:text-[#10B981] transition-colors" />
                  <span className="text-[13px] font-medium text-[#F1F0EE]">Members</span>
                </Link>
              </div>
            )}
            {user.role === "member" && (
              <div className="grid grid-cols-2 gap-3">
                <Link to="/members" className="flex flex-col items-start gap-4 p-4 rounded-lg bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.4)] hover:bg-[rgba(16,185,129,0.12)] transition-all group">
                  <Users className="size-5 text-[#8A8A98] group-hover:text-[#10B981] transition-colors" />
                  <span className="text-[13px] font-medium text-[#F1F0EE]">Add family member</span>
                </Link>
                <Link to="/credits" className="flex flex-col items-start gap-4 p-4 rounded-lg bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.4)] hover:bg-[rgba(16,185,129,0.12)] transition-all group">
                  <Wallet className="size-5 text-[#8A8A98] group-hover:text-[#10B981] transition-colors" />
                  <span className="text-[13px] font-medium text-[#F1F0EE]">Request credit</span>
                </Link>
                <Link to="/invitations" className="flex flex-col items-start gap-4 p-4 rounded-lg bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.4)] hover:bg-[rgba(16,185,129,0.12)] transition-all group">
                  <Inbox className="size-5 text-[#8A8A98] group-hover:text-[#10B981] transition-colors" />
                  <span className="text-[13px] font-medium text-[#F1F0EE]">My invitations</span>
                </Link>
                <Link to="/transactions" className="flex flex-col items-start gap-4 p-4 rounded-lg bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.4)] hover:bg-[rgba(16,185,129,0.12)] transition-all group">
                  <Wallet className="size-5 text-[#8A8A98] group-hover:text-[#10B981] transition-colors" />
                  <span className="text-[13px] font-medium text-[#F1F0EE]">Transactions</span>
                </Link>
              </div>
            )}
            {user.role === "volunteer" && (
              <div className="flex flex-col items-center justify-center p-6 bg-[#1A2120] border border-[rgba(255,255,255,0.06)] rounded-lg">
                <Link to="/trainings" className="w-full flex flex-col items-center gap-3 py-6 px-4 rounded-lg hover:bg-white/3 transition-colors group">
                  <GraduationCap className="size-8 text-[#8A8A98] group-hover:text-[#10B981] transition-colors" />
                  <span className="text-[14px] font-medium text-[#F1F0EE]">Manage trainings</span>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}