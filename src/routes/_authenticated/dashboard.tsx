import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import {
  Users,
  Wallet,
  CalendarDays,
  GraduationCap,
  Inbox,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import { staggerContainer, staggerItem } from "@/components/MotionWrapper";
import type { Member, PlayInvitation, PlaySchedule, Training } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/useNow";
import {
  getTrainingSessionPhase,
  getPlaySessionPhase,
  resolveTrainingDisplayStatus,
  isSessionInFuture,
  parseDateTimeMs,
  aggregateOpenInvitePhase,
} from "@/lib/sessionTiming";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

function scheduleDateIso(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface UpcomingTrainingCardItem extends Training {
  weeklySessions: Training[];
  weeklyDatesFormatted: string[];
}

export function sessionMonthKey(dateStr: string): string {
  if (!dateStr) return "";
  const str = String(dateStr).trim();
  const m = str.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  const ms = parseDateTimeMs(str);
  const d = Number.isFinite(ms) ? new Date(ms) : new Date(str);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatSessionMonthDay(dateStr: string): string {
  if (!dateStr) return "";
  const str = String(dateStr).trim();
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    return d.toLocaleDateString("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    });
  }
  const ms = parseDateTimeMs(str);
  const d = Number.isFinite(ms) ? new Date(ms) : new Date(str);
  return Number.isNaN(d.getTime())
    ? str
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function groupUpcomingTrainings(params: {
  trainings: Training[];
  role: string;
  acceptedTrainingIds: Set<string>;
  now: number;
}): UpcomingTrainingCardItem[] {
  const { trainings, role, acceptedTrainingIds, now } = params;

  // 1. Filter candidate sessions according to role access and active status
  const candidateSessions = [...trainings].filter((x) => {
    if (x.status === "closed") return false;
    if (role === "admin" || role === "volunteer") return true;
    return acceptedTrainingIds.has(x.id);
  });

  // 2. Group candidate sessions by program series (parentId || id)
  const seriesGroups: Record<string, Training[]> = {};
  for (const t of candidateSessions) {
    const pid = t.parentId || t.id;
    if (!seriesGroups[pid]) seriesGroups[pid] = [];
    seriesGroups[pid].push(t);
  }

  const cards: UpcomingTrainingCardItem[] = [];

  for (const pid of Object.keys(seriesGroups)) {
    const seriesCandidateSessions = seriesGroups[pid];

    // Reference all sessions in the series from original trainings array to resolve canonical primary session
    const allSeriesSessions = trainings.filter((t) => (t.parentId || t.id) === pid);

    // Group candidate sessions by month
    const monthGroups: Record<string, Training[]> = {};
    for (const session of seriesCandidateSessions) {
      const monthKey = sessionMonthKey(session.startDate);
      if (!monthKey) continue;
      if (!monthGroups[monthKey]) monthGroups[monthKey] = [];
      monthGroups[monthKey].push(session);
    }

    const monthKeys = Object.keys(monthGroups).sort();

    for (const monthKey of monthKeys) {
      const monthSessions = monthGroups[monthKey].sort(
        (a, b) => (parseDateTimeMs(a.startDate) || 0) - (parseDateTimeMs(b.startDate) || 0),
      );
      if (monthSessions.length === 0) continue;

      // The card must remain visible until the final session date and time has passed
      const finalSession = monthSessions[monthSessions.length - 1];
      if (!isSessionInFuture(finalSession.startDate, now)) {
        continue;
      }

      // Canonical primary session for this month from the series
      const allMonthSessions = allSeriesSessions
        .filter((s) => sessionMonthKey(s.startDate) === monthKey)
        .sort(
          (a, b) => (parseDateTimeMs(a.startDate) || 0) - (parseDateTimeMs(b.startDate) || 0),
        );
      const canonicalPrimary = allMonthSessions[0] || monthSessions[0];

      const weeklyDatesFormatted = monthSessions.map((ms) =>
        formatSessionMonthDay(ms.startDate),
      );

      cards.push({
        ...canonicalPrimary,
        id: `${pid}_${monthKey}`,
        name: canonicalPrimary.name,
        startDate: canonicalPrimary.startDate,
        location: canonicalPrimary.location,
        status: canonicalPrimary.status,
        weeklySessions: monthSessions,
        weeklyDatesFormatted,
      });
    }
  }

  // Sort cards chronologically by start date
  return cards.sort(
    (a, b) => (parseDateTimeMs(a.startDate) || 0) - (parseDateTimeMs(b.startDate) || 0),
  );
}

const CARD_ACCENTS = [
  { border: "var(--primary)", iconBg: "var(--violet-dim)", iconColor: "var(--primary)" },
  { border: "#F59E0B", iconBg: "rgba(245,158,11,0.12)", iconColor: "#F59E0B" },
  { border: "var(--gold)", iconBg: "var(--gold-dim)", iconColor: "var(--gold)" },
  { border: "#818CF8", iconBg: "rgba(129,140,248,0.12)", iconColor: "#818CF8" },
];

function Stat({
  label,
  value,
  icon: Icon,
  hint,
  index = 0,
  isNumeric = true,
  to,
}: {
  label: string;
  value: string | number;
  icon: any;
  hint?: string;
  index?: number;
  isNumeric?: boolean;
  to?: string;
}) {
  const accent = CARD_ACCENTS[index % CARD_ACCENTS.length];
  const numericValue = typeof value === "number" ? value : null;

  const cardElement = (
    <motion.div variants={staggerItem} className="h-full">
      <motion.div
        whileHover={{
          y: -3,
          boxShadow: `0 12px 32px rgba(0,0,0,0.35), 0 0 0 1px ${accent.border}22`,
        }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="h-full"
      >
        <Card
          className={cn(
            "signature-card-top h-full transition-all duration-200",
            to && "cursor-pointer hover:bg-white/[0.02]",
          )}
          style={{
            borderTopColor: accent.border,
            borderTopWidth: 1,
            borderImage: "none",
          }}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="text-[13px] font-semibold tracking-wider text-[var(--text-secondary,#8FA89F)] uppercase flex items-center gap-1.5 group">
                  {label}
                  {to && (
                    <ArrowRight className="size-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all text-[#34D399]" />
                  )}
                </div>
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

  if (to) {
    return (
      <Link to={to} className="block h-full group focus:outline-none">
        {cardElement}
      </Link>
    );
  }

  return cardElement;
}

function HeaderQuickAction({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="btn-premium-outline h-9 cursor-pointer">
      <Link to={to} className="inline-flex items-center gap-1.5">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    </Button>
  );
}

function ScheduleListCard({
  title,
  schedules,
  holidays,
  emptyTitle,
  emptyDescription,
  emptyCtaLabel,
  emptyCtaTo,
  viewAllTo,
  viewAllLabel = "View All",
  footer,
  myMembers,
  playInvites,
  isMemberRole = false,
}: {
  title: string;
  schedules: PlaySchedule[];
  holidays: string[];
  emptyTitle: string;
  emptyDescription: string;
  emptyCtaLabel?: string;
  emptyCtaTo?: string;
  viewAllTo?: string;
  viewAllLabel?: string;
  footer?: ReactNode;
  myMembers?: Member[];
  playInvites?: PlayInvitation[];
  isMemberRole?: boolean;
}) {
  return (
    <Card className="signature-card-top flex flex-col">
      <CardHeader className="px-6 pt-5 pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="type-section-cap">{title}</CardTitle>
        {viewAllTo && schedules.length > 0 && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-[#34D399] hover:text-[#10B981] cursor-pointer px-2"
          >
            <Link to={viewAllTo} className="inline-flex items-center gap-1">
              {viewAllLabel}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-start gap-3 px-6 pt-2 pb-5">
        {schedules.length === 0 ? (
          <EmptyIllustration
            icon="shuttlecock"
            title={emptyTitle}
            description={emptyDescription}
            ctaLabel={emptyCtaLabel}
            ctaTo={emptyCtaTo}
          />
        ) : (
          <div className="space-y-3">
            {schedules.slice(0, 4).map((sch, i) => {
              const iso = scheduleDateIso(sch.date);
              const isHoliday = !!iso && holidays.includes(iso);
              const rowTarget = viewAllTo || "/schedules";

              return (
                <motion.div
                  key={sch.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.2 }}
                >
                  <Link
                    to={rowTarget}
                    className="flex items-center justify-between border border-[rgba(255,255,255,0.06)] bg-[#131916]/40 hover:bg-[#1A2120]/60 rounded-lg p-3 transition-colors gap-3 cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-sm text-[#EEF2F0] group-hover:text-primary transition-colors">
                          {sch.name}
                        </div>
                        {isHoliday && (
                          <span className="inline-flex items-center rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#FBBF24] uppercase">
                            Holiday
                          </span>
                        )}
                      </div>
                      <div className="type-helper mt-1">
                        {fmtDateTime(sch.date)} · {sch.location}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={sch.status} />
                    </div>
                  </Link>
                </motion.div>
              );
            })}
            {footer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TrainingListCard({
  title,
  trainings,
  emptyTitle,
  emptyDescription,
  viewAllTo,
  viewAllLabel = "View All",
  footer,
}: {
  title: string;
  trainings: UpcomingTrainingCardItem[];
  emptyTitle: string;
  emptyDescription?: string;
  viewAllTo?: string;
  viewAllLabel?: string;
  footer?: ReactNode;
}) {
  const now = useNow();

  return (
    <Card className="signature-card-top flex flex-col">
      <CardHeader className="px-6 pt-5 pb-2 flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="type-section-cap">{title}</CardTitle>
        {viewAllTo && trainings.length > 0 && (
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 text-[#34D399] hover:text-[#10B981] cursor-pointer px-2 text-xs"
          >
            <Link to={viewAllTo} className="inline-flex items-center gap-1">
              {viewAllLabel}
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-start gap-3 px-6 pt-2 pb-5">
        {trainings.length === 0 ? (
          <EmptyIllustration
            icon="training"
            title={emptyTitle}
            description={emptyDescription ?? ""}
          />
        ) : (
          <div className="space-y-3">
            {trainings.slice(0, 4).map((tr, i) => {
              const rowTarget = viewAllTo || "/trainings";
              const sessionPhase =
                tr.status !== "cancelled"
                  ? aggregateOpenInvitePhase(tr.weeklySessions, now)
                  : null;
              return (
                <motion.div
                  key={tr.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.2 }}
                >
                  <Link
                    to={rowTarget}
                    className="flex items-center justify-between border border-[rgba(255,255,255,0.06)] bg-[#131916]/40 hover:bg-[#1A2120]/60 rounded-lg p-3 transition-colors gap-3 cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-sm text-[#EEF2F0] group-hover:text-primary transition-colors">
                          {tr.name}
                        </div>
                      </div>
                      <div className="type-helper mt-1">
                        Sessions: {tr.weeklyDatesFormatted.join(" · ")}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <StatusBadge status={resolveTrainingDisplayStatus(tr.status, sessionPhase)} />
                    </div>
                  </Link>
                </motion.div>
              );
            })}
            {footer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const user = useCurrentUser()!;
  const s = useStore();
  const now = useNow();
  const myMembers = s.members.filter((m) => m.userId === user.id);
  const totalCredit = myMembers.reduce((t, m) => t + m.credit, 0);
  const pendingUsers = s.users.filter((u) => u.status === "created").length;
  const pendingCredits = s.creditRequests.filter(
    (c) => (c.type || "credit") === "credit" && c.status === "created",
  ).length;

  const myMemberIds = useMemo(() => new Set(myMembers.map((m) => m.id)), [myMembers]);

  const upcomingPlaySessions = useMemo(() => {
    const base =
      user.role === "member" && s.upcomingPlaySessions && s.upcomingPlaySessions.length >= 0
        ? s.upcomingPlaySessions
        : s.schedules;

    return [...base]
      .filter(
        (x) =>
          x.status !== "open" &&
          x.status !== "closed" &&
          x.status !== "cancelled" &&
          isSessionInFuture(x.date, now) &&
          getPlaySessionPhase(x, now) !== "finished" &&
          (user.role === "admin" || user.role === "volunteer"
            ? true
            : (x.familyStatuses &&
                x.familyStatuses.some(
                  (fs) => fs.status === "accepted" || fs.status === "waiting",
                )) ||
              s.playInvites.some(
                (i) =>
                  i.scheduleId === x.id &&
                  myMemberIds.has(i.memberId) &&
                  (i.status === "accepted" || i.status === "waiting"),
              )),
      )
      .sort((a, b) => (parseDateTimeMs(a.date) || 0) - (parseDateTimeMs(b.date) || 0));
  }, [s.upcomingPlaySessions, s.schedules, s.playInvites, myMemberIds, user.role, now]);
  const myTrainingInviteIds = useMemo(
    () =>
      new Set(
        s.trainingInvites.filter((i) => myMemberIds.has(i.memberId)).map((i) => i.trainingId),
      ),
    [s.trainingInvites, myMemberIds],
  );

  const myAcceptedTrainingInviteIds = useMemo(
    () =>
      new Set(
        s.trainingInvites
          .filter((i) => myMemberIds.has(i.memberId) && i.status === "accepted")
          .map((i) => i.trainingId),
      ),
    [s.trainingInvites, myMemberIds],
  );

  const upcomingTrainings = useMemo(
    () =>
      groupUpcomingTrainings({
        trainings: s.trainings,
        role: user.role,
        acceptedTrainingIds: myAcceptedTrainingInviteIds,
        now,
      }),
    [s.trainings, user.role, myAcceptedTrainingInviteIds, now],
  );

  const myInvites = [
    ...s.playInvites.filter(
      (i) => myMembers.some((m) => m.id === i.memberId) && i.status === "open",
    ),
    ...s.trainingInvites.filter(
      (i) => myMembers.some((m) => m.id === i.memberId) && i.status === "open",
    ),
  ];

  const headerActions = (
    <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
      {user.role === "admin" && (
        <>
          <HeaderQuickAction to="/approvals" icon={ShieldCheck} label="Approvals" />
          <HeaderQuickAction to="/schedules" icon={CalendarDays} label="New schedule" />
          <HeaderQuickAction to="/trainings" icon={GraduationCap} label="New training" />
          <HeaderQuickAction to="/members" icon={Users} label="Members" />
        </>
      )}
      {user.role === "member" && (
        <>
          <HeaderQuickAction to="/members" icon={Users} label="Add family member" />
          <HeaderQuickAction to="/credits" icon={Wallet} label="Request credit" />
          <HeaderQuickAction to="/events" icon={CalendarDays} label="Play Schedules" />
          <HeaderQuickAction to="/transactions" icon={Wallet} label="Transactions" />
        </>
      )}
      {user.role === "volunteer" && (
        <HeaderQuickAction to="/trainings" icon={GraduationCap} label="Manage trainings" />
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.firstName}`}
        description="Here's what's happening at your club today."
        actions={headerActions}
      />

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8"
      >
        {user.role === "admin" && (
          <>
            <Stat label="Members" value={s.members.length} icon={Users} index={0} to="/members" />
            <Stat
              label="Member requests"
              value={pendingUsers}
              icon={ShieldCheck}
              hint="Awaiting approval"
              index={1}
              to="/approvals"
            />
            <Stat
              label="Pending credits"
              value={pendingCredits}
              icon={Wallet}
              hint="Top-up requests"
              index={2}
              to="/credits"
            />
            <Stat
              label="Active Play Schedules"
              value={upcomingPlaySessions.length}
              icon={CalendarDays}
              index={3}
              to="/schedules"
            />
            <Stat
              label="Active Training Sessions"
              value={s.uniqueTrainingsCount}
              icon={GraduationCap}
              index={4}
              to="/trainings"
            />
          </>
        )}
        {user.role === "member" && (
          <>
            <Stat
              label="Family members"
              value={myMembers.length}
              icon={Users}
              index={0}
              to="/members"
            />
            <Stat
              label="Total credit"
              value={fmtMoney(totalCredit)}
              icon={Wallet}
              index={1}
              isNumeric={false}
              to="/credits"
            />
            <Stat
              label="Total play schedules"
              value={myInvites.length}
              icon={CalendarDays}
              index={2}
              to="/events"
            />
            <Stat
              label="Trainings"
              value={s.uniqueTrainingsCount}
              icon={GraduationCap}
              index={3}
              to="/training"
            />
          </>
        )}
        {user.role === "volunteer" && (
          <>
            <Stat
              label="Trainings"
              value={s.uniqueTrainingsCount}
              icon={GraduationCap}
              index={0}
              to="/trainings"
            />
            <Stat
              label="Junior members"
              value={s.members.filter((m) => m.memberType === "junior").length}
              icon={Users}
              index={1}
              to="/members"
            />
            <Stat
              label="Sessions to mark"
              value={s.trainingDates.filter((d) => d.attended === null).length}
              icon={Inbox}
              index={2}
              to="/trainings"
            />
            <Stat
              label="Locations"
              value={s.locations.length}
              icon={CalendarDays}
              index={3}
              to="/schedules"
            />
          </>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <ScheduleListCard
          title="Upcoming Play Schedules"
          schedules={upcomingPlaySessions}
          holidays={s.holidays ?? []}
          emptyTitle="No play schedules scheduled"
          emptyDescription="Released and later schedules will appear here."
          emptyCtaLabel={user.role === "admin" ? "Create a schedule" : undefined}
          emptyCtaTo={user.role === "admin" ? "/schedules" : undefined}
          viewAllTo={user.role === "admin" ? "/schedules" : "/events"}
          viewAllLabel="View All"
          myMembers={myMembers}
          playInvites={s.playInvites}
          isMemberRole={user.role === "member"}
        />

        <TrainingListCard
          title={
            user.role === "member"
              ? "Upcoming Accepted Training Sessions"
              : "Upcoming Training Sessions"
          }
          trainings={upcomingTrainings}
          emptyTitle="No upcoming training sessions."
          viewAllTo={user.role === "member" ? "/training" : "/trainings"}
          viewAllLabel="View All"
        />
      </div>
    </div>
  );
}
