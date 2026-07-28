import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { CourtRotationView } from "@/components/CourtRotationView";
import { useSearchFilters } from "@/components/SearchFilterBar";
import { ScheduleFilters } from "@/components/ScheduleFilters";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { CalendarDays, GraduationCap, LayoutGrid, Plus, Wallet, AlertTriangle, Trophy, Users, User } from "lucide-react";
import type { Member, PlayInvitation, PlaySchedule, Rotation, Training, TrainingInvitation } from "@/lib/types";
import { applyMemberFee, discountsFromStore, playSessionBaseFee } from "@/lib/fees";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/events")({ component: Events });

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeek(d: Date) {
  const start = startOfWeek(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return endOfDay(end);
}

function matchesDateFilter(dateStr: string, filter: string) {
  if (filter === "all") return true;
  const date = new Date(dateStr);
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (filter === "upcoming") return date >= todayStart;
  if (filter === "past") return date < todayStart;
  if (filter === "today") return date >= todayStart && date <= todayEnd;
  if (filter === "this-week") {
    return date >= startOfWeek(now) && date <= endOfWeek(now);
  }
  if (filter === "this-month") {
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }
  return true;
}

function scheduleDateIso(dateStr: string): string | null {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function byFirstCome(a: PlayInvitation, b: PlayInvitation) {
  const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

function isEligibleForPlaySchedule(
  member: Member,
  sch: PlaySchedule,
  leagueGroups: { id: string; memberIds: string[] }[],
) {
  if (member.status !== "active") return false;

  if (member.memberType === "junior") {
    // Family head enrolls play-eligible juniors; league matches stay adult-only.
    if (!(member.playEligible ?? false)) return false;
    if (sch.isLeagueMatch) return false;
    return true;
  }

  if (member.memberType !== "adult" || !member.membership) {
    return false;
  }
  if (sch.isLeagueMatch && sch.leagueGroupIds && sch.leagueGroupIds.length > 0) {
    const allowed = new Set(
      leagueGroups
        .filter((g) => sch.leagueGroupIds!.includes(g.id))
        .flatMap((g) => g.memberIds || []),
    );
    return allowed.has(member.id);
  }
  return true;
}

function Events() {
  const user = useCurrentUser()!;
  const s = useStore();
  const enrollTraining = useStore((st) => st.enrollTraining);
  const enrollPlay = useStore((st) => st.enrollPlay);
  const syncData = useStore((st) => st.syncData);
  const myMembers = s.members.filter((m) => m.userId === user.id);
  const myIds = myMembers.map((m) => m.id);
  const juniorChildren = myMembers.filter(
    (m) => m.memberType === "junior" && m.status === "active",
  );
  const playEligibleJuniors = juniorChildren.filter((m) => m.playEligible ?? false);
  const adultPlayers = myMembers.filter(
    (m) => m.memberType === "adult" && m.status === "active",
  );
  const playInvs = s.playInvites.filter((i) => myIds.includes(i.memberId));
  const trainInvs = s.trainingInvites.filter((i) => myIds.includes(i.memberId));
  const invitedTrainingIds = new Set(trainInvs.map((i) => i.trainingId));
  const releasedSchedules = s.schedules.filter((sch) => sch.status === "released");
  const [courtsPopup, setCourtsPopup] = useState<{
    schedule: PlaySchedule;
    rotation: Rotation;
  } | null>(null);
  const [playersPopup, setPlayersPopup] = useState<PlaySchedule | null>(null);

  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [bulkAcceptPopup, setBulkAcceptPopup] = useState<{
    member: Member;
    training: Training;
    // Sessions belonging to this specific monthly invitation only
    monthSessions: Training[];
    invitedMonthSessions: Training[];
    invites: TrainingInvitation[];
  } | null>(null);
  const [autoInviting, setAutoInviting] = useState(false);
  const autoInviteAttempted = useRef<Set<string>>(new Set());
  const navigate = useNavigate();
  const [creditGap, setCreditGap] = useState<{
    memberId: string;
    balance: number;
    required: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      await syncData();
      if (cancelled) return;

      const state = useStore.getState();
      const familyAdults = state.members.filter(
        (m) => m.userId === user.id && m.memberType === "adult" && m.status === "active",
      );
      const released = state.schedules.filter((sch) => sch.status === "released");
      const pending: { scheduleId: string; memberIds: string[] }[] = [];

      for (const sch of released) {
        const already = new Set(
          state.playInvites.filter((i) => i.scheduleId === sch.id).map((i) => i.memberId),
        );
        const missing = familyAdults
          .filter(
            (m) =>
              isEligibleForPlaySchedule(m, sch, state.leagueGroups) && !already.has(m.id),
          )
          .map((m) => m.id);

        if (missing.length === 0) continue;

        const key = `${sch.id}:${[...missing].sort().join(",")}`;
        if (autoInviteAttempted.current.has(key)) continue;
        autoInviteAttempted.current.add(key);
        pending.push({ scheduleId: sch.id, memberIds: missing });
      }

      if (pending.length === 0) return;

      setAutoInviting(true);
      try {
        for (const item of pending) {
          if (cancelled) return;
          await enrollPlay(item.scheduleId, item.memberIds);
        }
      } catch {
        // Leave invites as-is; user can refresh. Clear keys so a retry can happen.
        for (const item of pending) {
          autoInviteAttempted.current.delete(
            `${item.scheduleId}:${[...item.memberIds].sort().join(",")}`,
          );
        }
      } finally {
        if (!cancelled) setAutoInviting(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [user.id, syncData, enrollPlay]);

  const name = (mid: string) => {
    if (typeof mid === "string" && mid.startsWith("guest_")) {
      return `Guest Player ${mid.split("_")[1]}`;
    }
    const m = s.members.find((x) => x.id === mid);
    return m ? `${m.firstName} ${m.lastName}` : "?";
  };

  const gradeOf = (mid: string) => {
    if (typeof mid === "string" && mid.startsWith("guest_")) return undefined;
    return s.members.find((x) => x.id === mid)?.grade || undefined;
  };

  const getHolidayName = (dateStr: string) => {
    const iso = scheduleDateIso(dateStr);
    if (!iso) return null;
    const match = (s.holidayItems ?? []).find((h) => h.date === iso);
    if (match) return match.name;
    if ((s.holidays ?? []).includes(iso)) return "Holiday";
    return null;
  };

  const openCourtsPopup = (sch: PlaySchedule) => {
    const rotation = s.rotations.find((r) => r.scheduleId === sch.id);
    if (!rotation) {
      toast.error("Court rotation is not available yet.");
      return;
    }
    setCourtsPopup({ schedule: sch, rotation });
  };

  const openPlayersPopup = (sch: PlaySchedule) => {
    setPlayersPopup(sch);
  };

  const schedulePlayerLists = (scheduleId: string) => {
    const invs = s.playInvites.filter((i) => i.scheduleId === scheduleId);
    return {
      accepted: invs.filter((i) => i.status === "accepted").sort(byFirstCome),
      waiting: invs.filter((i) => i.status === "waiting").sort(byFirstCome),
    };
  };



  const availablePlayMembers = (sch: PlaySchedule) => {
    const invited = new Set(
      s.playInvites.filter((i) => i.scheduleId === sch.id).map((i) => i.memberId),
    );
    return adultPlayers.filter(
      (m) => isEligibleForPlaySchedule(m, sch, s.leagueGroups) && !invited.has(m.id),
    );
  };

  const availablePlayJuniors = (sch: PlaySchedule) => {
    const invited = new Set(
      s.playInvites.filter((i) => i.scheduleId === sch.id).map((i) => i.memberId),
    );
    return playEligibleJuniors.filter(
      (m) => isEligibleForPlaySchedule(m, sch, s.leagueGroups) && !invited.has(m.id),
    );
  };

  const trainingPrograms = s.trainings.filter((t) => invitedTrainingIds.has(t.id));

  // Build monthly cards: one entry per (parentId, monthIndex) group
  // This ensures each monthly invitation is shown independently
  interface MonthlyTrainingCard {
    key: string;
    parentId: string;
    monthIndex: number;
    primarySession: Training; // First session in this month group
    monthSessions: Training[]; // All sessions in this month group
    repeatWeeks: number;
  }

  const monthlyTrainingCards = useMemo((): MonthlyTrainingCard[] => {
    // Group all relevant trainings by parentId
    const seriesMap = new Map<string, Training[]>();
    for (const t of trainingPrograms) {
      const pid = t.parentId || t.id;
      if (!seriesMap.has(pid)) seriesMap.set(pid, []);
      seriesMap.get(pid)!.push(t);
    }

    const cards: MonthlyTrainingCard[] = [];
    for (const [pid, sessions] of seriesMap.entries()) {
      const sorted = [...sessions].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      );
      if (sorted.length === 0) continue;

      const first = sorted[0];
      // Use repeat_weeks stored on the session to chunk into monthly groups
      const rw = Math.max(1, first.repeatWeeks || 3);

      const allSeriesSessions = s.trainings
        .filter(x => (x.parentId || x.id) === pid)
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

      // Group allSeriesSessions by Calendar Month (YYYY-MM)
      const monthGroups: Record<string, Training[]> = {};
      for (const session of allSeriesSessions) {
        const d = new Date(session.startDate);
        if (Number.isNaN(d.getTime())) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!monthGroups[key]) monthGroups[key] = [];
        monthGroups[key].push(session);
      }

      const monthKeys = Object.keys(monthGroups).sort();
      const relevantIds = new Set(sorted.map(sess => sess.id));

      monthKeys.forEach((key, m) => {
        const fullMonthSessions = monthGroups[key];
        if (fullMonthSessions.length === 0) return;

        const primary = fullMonthSessions[0];
        const hasRelevantSession = fullMonthSessions.some(sess => relevantIds.has(sess.id));
        if (!hasRelevantSession) return;

        cards.push({
          key: `${pid}_m${m}`,
          parentId: pid,
          monthIndex: m,
          primarySession: primary,
          monthSessions: fullMonthSessions,
          repeatWeeks: rw,
        });
      });
    }

    // Sort by primary session start date
    return cards.sort(
      (a, b) => new Date(a.primarySession.startDate).getTime() - new Date(b.primarySession.startDate).getTime()
    );
  }, [trainingPrograms, s.trainings]);

  const playSessions: PlaySchedule[] = [
    ...releasedSchedules,
    ...playInvs
      .map((i) => s.schedules.find((sch) => sch.id === i.scheduleId))
      .filter((sch): sch is PlaySchedule => !!sch && !releasedSchedules.some((r) => r.id === sch.id)),
  ];

  const uniquePlaySessions = playSessions.filter(
    (sch, idx, arr) => arr.findIndex((x) => x.id === sch.id) === idx,
  );

  const {
    search,
    filters,
    sortBy,
    setSearch,
    setFilter,
    clearFilters,
    setSortBy,
  } = useSearchFilters(
    {
      status: "all",
      location: "all",
      date: "all",
      courts: "all",
      capacity: "all",
    },
    "date-asc",
  );

  const locationList = useMemo(() => {
    const fromSessions = uniquePlaySessions.map((sch) => sch.location).filter(Boolean);
    return [...new Set([...(s.locations ?? []), ...fromSessions])].sort();
  }, [s.locations, uniquePlaySessions]);

  const inviteStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const sch of uniquePlaySessions) {
      const accepted = s.playInvites.filter(
        (i) => i.scheduleId === sch.id && i.status === "accepted",
      ).length;
      map.set(sch.id, accepted);
    }
    return map;
  }, [uniquePlaySessions, s.playInvites]);

  const sortOptions = [
    { value: "date-asc", label: "Next scheduled" },
    { value: "date-desc", label: "Latest first" },
    { value: "name-asc", label: "Name A–Z" },
    { value: "name-desc", label: "Name Z–A" },
  ];

  const filteredPlaySessions = useMemo(() => {
    let list = uniquePlaySessions.filter((sch) => {
      const q = search.toLowerCase().trim();
      if (q) {
        const haystack = `${sch.name} ${sch.location}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      if (filters.status !== "all" && sch.status !== filters.status) return false;
      if (filters.location !== "all" && sch.location !== filters.location) return false;
      if (!matchesDateFilter(sch.date, filters.date)) return false;

      if (filters.courts !== "all") {
        if (filters.courts === "4+") {
          if (sch.courts < 4) return false;
        } else if (sch.courts !== Number(filters.courts)) {
          return false;
        }
      }

      const accepted = inviteStats.get(sch.id) ?? 0;
      const max = sch.players || 12;
      const fill = max > 0 ? (accepted / max) * 100 : 0;
      if (filters.capacity === "full" && fill < 100) return false;
      if (filters.capacity === "has-space" && fill >= 100) return false;
      if (filters.capacity === "low" && fill >= 50) return false;
      if (filters.capacity === "empty" && accepted > 0) return false;

      return true;
    });

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "date-asc":
        default:
          return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
    });

    return list;
  }, [uniquePlaySessions, search, filters, sortBy, inviteStats]);

  const invitesForTraining = (trainingId: string) => {
    const tr = s.trainings.find((t) => t.id === trainingId);
    const targetType = tr?.targetType || "junior";
    return trainInvs.filter((i) => {
      if (i.trainingId !== trainingId) return false;
      const mem = s.members.find((m) => m.id === i.memberId);
      return mem ? mem.memberType === targetType : true;
    });
  };

  const invitesForSchedule = (scheduleId: string) =>
    playInvs.filter((i) => i.scheduleId === scheduleId);

  const renderPlayInviteActions = (
    i: (typeof playInvs)[number],
    sch: PlaySchedule,
  ) => {
    const member = s.members.find((x) => x.id === i.memberId);
    const holidayName = getHolidayName(sch.date);
    const isHoliday = !!holidayName;
    const skipsLeagueFee = (() => {
      if (!sch.isLeagueMatch || !sch.leagueGroupIds?.length) return false;
      const skipNames = new Set(
        (s.playerPositionItems ?? [])
          .filter((p) => p.skipLeagueFee)
          .map((p) => p.name),
      );
      if (skipNames.size === 0) return false;
      for (const gid of sch.leagueGroupIds) {
        const group = s.leagueGroups.find((g) => g.id === gid);
        const pos = group?.memberPositions?.[i.memberId];
        if (pos && skipNames.has(pos)) return true;
      }
      return false;
    })();
    const isCancelled = sch.status === "cancelled";
    const estimatedFee = isCancelled || isHoliday
      ? 0
      : skipsLeagueFee
      ? 0
      : applyMemberFee(
          playSessionBaseFee(sch.sessionRate),
          member,
          discountsFromStore(s),
        );
    const hasInsufficientCredits =
      !!member &&
      !member.skipCreditConsumption &&
      !skipsLeagueFee &&
      !sch.isLeagueMatch &&
      member.credit < estimatedFee;

    const responsesLocked =
      (sch.status === "rotated" || sch.status === "published" || sch.status === "closed") && !isCancelled;
    const lockHours = Math.max(0, s.cancellationLockHours ?? 24);
    const matchStartMs = Date.parse(sch.date);
    const withinCancelWindow =
      Number.isFinite(matchStartMs) &&
      Date.now() < matchStartMs - lockHours * 60 * 60 * 1000;
    const hoursLabel = lockHours === 1 ? "1 hour" : `${lockHours} hours`;

    const canAccept =
      !isCancelled && !isHoliday && !responsesLocked && (i.status === "open" || i.status === "declined");
    const canDeclineWaiting = !isCancelled && !isHoliday && !responsesLocked && i.status === "waiting";
    const canDeclineAccepted =
      !isCancelled && !isHoliday && !responsesLocked && i.status === "accepted" && withinCancelWindow;
    const canDecline = canDeclineWaiting || canDeclineAccepted;
    const declineLockedByTime =
      !isCancelled && !isHoliday && !responsesLocked && i.status === "accepted" && !withinCancelWindow;

    const memberTypeLabel = member?.memberType === "junior" ? "Child" : "Player";

    // For holiday sessions: hide all member-specific actions and details.
    // Only show the holiday notice once (rendered at the card level).
    if (isHoliday) {
      return null;
    }

    return (
      <div key={i.id} className="pt-2.5 border-t border-white/[0.04] space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-[#F1F0EE] truncate">
              <span className="text-[11px] text-[#8A8A98] font-normal mr-1.5">{memberTypeLabel}:</span>
              {name(i.memberId)}
            </div>
            <div className="text-[11px] text-[#8A8A98] mt-0.5">
              Session Fee:{" "}
              <span className="font-semibold font-mono text-[#3B82F6]">
                {fmtMoney(estimatedFee)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
            <StatusBadge kind="invitation" status={i.status === "declined" ? "open" : i.status} />
            {canAccept && (
              <Button
                size="sm"
                className="btn-premium-solid h-7.5 px-3 text-[11px] font-semibold cursor-pointer"
                onClick={async () => {
                  if (hasInsufficientCredits && member) {
                    setCreditGap({
                      memberId: member.id,
                      balance: member.credit,
                      required: estimatedFee,
                    });
                    return;
                  }
                  try {
                    const res = await s.respondPlay(i.id, "accepted");
                    if (res.status === "waiting") {
                      toast.success("Session is full — you're on the waiting list");
                    } else {
                      toast.success("Accepted — session fee deducted from credits");
                    }
                  } catch (error: any) {
                    const msg = error.message || "Failed to respond to invitation.";
                    if (member && /insufficient credits/i.test(msg)) {
                      setCreditGap({
                        memberId: member.id,
                        balance: member.credit,
                        required: estimatedFee,
                      });
                      return;
                    }
                    toast.error(msg);
                  }
                }}
              >
                Accept
              </Button>
            )}
            {canDecline && (
              <Button
                size="sm"
                variant="outline"
                className="btn-premium-danger h-7.5 px-3 text-[11px] font-semibold cursor-pointer"
                onClick={async () => {
                  try {
                    await s.respondPlay(i.id, "declined");
                    toast.success(
                      i.status === "waiting"
                        ? "Left the waiting list"
                        : "Cancelled — session fee refunded to credits",
                    );
                  } catch (error: any) {
                    toast.error(error.message || "Failed to cancel invitation.");
                  }
                }}
              >
                Decline
              </Button>
            )}
          </div>
        </div>
        {canAccept && hasInsufficientCredits && (
          <div className="text-[11px] text-[#FBBF24] bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5 font-light">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">Alert:</span> Insufficient credits (
              {fmtMoney(member!.credit)} / {fmtMoney(estimatedFee)})
            </span>
          </div>
        )}
        {isCancelled && (
          <div className="text-[11px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5 font-light">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[#EF4444]" />
            <div className="space-y-0.5">
              <div className="font-semibold text-[#EF4444]">Cancelled Reason:</div>
              <div className="text-[#EF4444]/90 font-light">{sch.cancelReason || "No reason specified."}</div>
            </div>
          </div>
        )}
        {responsesLocked && (
          <div className="text-[11px] text-[#8A8A98] bg-white/[0.03] border border-white/[0.06] rounded-md px-2.5 py-1.5 flex items-start gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[#8A8A98]" />
            <span>Court rotation is locked — accept and decline are closed for all members.</span>
          </div>
        )}
        {declineLockedByTime && (
          <div className="text-[11px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">Cancellation closed:</span> You cannot cancel within{" "}
              {hoursLabel} of the match start. This rule applies to all members.
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Dialog open={!!courtsPopup} onOpenChange={(open) => !open && setCourtsPopup(null)}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">
              {courtsPopup?.schedule.name ?? "Court details"}
            </DialogTitle>
            <DialogDescription className="text-[#8A8A98]">
              {courtsPopup
                ? `${fmtDateTime(courtsPopup.schedule.date)} · ${courtsPopup.schedule.location}`
                : "Published court assignments"}
            </DialogDescription>
          </DialogHeader>
          {courtsPopup && (
            <CourtRotationView
              schedule={courtsPopup.schedule}
              rotation={courtsPopup.rotation}
              memberName={name}
              memberGrade={gradeOf}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!playersPopup} onOpenChange={(open) => !open && setPlayersPopup(null)}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">
              {playersPopup?.name ?? "Session players"}
            </DialogTitle>
            <DialogDescription className="text-[#8A8A98]">
              {playersPopup
                ? `${fmtDateTime(playersPopup.date)} · ${playersPopup.location}`
                : "Accepted and waiting members"}
            </DialogDescription>
          </DialogHeader>
          {playersPopup && (() => {
            const lists = schedulePlayerLists(playersPopup.id);
            const maxPlayers = Math.max(playersPopup.players || 0, 1);
            const columns = [
              {
                key: "accepted" as const,
                label: "Accepted",
                color: "text-[#3B82F6]",
                countLabel: `(${lists.accepted.length} / ${maxPlayers})`,
                items: lists.accepted,
              },
              {
                key: "waiting" as const,
                label: "Waiting",
                color: "text-[#F59E0B]",
                countLabel: `(${lists.waiting.length})`,
                items: lists.waiting,
              },
            ];
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {columns.map((col) => (
                  <div
                    key={col.key}
                    className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 overflow-hidden"
                  >
                    <div className="px-3 py-2.5 border-b border-white/[0.04] flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase">
                        {col.label}
                      </span>
                      <span className={cn("font-mono text-xs", col.color)}>{col.countLabel}</span>
                    </div>
                    <div className="px-3 py-2 max-h-[320px] overflow-y-auto space-y-0.5">
                      {col.items.length === 0 ? (
                        <p className="text-[13px] font-light text-[#8A8A98] py-3 text-center">
                          No members listed.
                        </p>
                      ) : (
                        col.items.map((inv, idx) => {
                          const isGuest =
                            typeof inv.memberId === "string" && inv.memberId.startsWith("guest_");
                          return (
                            <div
                              key={inv.id}
                              className="text-[13px] text-[#F1F0EE] py-2 border-b border-white/[0.03] last:border-0 font-medium flex items-center gap-2"
                            >
                              <span className="font-mono text-[10px] text-[#8A8A98] shrink-0">
                                {idx + 1}.
                              </span>
                              <span className={cn("truncate", isGuest && "text-[#D97706]")}>
                                {name(inv.memberId)}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!creditGap} onOpenChange={(open) => !open && setCreditGap(null)}>
        <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-[#F1F0EE]">
              <Wallet className="size-5 text-[#F59E0B]" />
              Insufficient credits
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#8A8A98] text-left space-y-2">
              <span className="block">
                You need more credits before you can accept this play session.
              </span>
              {creditGap && (
                <span className="block font-mono text-[13px] text-[#F1F0EE]">
                  Balance {fmtMoney(creditGap.balance)} · Required {fmtMoney(creditGap.required)}
                </span>
              )}
              <span className="block">
                Go to the Credits page to request a top-up, then come back to accept.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="btn-premium-outline cursor-pointer mt-0">
              Not now
            </AlertDialogCancel>
            <AlertDialogAction
              className="btn-premium-solid cursor-pointer"
              onClick={() => {
                const memberId = creditGap?.memberId;
                setCreditGap(null);
                void navigate({
                  to: "/credits",
                  search: memberId ? { memberId } : {},
                });
              }}
            >
              Go to Credits
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {bulkAcceptPopup && (() => {
        const { member, training, monthSessions, invitedMonthSessions, invites } = bulkAcceptPopup;
        const isAdult = training.targetType === "adult";
        
        const repeatWeeks = Math.max(1, training.repeatWeeks || 3);
        const basePerWeekFee = (training.fees || 0) / repeatWeeks;
        
        const feePerWeek = applyMemberFee(basePerWeekFee, member, discountsFromStore(s));
        // Only charge for weeks the member was actually invited to
        const invitedWeeksCount = invitedMonthSessions.length;
        const totalFee = feePerWeek * invitedWeeksCount;
        const balanceAfter = member.credit - totalFee;

        return (
          <AlertDialog open={!!bulkAcceptPopup} onOpenChange={(open) => !open && setBulkAcceptPopup(null)}>
            <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] max-w-md">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-[#F1F0EE]">
                  Accept Training Program
                </AlertDialogTitle>
                <AlertDialogDescription className="text-[#8A8A98] text-left space-y-4 pt-2">
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-[#F1F0EE]">{training.name}</div>
                    <div className="text-xs">Coach {training.coach} · {training.location}</div>
                    <div className="text-xs">{isAdult ? "Adult" : "Junior"} Training</div>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[#F1F0EE]">Invited Dates (This Month):</div>
                    <ul className="list-disc pl-4 text-xs space-y-0.5 text-[#8A8A98]">
                      {invitedMonthSessions.map(ct => (
                        <li key={ct.id}>{fmtDate(ct.startDate)}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2 border-t border-[rgba(255,255,255,0.1)] pt-3">
                    <div className="flex justify-between text-xs text-[#8A8A98]">
                      <span>Monthly fee ({repeatWeeks} week{repeatWeeks !== 1 ? "s" : ""})</span>
                      <span className="font-mono">{fmtMoney(training.fees)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span>Fee per week</span>
                      <span className="font-mono text-[#3B82F6]">{fmtMoney(feePerWeek)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold text-[#F1F0EE]">
                      <span>Total deduction ({invitedWeeksCount} invited week{invitedWeeksCount !== 1 ? "s" : ""})</span>
                      <span className="font-mono">{fmtMoney(totalFee)}</span>
                    </div>
                    <div className="flex justify-between text-xs text-[#8A8A98]">
                      <span>Current Wallet Balance</span>
                      <span className="font-mono">{fmtMoney(member.credit)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-semibold">
                      <span>Balance After Deduction</span>
                      <span className={cn("font-mono", balanceAfter < 0 ? "text-red-400" : "text-green-400")}>
                        {fmtMoney(balanceAfter)}
                      </span>
                    </div>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="btn-premium-outline cursor-pointer mt-0">
                  Cancel
                </AlertDialogCancel>
                <Button
                  className="btn-premium-solid cursor-pointer"
                  onClick={async () => {
                    if (balanceAfter < 0 && !member.skipCreditConsumption) {
                      setBulkAcceptPopup(null);
                      setCreditGap({
                        memberId: member.id,
                        balance: member.credit,
                        required: totalFee,
                      });
                      return;
                    }
                    
                    try {
                      await s.respondTrainingBulk(invites.map(i => i.id), "accepted");
                      toast.success("Training program accepted successfully!");
                      setBulkAcceptPopup(null);
                    } catch (error: any) {
                      toast.error(error.message || "Failed to accept training program.");
                    }
                  }}
                >
                  Confirm Accept
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}

      <PageHeader
        title="Events"
        description={`Enroll in released play sessions and training programs. Play cancellations close ${s.cancellationLockHours === 1 ? "1 hour" : `${s.cancellationLockHours ?? 24} hours`} before the match starts.`}
      />

      {uniquePlaySessions.length > 0 && (
        <ScheduleFilters
          search={search}
          onSearchChange={setSearch}
          filters={filters}
          onFilterChange={setFilter}
          onClearAll={clearFilters}
          sortBy={sortBy}
          onSortChange={setSortBy}
          sortOptions={sortOptions}
          locations={locationList}
          totalCount={uniquePlaySessions.length}
          filteredCount={filteredPlaySessions.length}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase flex items-center gap-2">
              <CalendarDays className="size-4 text-[#3B82F6]" /> Play Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/10 px-3 py-2.5 text-[12px] text-[#FBBF24]"
            >
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[#FBBF24]">Cancellation policy (all members)</p>
                <p className="mt-0.5 text-[#F59E0B]/90 font-light leading-relaxed">
                  You can cancel an accepted play session until{" "}
                  <span className="font-semibold text-[#FBBF24]">
                    {s.cancellationLockHours === 1
                      ? "1 hour"
                      : `${s.cancellationLockHours ?? 24} hours`}
                  </span>{" "}
                  before the match starts. After that, cancellation is not allowed.
                </p>
              </div>
            </div>
            {filteredPlaySessions.length === 0 && (
              <div className="py-4 space-y-3">
                <p className="text-[13px] font-light text-[#8A8A98] text-center">
                  {uniquePlaySessions.length === 0
                    ? "No play sessions are open yet."
                    : "No play sessions match your filters."}
                </p>
                {uniquePlaySessions.length === 0 && adultPlayers.length === 0 && (
                  <div className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 rounded-lg p-4 flex flex-col items-center gap-3">
                    <p className="text-[13px] text-muted-foreground text-center">
                      Add an adult family member with club membership to join when a session is released.
                    </p>
                    <Button asChild size="sm" className="btn-premium-solid h-8 text-[11px]">
                      <Link to="/members/add">
                        <Plus className="size-3.5 mr-1" /> Add family member
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {filteredPlaySessions.map((sch) => {
              const available = availablePlayMembers(sch);
              const availableJuniors = availablePlayJuniors(sch);
              const scheduleInvites = invitesForSchedule(sch.id);
              const canEnroll = sch.status === "released";
              const waitingForInvite = canEnroll && available.length > 0 && (autoInviting || scheduleInvites.length === 0);
              const holidayName = getHolidayName(sch.date);
              const isHoliday = !!holidayName;
              const isCancelled = sch.status === "cancelled";

              return (
                <div
                  key={sch.id}
                  className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-[#F1F0EE] text-[14px]">{sch.name}</div>
                        {sch.isLeagueMatch && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-[#818CF8]/30 bg-[#818CF8]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#A5B4FC] uppercase">
                            <Trophy className="size-3" />
                            League
                          </span>
                        )}
                        {sch.status === "cancelled" ? (
                          <span className="inline-flex items-center rounded-md border border-[#EF4444]/35 bg-[#EF4444]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#EF4444] uppercase">
                            Cancelled
                          </span>
                        ) : holidayName ? (
                          <span className="inline-flex items-center rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#FBBF24] uppercase">
                            Holiday
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-[#8A8A98] font-mono font-light">
                        {fmtDateTime(sch.date)} · {sch.location}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <StatusBadge status={sch.status} />
                      {!isHoliday &&
                        (sch.status === "released" ||
                          sch.status === "rotated" ||
                          sch.status === "published" ||
                          sch.status === "closed" ||
                          sch.status === "cancelled") && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="btn-premium-outline h-7 text-[11px] px-2.5 cursor-pointer"
                            onClick={() => openPlayersPopup(sch)}
                          >
                            <Users className="size-3.5 mr-1" />
                            View players
                          </Button>
                        )}
                      {!isHoliday &&
                        (sch.status === "published" || sch.status === "closed") &&
                        s.rotations.some((r) => r.scheduleId === sch.id) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="btn-premium-outline h-7 text-[11px] px-2.5 cursor-pointer"
                            onClick={() => openCourtsPopup(sch)}
                          >
                            <LayoutGrid className="size-3.5 mr-1" />
                            Court details
                          </Button>
                        )}
                    </div>
                  </div>

                  {sch.status === "cancelled" && scheduleInvites.length === 0 && (
                    <div className="text-[11px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5 font-light">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[#EF4444]" />
                      <div className="space-y-0.5">
                        <div className="font-semibold text-[#EF4444]">Cancelled Reason:</div>
                        <div className="text-[#EF4444]/90 font-light">{sch.cancelReason || "No reason specified."}</div>
                      </div>
                    </div>
                  )}

                  {canEnroll && adultPlayers.length === 0 && playEligibleJuniors.length === 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
                      <p className="text-[12px] text-muted-foreground">
                        Add an eligible family member to join this session.
                      </p>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="btn-premium-outline h-7 text-[11px] shrink-0"
                      >
                        <Link to="/members/add">
                          <Plus className="size-3.5 mr-1" /> Add family member
                        </Link>
                      </Button>
                    </div>
                  )}

                  {canEnroll &&
                    adultPlayers.length > 0 &&
                    available.length === 0 &&
                    availableJuniors.length === 0 &&
                    scheduleInvites.length === 0 && (
                      <p className="text-[12px] text-muted-foreground pt-2 border-t border-white/[0.04]">
                        No eligible members for this session.
                      </p>
                    )}

                  {waitingForInvite && scheduleInvites.length === 0 && (
                    <p className="text-[12px] text-muted-foreground pt-2 border-t border-white/[0.04]">
                      Preparing invitation…
                    </p>
                  )}

                  {canEnroll && !sch.isLeagueMatch && availableJuniors.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/[0.04]">
                      {isCancelled ? (
                        <div className="text-[11px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5 font-light">
                          <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[#EF4444]" />
                          <div className="space-y-0.5">
                            <div className="font-semibold text-[#EF4444]">Cancelled Reason:</div>
                            <div className="text-[#EF4444]/90 font-light">{sch.cancelReason || "No reason specified."}</div>
                          </div>
                        </div>
                      ) : isHoliday ? (
                        <div className="text-[11px] text-[#FBBF24] bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5">
                          <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[#FBBF24]" />
                          <div className="space-y-0.5">
                            <div className="font-semibold text-[#FBBF24]">Holiday: {holidayName}</div>
                            <div className="text-[#FBBF24]/90 font-light">
                              Accept and decline are closed for this session.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid gap-2">
                          {availableJuniors.map((child) => {
                            const estimatedFee = isHoliday
                              ? 0
                              : applyMemberFee(
                                  playSessionBaseFee(sch.sessionRate),
                                  child,
                                  discountsFromStore(s),
                                );
                            const hasInsufficientCredits =
                              !child.skipCreditConsumption && child.credit < estimatedFee;
                            const acceptingKey = `${sch.id}:${child.id}`;
                            return (
                              <div
                                key={child.id}
                                className="flex items-center justify-between gap-3 px-4 py-3 bg-[#F0F5FF] border border-[#D6E4FF] rounded-lg shadow-sm"
                              >
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-[13.5px] truncate">
                                    <User className="size-3.5 text-[#2563EB] shrink-0" />
                                    <span className="truncate">{child.firstName} {child.lastName}</span>
                                  </div>
                                  <div className="text-[11.5px] text-slate-700 font-medium">
                                    Grade {child.grade} · Session Fee:{" "}
                                    <span className="font-mono font-bold text-[#2563EB]">
                                      {fmtMoney(estimatedFee)}
                                    </span>
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  disabled={enrollingId === acceptingKey}
                                  className="btn-premium-solid h-7.5 px-3.5 text-[11px] font-semibold cursor-pointer shrink-0"
                                  onClick={async () => {
                                    if (hasInsufficientCredits) {
                                      setCreditGap({
                                        memberId: child.id,
                                        balance: child.credit,
                                        required: estimatedFee,
                                      });
                                      return;
                                    }
                                    setEnrollingId(acceptingKey);
                                    try {
                                      await enrollPlay(sch.id, [child.id], true);
                                      toast.success(
                                        `Accepted ${child.firstName} — session fee deducted from credits`,
                                      );
                                    } catch (error: any) {
                                      const msg = error.message || "Failed to accept child.";
                                      if (/insufficient credits/i.test(msg)) {
                                        setCreditGap({
                                          memberId: child.id,
                                          balance: child.credit,
                                          required: estimatedFee,
                                        });
                                      } else {
                                        toast.error(msg);
                                      }
                                    } finally {
                                      setEnrollingId(null);
                                    }
                                  }}
                                >
                                  Accept
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {isHoliday && (
                    <div className="pt-2.5 border-t border-white/[0.04]">
                      <div className="text-[11px] text-[#FBBF24] bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5">
                        <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[#FBBF24]" />
                        <div className="space-y-0.5">
                          <div className="font-semibold text-[#FBBF24]">Holiday: {holidayName}</div>
                          <div className="text-[#FBBF24]/90 font-light">
                            This session is closed for this public holiday. No actions are available.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {!isHoliday && scheduleInvites.length > 0 && (
                    <div className="space-y-1">
                      {scheduleInvites.map((i) =>
                        renderPlayInviteActions(i, sch),
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase flex items-center gap-2">
              <GraduationCap className="size-4 text-[#3B82F6]" /> Training Programs
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {monthlyTrainingCards.length === 0 && (
              <div className="py-4 space-y-3">
                <p className="text-[13px] font-light text-[#8A8A98] text-center">
                  No training programs are open yet.
                </p>
                {juniorChildren.length === 0 && (
                  <div className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 rounded-lg p-4 flex flex-col items-center gap-3">
                    <p className="text-[13px] text-muted-foreground text-center">
                      Add a junior family member to enroll when a program opens.
                    </p>
                    <Button asChild size="sm" className="btn-premium-solid h-8 text-[11px]">
                      <Link to="/members/add">
                        <Plus className="size-3.5 mr-1" /> Add family member
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {monthlyTrainingCards.map((card) => {
              const t = card.primarySession;
              const targetType = t.targetType || "junior";
              const parentId = card.parentId;
              // monthSessions = only the sessions belonging to THIS monthly invitation
              const monthSessions = card.monthSessions;
              const monthSessionIds = new Set(monthSessions.map(ms => ms.id));

              const isCancelled = t.status === "cancelled" || monthSessions.some(ms => ms.status === "cancelled");
              const cancelReason = t.cancelReason || monthSessions.find(ms => ms.cancelReason)?.cancelReason || "No reason specified.";

              // Only invites that belong to this month's sessions
              const familyMonthInvites = trainInvs.filter(i => monthSessionIds.has(i.trainingId));



              // Group this month's invites by member
              const memberInvitesMap = new Map<string, typeof familyMonthInvites>();
              for (const inv of familyMonthInvites) {
                if (!memberInvitesMap.has(inv.memberId)) memberInvitesMap.set(inv.memberId, []);
                memberInvitesMap.get(inv.memberId)!.push(inv);
              }

              const canEnroll = !isCancelled && (t.status === "open" || t.status === "released");
              const holidayName = getHolidayName(t.startDate);
              const familyMatchingMembers = targetType === "adult" ? adultPlayers : juniorChildren;

              // Month label for display
              const monthDate = new Date(t.startDate);
              const monthLabel = Number.isNaN(monthDate.getTime())
                ? ""
                : monthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

              return (
                <div
                  key={card.key}
                  className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-[#F1F0EE] text-[14px]">{t.name}</div>
                        {monthLabel && (
                          <span className="inline-flex items-center rounded-md border border-[#34D399]/30 bg-[#34D399]/10 px-2 py-0.5 text-[11px] font-semibold text-[#34D399]">
                            {monthLabel}
                          </span>
                        )}
                        {isCancelled ? (
                          <span className="inline-flex items-center rounded-md border border-[#EF4444]/35 bg-[#EF4444]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#EF4444] uppercase">
                            Cancelled
                          </span>
                        ) : holidayName ? (
                          <span className="inline-flex items-center rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#FBBF24] uppercase">
                            Holiday
                          </span>
                        ) : null}
                        <span className="inline-flex items-center rounded-md border border-[#10B981]/30 bg-[#10B981]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#10B981] uppercase">
                          {targetType === "adult" ? "Adult" : "Junior"}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#8A8A98] font-mono font-light">
                        Coach {t.coach} · {t.location}
                        {monthSessions.length > 0 && (
                          <span className="ml-1">
                            · {monthSessions.map(ms => new Date(ms.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })).join(", ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <StatusBadge status={isCancelled ? "cancelled" : t.status} />
                  </div>

                  {isCancelled && familyMonthInvites.length === 0 && (
                    <div className="text-[11px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5 font-light">
                      <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[#EF4444]" />
                      <div className="space-y-0.5">
                        <div className="font-semibold text-[#EF4444]">Cancelled Reason:</div>
                        <div className="text-[#EF4444]/90 font-light">{cancelReason}</div>
                      </div>
                    </div>
                  )}

                  {canEnroll && familyMatchingMembers.length === 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
                      <p className="text-[12px] text-muted-foreground">
                        {targetType === "adult"
                          ? "Add an adult family member to enroll."
                          : "Add a junior family member to enroll."}
                      </p>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="btn-premium-outline h-7 text-[11px] shrink-0"
                      >
                        <Link to="/members/add">
                          <Plus className="size-3.5 mr-1" /> Add family member
                        </Link>
                      </Button>
                    </div>
                  )}



                  {Array.from(memberInvitesMap.entries()).map(([memberId, mInvites]) => {
                    const member = s.members.find(m => m.id === memberId);
                    if (!member) return null;
                    
                    const hasOpen = !isCancelled && mInvites.some(i => i.status === "open");
                    const isAllAccepted = mInvites.every(i => i.status === "accepted");
                    const displayStatus = isCancelled ? "cancelled" : isAllAccepted ? "accepted" : hasOpen ? "open" : mInvites[0].status;
                    
                    // Only the sessions within this month that the member was invited to
                    const invitedMonthSessions = monthSessions.filter(ms =>
                      mInvites.some(i => i.trainingId === ms.id)
                    );
                    
                    return (
                      <div key={memberId} className="pt-2.5 border-t border-white/[0.04] space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-[#F1F0EE] truncate">
                              <span className="text-[11px] text-[#8A8A98] font-normal mr-1.5">
                                {targetType === "adult" ? "Member:" : "Child:"}
                              </span>
                              {name(memberId)}
                            </div>
                            <div className="text-[11px] text-[#8A8A98]">
                              {invitedMonthSessions.length} invited session{invitedMonthSessions.length !== 1 ? "s" : ""} this month
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusBadge kind="invitation" status={displayStatus} />
                            {hasOpen && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="btn-premium-solid h-7.5 px-3 text-[11px] font-semibold cursor-pointer"
                                  onClick={() => {
                                    setBulkAcceptPopup({
                                      member,
                                      training: t,
                                      // Pass the full month sessions so we can calculate per-week fee correctly
                                      monthSessions,
                                      // Only the sessions this member was invited to in this month
                                      invitedMonthSessions,
                                      invites: mInvites.filter(i => i.status !== "accepted")
                                    });
                                  }}
                                >
                                  Accept
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="btn-premium-outline h-7.5 px-3 text-[11px] cursor-pointer"
                                  onClick={async () => {
                                    try {
                                      await s.respondTrainingBulk(mInvites.map(i => i.id), "declined");
                                      toast.success("Declined invitation");
                                    } catch (error: any) {
                                      toast.error(error.message || "Failed to decline invitation.");
                                    }
                                  }}
                                >
                                  Decline
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Read-Only Attendance Status for Accepted Members */}
                        {isAllAccepted && !isCancelled && (
                          <div className="mt-2 p-2.5 rounded-lg bg-[#0C0F0E]/80 border border-white/5 space-y-1">
                            <div className="text-[10px] font-semibold tracking-wider text-[#34D399] uppercase">
                              Attendance Status
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                              {invitedMonthSessions.map((ms) => {
                                const dateRec = s.trainingDates.find(
                                  (d) => d.trainingId === ms.id && d.memberId === memberId
                                );
                                const dateLabel = new Date(ms.startDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
                                const isPresent = dateRec?.attended === true;
                                const isAbsent = dateRec?.attended === false;
                                const refundStatus = dateRec?.refundStatus;

                                return (
                                  <div key={ms.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-white/[0.02]">
                                    <span className="text-[#8A8A98] font-mono">{dateLabel}:</span>
                                    {isPresent ? (
                                      <span className="text-emerald-400 font-semibold">Present</span>
                                    ) : isAbsent ? (
                                      refundStatus === "half" ? (
                                        <span className="text-purple-400 font-semibold">Absent (50% Refunded)</span>
                                      ) : refundStatus === "full" ? (
                                        <span className="text-emerald-400 font-semibold">Absent (Refunded)</span>
                                      ) : (
                                        <span className="text-rose-400 font-semibold">Absent</span>
                                      )
                                    ) : (
                                      <span className="text-gray-400 font-light">Scheduled</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {isCancelled && (
                          <div className="text-[11px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5 font-light">
                            <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[#EF4444]" />
                            <div className="space-y-0.5">
                              <div className="font-semibold text-[#EF4444]">Cancelled Reason:</div>
                              <div className="text-[#EF4444]/90 font-light">{cancelReason}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}


              </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
