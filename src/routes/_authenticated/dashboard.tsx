import { createFileRoute, Link } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDateTime, fmtMoney } from "@/lib/format";
import { Users, Wallet, CalendarDays, GraduationCap, Inbox, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

// Per-card accent configs: left border color + icon bg tint + icon text color
const CARD_ACCENTS = [
  { border: "var(--primary)", iconBg: "var(--violet-dim)", iconColor: "var(--primary)" },  // theme brand primary — members
  { border: "#F59E0B", iconBg: "rgba(245,158,11,0.12)",  iconColor: "#F59E0B" }, // amber — requests/credit
  { border: "var(--gold)", iconBg: "var(--gold-dim)",  iconColor: "var(--gold)" }, // theme brand secondary (teal) — credits/invites
  { border: "#818CF8", iconBg: "rgba(129,140,248,0.12)", iconColor: "#818CF8" }, // indigo — sessions/trainings
];

function Stat({
  label,
  value,
  icon: Icon,
  hint,
  index = 0,
  isNumeric = true,
}: {
  label: string;
  value: string | number;
  icon: any;
  hint?: string;
  index?: number;
  isNumeric?: boolean;
}) {
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const numericValue = typeof value === "number" ? value : null;

  return (
    <motion.div variants={staggerItem}>
      <motion.div
        whileHover={{ y: -3, boxShadow: `0 12px 32px rgba(0,0,0,0.35), 0 0 0 1px ${accent.border}22` }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="h-full"
      >
        <Card
          className="signature-card-top h-full"
          style={{
            borderTopColor: accent.border,
            borderTopWidth: 1,
            borderImage: "none",
          }}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="text-[13px] font-semibold tracking-wider text-[var(--text-secondary,#8FA89F)] uppercase">{label}</div>
                <div className="type-stat-value mt-1.5 block">
                  {isNumeric && numericValue !== null ? (
                    <AnimatedCounter value={numericValue} />
                  ) : (
                    value
                  )}
                </div>
                {hint && <div className="type-helper mt-1 block">{hint}</div>}
              </div>
              <div
                className="size-10 rounded-lg grid place-items-center shrink-0"
                style={{ background: accent.iconBg }}
              >
                <Icon className="size-5" style={{ color: accent.iconColor }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// Quick action tile with hover lift + press down
function QuickActionTile({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: any;
  label: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -3, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.16, ease: "easeOut" }}
    >
      <Link
        to={to}
        className="flex flex-col items-start gap-4 p-4 rounded-lg bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.4)] hover:bg-[rgba(16,185,129,0.12)] transition-colors group"
      >
        <motion.div
          whileHover={{ rotate: 8, scale: 1.15 }}
          transition={{ duration: 0.15 }}
          className="text-[#8FA89F] group-hover:text-[#10B981] transition-colors"
        >
          <Icon className="size-5" />
        </motion.div>
        <span className="text-[13px] font-semibold text-[#EEF2F0]">{label}</span>
      </Link>
    </motion.div>
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
  const myInvites = [
    ...s.playInvites.filter(
      (i) => myMembers.some((m) => m.id === i.memberId) && i.status === "open",
    ),
    ...s.trainingInvites.filter(
      (i) => myMembers.some((m) => m.id === i.memberId) && i.status === "open",
    ),
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description="Here's what's happening at your club today."
      />

      {/* Stat Cards — staggered entrance */}
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
      >
        {user.role === "admin" && (
          <>
            <Stat label="Members" value={s.members.length} icon={Users} index={0} />
            <Stat label="Member requests" value={pendingUsers} icon={ShieldCheck} hint="Awaiting approval" index={1} />
            <Stat label="Pending credits" value={pendingCredits} icon={Wallet} hint="Top-up requests" index={2} />
            <Stat label="Active sessions" value={upcomingSchedules.length} icon={CalendarDays} index={3} />
          </>
        )}
        {user.role === "member" && (
          <>
            <Stat label="Family members" value={myMembers.length} icon={Users} index={0} />
            <Stat label="Total credit" value={fmtMoney(totalCredit)} icon={Wallet} index={1} isNumeric={false} />
            <Stat label="Open invitations" value={myInvites.length} icon={Inbox} index={2} />
            <Stat label="Trainings" value={s.trainings.length} icon={GraduationCap} index={3} />
          </>
        )}
        {user.role === "volunteer" && (
          <>
            <Stat label="Trainings" value={s.trainings.length} icon={GraduationCap} index={0} />
            <Stat label="Junior members" value={s.members.filter((m) => m.memberType === "junior").length} icon={Users} index={1} />
            <Stat label="Sessions to mark" value={s.trainingDates.filter((d) => d.attended === null).length} icon={Inbox} index={2} />
            <Stat label="Locations" value={s.locations.length} icon={CalendarDays} index={3} />
          </>
        )}
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        {/* LEFT - Upcoming sessions */}
        <Card className="signature-card-top flex flex-col justify-between">
          <CardHeader className="p-6 pb-4">
            <CardTitle className="type-section-cap">
              Upcoming Play Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center gap-3">
            {upcomingSchedules.length === 0 ? (
              <EmptyIllustration
                icon="shuttlecock"
                title="No sessions scheduled"
                description="Sessions appear here once you create and release a schedule."
                ctaLabel={user.role === "admin" ? "Create a schedule" : undefined}
                ctaTo={user.role === "admin" ? "/schedules" : undefined}
              />
            ) : (
              <div className="space-y-3">
                {upcomingSchedules.slice(0, 4).map((sch, i) => (
                  <motion.div
                    key={sch.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.2 }}
                    className="flex items-center justify-between border border-[rgba(255,255,255,0.06)] bg-[#131916]/40 hover:bg-[#1A2120]/40 rounded-lg p-3 transition-colors"
                  >
                    <div>
                      <div className="font-semibold text-sm text-[#EEF2F0]">{sch.name}</div>
                      <div className="type-helper mt-1">{fmtDateTime(sch.date)} · {sch.location}</div>
                    </div>
                    <StatusBadge status={sch.status} />
                  </motion.div>
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
          <CardHeader className="p-6 pb-4">
            <CardTitle className="type-section-cap">
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            {user.role === "admin" && (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 gap-3"
              >
                <motion.div variants={staggerItem}><QuickActionTile to="/approvals" icon={ShieldCheck} label="Approvals" /></motion.div>
                <motion.div variants={staggerItem}><QuickActionTile to="/schedules" icon={CalendarDays} label="New schedule" /></motion.div>
                <motion.div variants={staggerItem}><QuickActionTile to="/trainings" icon={GraduationCap} label="New training" /></motion.div>
                <motion.div variants={staggerItem}><QuickActionTile to="/members" icon={Users} label="Members" /></motion.div>
              </motion.div>
            )}
            {user.role === "member" && (
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                className="grid grid-cols-2 gap-3"
              >
                <motion.div variants={staggerItem}><QuickActionTile to="/members" icon={Users} label="Add family member" /></motion.div>
                <motion.div variants={staggerItem}><QuickActionTile to="/credits" icon={Wallet} label="Request credit" /></motion.div>
                <motion.div variants={staggerItem}><QuickActionTile to="/invitations" icon={Inbox} label="My invitations" /></motion.div>
                <motion.div variants={staggerItem}><QuickActionTile to="/transactions" icon={Wallet} label="Transactions" /></motion.div>
              </motion.div>
            )}
            {user.role === "volunteer" && (
              <div className="flex flex-col items-center justify-center p-6 bg-[#1A2120] border border-[rgba(255,255,255,0.06)] rounded-lg">
                <motion.div whileHover={{ y: -3, scale: 1.02 }} whileTap={{ scale: 0.97 }} className="w-full">
                  <Link to="/trainings" className="w-full flex flex-col items-center gap-3 py-6 px-4 rounded-lg hover:bg-white/3 transition-colors group">
                    <GraduationCap className="size-8 text-[#8FA89F] group-hover:text-[#10B981] transition-colors" />
                    <span className="text-[14px] font-semibold text-[#EEF2F0]">Manage trainings</span>
                  </Link>
                </motion.div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}