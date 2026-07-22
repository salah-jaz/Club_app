import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { CalendarDays, GraduationCap, LayoutGrid, Plus, Wallet, AlertTriangle, Trophy, Users } from "lucide-react";
import type { Member, PlayInvitation, PlaySchedule, Rotation, Training } from "@/lib/types";
import { applyMemberFee, discountsFromStore, playSessionBaseFee } from "@/lib/fees";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/invitations")({ component: Invitations });

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
  if (member.memberType !== "adult" || member.status !== "active" || !member.membership) {
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

function Invitations() {
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

  const [enrollSelections, setEnrollSelections] = useState<Record<string, string[]>>({});
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

  const toggleEnrollChild = (trainingId: string, memberId: string, checked: boolean) => {
    setEnrollSelections((prev) => {
      const current = prev[trainingId] ?? [];
      const next = checked ? [...current, memberId] : current.filter((id) => id !== memberId);
      return { ...prev, [trainingId]: next };
    });
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
    capacity: {
      acceptedCount: number;
      maxPlayers: number;
    },
  ) => {
    const member = s.members.find((x) => x.id === i.memberId);
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
    const estimatedFee = skipsLeagueFee
      ? 0
      : applyMemberFee(
          playSessionBaseFee(sch.sessionRate),
          member,
          discountsFromStore(s),
        );
    // League matches allow accept with low credit (balance may go negative). Non-league blocks.
    const hasInsufficientCredits =
      !!member &&
      !member.skipCreditConsumption &&
      !skipsLeagueFee &&
      !sch.isLeagueMatch &&
      member.credit < estimatedFee;

    const responsesLocked =
      sch.status === "rotated" || sch.status === "published" || sch.status === "closed";
    const scheduleIso = scheduleDateIso(sch.date);
    const isHoliday = !!scheduleIso && (s.holidays ?? []).includes(scheduleIso);
    const courtsPublished =
      (sch.status === "published" || sch.status === "closed") &&
      s.rotations.some((r) => r.scheduleId === sch.id);

    const lockHours = Math.max(0, s.cancellationLockHours ?? 24);
    const matchStartMs = Date.parse(sch.date);
    const withinCancelWindow =
      Number.isFinite(matchStartMs) &&
      Date.now() < matchStartMs - lockHours * 60 * 60 * 1000;
    const hoursLabel = lockHours === 1 ? "1 hour" : `${lockHours} hours`;

    const canAccept =
      !isHoliday && !responsesLocked && (i.status === "open" || i.status === "declined");
    const canDeclineWaiting = !isHoliday && !responsesLocked && i.status === "waiting";
    const canDeclineAccepted =
      !isHoliday && !responsesLocked && i.status === "accepted" && withinCancelWindow;
    const canDecline = canDeclineWaiting || canDeclineAccepted;
    const declineLockedByTime =
      !isHoliday && !responsesLocked && i.status === "accepted" && !withinCancelWindow;

    return (
      <div key={i.id} className="space-y-2 pt-2 border-t border-white/[0.03]">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-[#34D399] font-medium">Player: {name(i.memberId)}</div>
            <div className="text-[11px] text-[#8A8A98] mt-0.5 font-light">
              Session Fee:{" "}
              <span className="font-semibold font-mono text-[#34D399]">
                {fmtMoney(estimatedFee)}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <StatusBadge kind="invitation" status={i.status === "declined" ? "open" : i.status} />
            <div className="rounded-md border border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] px-3 py-2 min-w-[72px] text-left">
              <div className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase">
                Players
              </div>
              <div className="font-mono text-[18px] font-semibold text-[#F1F0EE] leading-tight mt-0.5">
                {capacity.acceptedCount}/{capacity.maxPlayers}
              </div>
              <div
                className="mt-1 h-[2px] w-full rounded-full bg-[#3B82F6]"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
        {canAccept && hasInsufficientCredits && (
          <div className="text-[11px] text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-2.5 py-1.5 rounded-lg flex items-start gap-1.5 font-light">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">Alert:</span> Insufficient credits (
              {fmtMoney(member!.credit)} / {fmtMoney(estimatedFee)})
            </span>
          </div>
        )}
        {isHoliday && (
          <div className="text-[11px] text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/25 px-2.5 py-1.5 rounded-lg flex items-start gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">Club holiday:</span> Accept and decline are closed for
              this session.
            </span>
          </div>
        )}
        {responsesLocked && (
          <div className="text-[11px] text-[#8A8A98] bg-white/[0.03] border border-white/[0.06] rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[#8A8A98]" />
            <span>Court rotation is locked — accept and decline are closed for all members.</span>
          </div>
        )}
        {declineLockedByTime && (
          <div className="text-[11px] text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/25 px-2.5 py-1.5 rounded-lg flex items-start gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>
              <span className="font-semibold">Cancellation closed:</span> You cannot cancel within{" "}
              {hoursLabel} of the match start. This rule applies to all members.
            </span>
          </div>
        )}
        {canAccept && (
          <Button
            size="sm"
            className="w-full btn-premium-solid h-8 text-[11px] font-semibold cursor-pointer"
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
            variant="destructive"
            className="w-full btn-premium-danger h-8 text-[11px] font-semibold cursor-pointer"
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
        {courtsPublished && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full btn-premium-outline h-8 text-[11px] font-semibold cursor-pointer"
            onClick={() => openCourtsPopup(sch)}
          >
            <LayoutGrid className="size-3.5 mr-1" />
            View court details
          </Button>
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
                color: "text-[#2DD4BF]",
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
                    className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/60 overflow-hidden"
                  >
                    <div className="px-3 py-2.5 border-b border-white/[0.04] flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase">
                        {col.label}
                      </span>
                      <span className={cn("font-mono text-xs", col.color)}>{col.countLabel}</span>
                    </div>
                    <div className="px-3 py-2 max-h-[320px] overflow-y-auto space-y-0.5">
                      {col.items.length === 0 ? (
                        <p className="text-[13px] font-light text-[#4A5E58] py-3 text-center">
                          No members listed.
                        </p>
                      ) : (
                        col.items.map((inv, idx) => {
                          const isGuest =
                            typeof inv.memberId === "string" && inv.memberId.startsWith("guest_");
                          return (
                            <div
                              key={inv.id}
                              className="text-[13px] text-[#EEF2F0] py-2 border-b border-white/[0.03] last:border-0 font-semibold flex items-center gap-2"
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
        title="My invitations"
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
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase flex items-center gap-2">
              <CalendarDays className="size-4 text-[#10B981]" /> Play Session Invitations
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
                <p className="text-[13px] font-light text-[#4A5E58] text-center">
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
              const scheduleInvites = invitesForSchedule(sch.id);
              const canEnroll = sch.status === "released";
              const waitingForInvite = canEnroll && available.length > 0 && (autoInviting || scheduleInvites.length === 0);
              const acceptedCount = s.playInvites.filter(
                (i) => i.scheduleId === sch.id && i.status === "accepted",
              ).length;
              const maxPlayers = Math.max(sch.players || 0, 1);

              return (
                <div
                  key={sch.id}
                  className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-semibold text-[#F1F0EE] text-[14px]">{sch.name}</div>
                        {sch.isLeagueMatch && (
                          <span className="inline-flex items-center gap-1 rounded-md border border-[#818CF8]/30 bg-[#818CF8]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#A5B4FC] uppercase">
                            <Trophy className="size-3" />
                            League
                          </span>
                        )}
                        {(() => {
                          const iso = scheduleDateIso(sch.date);
                          return iso && (s.holidays ?? []).includes(iso) ? (
                            <span className="inline-flex items-center rounded-md border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#FBBF24] uppercase">
                              Holiday
                            </span>
                          ) : null;
                        })()}
                      </div>
                      <div className="text-[11px] text-[#8A8A98] mt-1 font-light font-mono">
                        {fmtDateTime(sch.date)} · {sch.location}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <StatusBadge status={sch.status} />
                      {(sch.status === "released" ||
                        sch.status === "rotated" ||
                        sch.status === "published" ||
                        sch.status === "closed") && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="btn-premium-outline h-8 text-[11px] cursor-pointer"
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
                            className="btn-premium-outline h-8 text-[11px] cursor-pointer"
                            onClick={() => openCourtsPopup(sch)}
                          >
                            <LayoutGrid className="size-3.5 mr-1" />
                            View court details
                          </Button>
                        )}
                    </div>
                  </div>

                  {canEnroll && adultPlayers.length === 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-white/[0.03]">
                      <p className="text-[12px] text-muted-foreground">
                        Add an adult family member to join this session.
                      </p>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="btn-premium-outline h-8 text-[11px] shrink-0"
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
                    scheduleInvites.length === 0 && (
                      <p className="text-[12px] text-muted-foreground pt-1 border-t border-white/[0.03]">
                        None of your members are eligible for this session yet (active adult with club
                        membership
                        {sch.isLeagueMatch ? ", and in the assigned league group" : ""}).
                      </p>
                    )}

                  {waitingForInvite && scheduleInvites.length === 0 && (
                    <p className="text-[12px] text-muted-foreground pt-1 border-t border-white/[0.03]">
                      Preparing your invitation…
                    </p>
                  )}

                  {scheduleInvites.map((i) =>
                    renderPlayInviteActions(i, sch, {
                      acceptedCount,
                      maxPlayers,
                    }),
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase flex items-center gap-2">
              <GraduationCap className="size-4 text-[#10B981]" /> Training Program Invites
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {uniquePrograms.length === 0 && (
              <div className="py-4 space-y-3">
                <p className="text-[13px] font-light text-[#4A5E58] text-center">
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
              const selected = enrollSelections[t.id] ?? [];
              const programInvites = invitesForTraining(t.id);
              const canEnroll = t.status === "open" || t.status === "released";

              return (
                <div
                  key={t.id}
                  className="border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 rounded-lg p-4 space-y-3"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <div className="font-semibold text-[#F1F0EE] text-[14px]">{t.name}</div>
                      <div className="text-[11px] text-[#8A8A98] mt-1 font-light font-mono">
                        Coach {t.coach} · {fmtDate(t.startDate)} → {fmtDate(t.endDate)} · {t.sessions}{" "}
                        sessions
                      </div>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>

                  {canEnroll && juniorChildren.length === 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-white/[0.03]">
                      <p className="text-[12px] text-muted-foreground">
                        Add a junior family member to enroll.
                      </p>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="btn-premium-outline h-8 text-[11px] shrink-0"
                      >
                        <Link to="/members/add">
                          <Plus className="size-3.5 mr-1" /> Add family member
                        </Link>
                      </Button>
                    </div>
                  )}

                  {canEnroll && children.length > 0 && (
                    <div className="space-y-2 pt-1 border-t border-white/[0.03]">
                      <p className="text-[11px] font-medium tracking-[0.08em] text-[#8A8A98] uppercase">
                        Select children to invite
                      </p>
                      <div className="grid gap-2">
                        {children.map((child) => {
                          const childFee = applyMemberFee(t.fees, child, discountsFromStore(s));
                          return (
                            <label
                              key={child.id}
                              className="flex items-center gap-3 p-2.5 bg-[#1A2120] border border-[rgba(255,255,255,0.06)] hover:border-[rgba(16,185,129,0.3)] rounded-lg cursor-pointer transition-all"
                            >
                              <Checkbox
                                checked={selected.includes(child.id)}
                                onCheckedChange={(c) => toggleEnrollChild(t.id, child.id, !!c)}
                                className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981]"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-[#F1F0EE] text-[13px] truncate">
                                  {child.firstName} {child.lastName}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  Grade {child.grade} · Fee{" "}
                                  <span className="font-mono text-[#34D399]">
                                    {fmtMoney(childFee)}
                                  </span>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      <Button
                        size="sm"
                        disabled={selected.length === 0 || enrollingId === t.id}
                        className="btn-premium-solid h-8 text-[11px] font-semibold cursor-pointer w-full sm:w-auto"
                        onClick={async () => {
                          setEnrollingId(t.id);
                          try {
                            await enrollTraining(t.id, selected);
                            await syncData();
                            toast.success(
                              `Invited ${selected.length} child${selected.length === 1 ? "" : "ren"}`,
                            );
                            setEnrollSelections((prev) => ({ ...prev, [t.id]: [] }));
                          } catch (error: any) {
                            toast.error(error.message || "Failed to send invitations.");
                          } finally {
                            setEnrollingId(null);
                          }
                        }}
                      >
                        Send invitations
                      </Button>
                    </div>
                  )}

                  {programInvites.map((i) => (
                    <div key={i.id} className="flex flex-col gap-2 pt-2 border-t border-white/[0.03]">
                      <div className="flex justify-between items-center gap-2">
                        <div className="text-[11px] text-[#34D399] font-medium">
                          Child: {name(i.memberId)}
                        </div>
                        <StatusBadge kind="invitation" status={i.status} />
                      </div>
                      {i.status === "open" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="flex-1 btn-premium-solid h-8 text-[11px] font-semibold cursor-pointer"
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
                            className="flex-1 btn-premium-outline h-8 text-[11px] cursor-pointer"
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
                  ))}

                  {canEnroll &&
                    juniorChildren.length > 0 &&
                    children.length === 0 &&
                    programInvites.length === 0 && (
                      <p className="text-[12px] text-muted-foreground pt-1 border-t border-white/[0.03]">
                        Select your children above to receive invitations.
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
