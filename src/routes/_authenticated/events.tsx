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
import type { Member, PlayInvitation, PlaySchedule, Rotation, Training } from "@/lib/types";
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
  const activePrograms = s.trainings.filter((t) => t.status === "released" || t.status === "open");
  const releasedSchedules = s.schedules.filter((sch) => sch.status === "released");
  const [courtsPopup, setCourtsPopup] = useState<{
    schedule: PlaySchedule;
    rotation: Rotation;
  } | null>(null);
  const [playersPopup, setPlayersPopup] = useState<PlaySchedule | null>(null);

  const [enrollingId, setEnrollingId] = useState<string | null>(null);
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

  const invitedMemberIds = (trainingId: string) =>
    s.trainingInvites.filter((i) => i.trainingId === trainingId).map((i) => i.memberId);

  const availableChildren = (trainingId: string) =>
    juniorChildren.filter((c) => !invitedMemberIds(trainingId).includes(c.id));

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

  const trainingPrograms: Training[] = [
    ...activePrograms,
    ...trainInvs
      .map((i) => s.trainings.find((t) => t.id === i.trainingId))
      .filter((t): t is Training => !!t && !activePrograms.some((p) => p.id === t.id)),
  ];

  const uniquePrograms = trainingPrograms.filter(
    (t, idx, arr) => arr.findIndex((x) => x.id === t.id) === idx,
  );

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

  const invitesForTraining = (trainingId: string) =>
    trainInvs.filter((i) => i.trainingId === trainingId);

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
      sch.status === "rotated" || sch.status === "published" || sch.status === "closed" || sch.status === "cancelled";
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
        {isHoliday && (
          <div className="text-[11px] text-[#FBBF24] bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">{holidayName}:</span> Accept and decline are closed for
              this session.
            </span>
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
                            {holidayName}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-[#8A8A98] font-mono font-light">
                        {fmtDateTime(sch.date)} · {sch.location}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <StatusBadge status={sch.status} />
                      {(sch.status === "released" ||
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
                      {(sch.status === "published" || sch.status === "closed") &&
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
                        <div className="font-semibold text-[#EF4444]">Cancelled</div>
                        <div className="text-[#EF4444]/90 font-light">Reason: {sch.cancelReason || "No reason specified."}</div>
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
              <div className="font-semibold text-[#EF4444]">Cancelled</div>
              <div className="text-[#EF4444]/90 font-light">Reason: {sch.cancelReason || "No reason specified."}</div>
            </div>
          </div>
        ) : isHoliday ? (
                        <div className="text-[11px] text-[#FBBF24] bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-2.5 py-1.5 rounded-md flex items-start gap-1.5">
                          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                          <span>
                            <span className="font-semibold">{holidayName}:</span> Accept and decline are closed for
                            this session.
                          </span>
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

                  {scheduleInvites.length > 0 && (
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
            {uniquePrograms.length === 0 && (
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

            {uniquePrograms.map((t) => {
              const children = availableChildren(t.id);
              const programInvites = invitesForTraining(t.id);
              const canEnroll = t.status === "open" || t.status === "released";
              const holidayName = getHolidayName(t.startDate);

              return (
                <div
                  key={t.id}
                  className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-[#F1F0EE] text-[14px]">{t.name}</div>
                        {holidayName && (
                          <span className="inline-flex items-center rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#FBBF24] uppercase">
                            {holidayName}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#8A8A98] font-mono font-light">
                        Coach {t.coach} · {fmtDate(t.startDate)} → {fmtDate(t.endDate)} · {t.sessions}{" "}
                        sessions
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>

                  {canEnroll && juniorChildren.length === 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/[0.04]">
                      <p className="text-[12px] text-muted-foreground">
                        Add a junior family member to enroll.
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

                  {canEnroll && children.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-white/[0.04]">
                      <p className="text-[11px] font-medium tracking-[0.08em] text-[#8A8A98] uppercase">
                        Accept children into this program
                      </p>
                      <div className="grid gap-2">
                        {children.map((child) => {
                          const childFee = applyMemberFee(t.fees, child, discountsFromStore(s));
                          const acceptingKey = `${t.id}:${child.id}`;
                          return (
                            <div
                              key={child.id}
                              className="flex items-center justify-between gap-3 p-2.5 bg-[#1A2120]/60 border border-[rgba(255,255,255,0.04)] rounded-lg"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-[#F1F0EE] text-[13px] truncate">
                                  {child.firstName} {child.lastName}
                                </div>
                                <div className="text-[11px] text-[#8A8A98]">
                                  Grade {child.grade} · Fee{" "}
                                  <span className="font-mono font-semibold text-[#3B82F6]">
                                    {fmtMoney(childFee)}
                                  </span>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                disabled={enrollingId === acceptingKey}
                                className="btn-premium-solid h-7.5 px-3.5 text-[11px] font-semibold cursor-pointer shrink-0"
                                onClick={async () => {
                                  setEnrollingId(acceptingKey);
                                  try {
                                    await enrollTraining(t.id, [child.id]);
                                    toast.success(`Accepted ${child.firstName} into training`);
                                  } catch (error: any) {
                                    toast.error(error.message || "Failed to accept child.");
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
                    </div>
                  )}

                  {programInvites.map((i) => (
                    <div key={i.id} className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/[0.04]">
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-[#F1F0EE] truncate">
                          <span className="text-[11px] text-[#8A8A98] font-normal mr-1.5">Child:</span>
                          {name(i.memberId)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <StatusBadge kind="invitation" status={i.status} />
                        {i.status === "open" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="btn-premium-solid h-7.5 px-3 text-[11px] font-semibold cursor-pointer"
                              onClick={async () => {
                                try {
                                  await s.respondTraining(i.id, "accepted");
                                  toast.success("Accepted invitation");
                                } catch (error: any) {
                                  toast.error(error.message || "Failed to respond to invitation.");
                                }
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
                                  await s.respondTraining(i.id, "declined");
                                  toast.success("Declined invitation");
                                } catch (error: any) {
                                  toast.error(error.message || "Failed to respond to invitation.");
                                }
                              }}
                            >
                              Decline
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  {canEnroll &&
                    juniorChildren.length > 0 &&
                    children.length === 0 &&
                    programInvites.length === 0 && (
                      <p className="text-[12px] text-muted-foreground pt-2 border-t border-white/[0.04]">
                        No eligible children left to accept for this program.
                      </p>
                    )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
