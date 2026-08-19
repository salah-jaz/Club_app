import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Clock, GripVertical, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser, useStore } from "@/lib/store";
import { toast } from "sonner";
import type { PlaySchedule, Rotation, RotationRound } from "@/lib/types";

/** Parse values like "15 min", "20 minutes", "15m" into minutes. */
export function parseSlotMinutes(slotDuration: string, slotHours: number, roundCount: number): number {
  const match = String(slotDuration || "").match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const n = parseFloat(match[1]);
    if (n > 0) return Math.round(n);
  }
  if (slotHours > 0 && roundCount > 0) {
    return Math.max(1, Math.round((slotHours * 60) / roundCount));
  }
  return 15;
}

function formatCourtClock(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Court time = session start + (round - 1) × slot duration.
 * Courts share the same window within a round (doubles play in parallel).
 */
export function getCourtTimeRange(
  sch: PlaySchedule,
  roundNumber: number,
  roundCount: number,
): { label: string } {
  const durationMin = parseSlotMinutes(sch.slotDuration, sch.slotHours, roundCount);
  const start = new Date(sch.date);
  start.setMinutes(start.getMinutes() + (roundNumber - 1) * durationMin);
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMin);
  return {
    label: `${formatCourtClock(start)} – ${formatCourtClock(end)}`,
  };
}

type DragSource =
  | { kind: "court"; roundIdx: number; courtNo: number; slot: number; playerId: string }
  | { kind: "rest"; roundIdx: number; restIdx: number; playerId: string };

function cloneRounds(rounds: RotationRound[]): RotationRound[] {
  return rounds.map((r) => ({
    round: r.round,
    resting: [...(r.resting || [])],
    courts: (r.courts || []).map((c) => ({
      courtNo: c.courtNo,
      players: [...(c.players || [])],
    })),
  }));
}

/** Ensure each court has exactly 4 slots (null placeholders as empty string omitted). */
function normalizeRoundPlayers(round: RotationRound): RotationRound {
  return {
    ...round,
    courts: round.courts.map((c) => {
      const players = [...(c.players || [])].filter(Boolean);
      while (players.length < 4) players.push("");
      return { ...c, players: players.slice(0, 4).map((p) => p || "") };
    }),
    resting: [...(round.resting || [])].filter(Boolean),
  };
}

function stripEmptySlots(rounds: RotationRound[]): RotationRound[] {
  return rounds.map((r) => ({
    round: r.round,
    resting: (r.resting || []).filter(Boolean),
    courts: (r.courts || []).map((c) => ({
      courtNo: c.courtNo,
      players: (c.players || []).filter(Boolean),
    })),
  }));
}

function applyMove(
  rounds: RotationRound[],
  source: DragSource,
  target: DragSource | { kind: "rest-zone"; roundIdx: number },
): RotationRound[] {
  const next = cloneRounds(rounds).map(normalizeRoundPlayers);
  const roundIdx = source.roundIdx;
  if (roundIdx !== target.roundIdx) return rounds;

  const round = next[roundIdx];
  if (!round) return rounds;

  const takeFromSource = (): string | null => {
    if (source.kind === "court") {
      const court = round.courts.find((c) => c.courtNo === source.courtNo);
      if (!court || court.players[source.slot] !== source.playerId) return null;
      court.players[source.slot] = "";
      return source.playerId;
    }
    if (round.resting[source.restIdx] !== source.playerId) return null;
    round.resting.splice(source.restIdx, 1);
    return source.playerId;
  };

  const moving = takeFromSource();
  if (!moving) return rounds;

  const putOnSourceSlot = (playerId: string) => {
    if (source.kind === "court") {
      const court = round.courts.find((c) => c.courtNo === source.courtNo);
      if (court) court.players[source.slot] = playerId;
    } else {
      round.resting.splice(Math.min(source.restIdx, round.resting.length), 0, playerId);
    }
  };

  if (target.kind === "rest-zone") {
    round.resting.push(moving);
    return next;
  }

  if (target.kind === "rest") {
    // After removing from rest, adjust index if we removed an earlier item
    let insertAt = target.restIdx;
    if (source.kind === "rest" && source.restIdx < target.restIdx) {
      insertAt = Math.max(0, insertAt - 1);
    }
    insertAt = Math.min(insertAt, round.resting.length);
    const displaced = round.resting[insertAt];
    if (displaced && source.kind === "court") {
      round.resting[insertAt] = moving;
      putOnSourceSlot(displaced);
    } else if (displaced && source.kind === "rest") {
      round.resting[insertAt] = moving;
      // swap within resting: put displaced where source was
      putOnSourceSlot(displaced);
    } else {
      round.resting.splice(insertAt, 0, moving);
    }
    return next;
  }

  // Court slot target
  const tCourt = round.courts.find((c) => c.courtNo === target.courtNo);
  if (!tCourt) return rounds;

  // Same slot after remove (empty) — just place back
  if (
    source.kind === "court" &&
    source.courtNo === target.courtNo &&
    source.slot === target.slot
  ) {
    tCourt.players[target.slot] = moving;
    return next;
  }

  const displaced = tCourt.players[target.slot] || "";
  tCourt.players[target.slot] = moving;
  if (displaced) {
    putOnSourceSlot(displaced);
  }

  return next;
}

export function CourtRotationView({
  schedule,
  rotation,
  memberName,
  memberGrade,
  className,
  editing = false,
  draftRounds,
  onDraftRoundsChange,
  isAdmin = false,
}: {
  schedule: PlaySchedule;
  rotation: Rotation;
  memberName: (id: string) => string;
  /** Optional grade lookup — guests return empty */
  memberGrade?: (id: string) => string | undefined;
  className?: string;
  /** Admin drag-edit mode */
  editing?: boolean;
  draftRounds?: RotationRound[];
  onDraftRoundsChange?: (rounds: RotationRound[]) => void;
  /** Only admins see the show-grades toggle */
  isAdmin?: boolean;
}) {
  const updateRotationShowGrades = useStore((s) => s.updateRotationShowGrades);
  const currentUser = useCurrentUser();
  const members = useStore((s) => s.members);
  const showGrade = !!rotation.showMemberGrades;
  // Editable only before publish (status === "rotated")
  const canChangeShowGrade = isAdmin && schedule.status === "rotated";
  const [savingGradePref, setSavingGradePref] = useState(false);
  const [courtFilter, setCourtFilter] = useState<"your" | "all">("your");

  const myMemberIds = useMemo(
    () => new Set(members.filter((m) => m.userId === currentUser?.id).map((m) => m.id)),
    [members, currentUser?.id],
  );

  const displayName = (playerId: string) => {
    const base = memberName(playerId);
    return myMemberIds.has(playerId) ? `${base} (you)` : base;
  };

  const rounds = useMemo(
    () => (editing && draftRounds ? draftRounds : rotation.rounds).map(normalizeRoundPlayers),
    [editing, draftRounds, rotation.rounds],
  );
  const roundCount = rounds.length;
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [activeRound, setActiveRound] = useState(`r${rounds[0]?.round ?? 1}`);

  const roundsForYou = useMemo(() => {
    return rounds.filter(
      (r) =>
        (r.courts || []).some((c) => (c.players || []).some((p) => p && myMemberIds.has(p))) ||
        (r.resting || []).some((p) => p && myMemberIds.has(p)),
    );
  }, [rounds, myMemberIds]);

  const showCourtFilter = useMemo(() => {
    if (editing || myMemberIds.size === 0) return false;
    return roundsForYou.length > 0;
  }, [editing, myMemberIds.size, roundsForYou.length]);

  const visibleRoundList =
    showCourtFilter && courtFilter === "your" ? roundsForYou : rounds;

  // Keep selected round valid when switching Your Court / All Courts
  const effectiveRoundValue = visibleRoundList.some((r) => `r${r.round}` === activeRound)
    ? activeRound
    : `r${visibleRoundList[0]?.round ?? rounds[0]?.round ?? 1}`;

  const setRounds = (next: RotationRound[]) => {
    onDraftRoundsChange?.(next);
  };

  const onToggleShowGrade = async (checked: boolean) => {
    if (!canChangeShowGrade) return;
    setSavingGradePref(true);
    try {
      await updateRotationShowGrades(schedule.id, checked);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to update preference.");
    } finally {
      setSavingGradePref(false);
    }
  };

  const onDragStart = (e: React.DragEvent, source: DragSource, key: string) => {
    if (!editing) return;
    e.dataTransfer.setData("application/x-rotation-player", JSON.stringify(source));
    e.dataTransfer.effectAllowed = "move";
    setDraggingKey(key);
  };

  const onDragEnd = () => {
    setDraggingKey(null);
    setDragOverKey(null);
  };

  const parseSource = (e: React.DragEvent): DragSource | null => {
    try {
      return JSON.parse(e.dataTransfer.getData("application/x-rotation-player")) as DragSource;
    } catch {
      return null;
    }
  };

  const playerChip = (
    playerId: string | undefined,
    opts: {
      key: string;
      source?: DragSource;
      dropTarget?: DragSource | { kind: "rest-zone"; roundIdx: number };
      empty?: boolean;
      resting?: boolean;
    },
  ) => {
    const isGuest = typeof playerId === "string" && playerId.startsWith("guest_");
    const isYou = !!playerId && myMemberIds.has(playerId);
    const canDrag = editing && !!playerId && !!opts.source;
    const isOver = dragOverKey === opts.key;
    const isDragging = draggingKey === opts.key;

    return (
      <div
        key={opts.key}
        draggable={canDrag}
        onDragStart={canDrag ? (e) => onDragStart(e, opts.source!, opts.key) : undefined}
        onDragEnd={onDragEnd}
        onDragOver={
          editing
            ? (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverKey(opts.key);
              }
            : undefined
        }
        onDragLeave={
          editing
            ? () => {
                setDragOverKey((k) => (k === opts.key ? null : k));
              }
            : undefined
        }
        onDrop={
          editing && opts.dropTarget
            ? (e) => {
                e.preventDefault();
                setDragOverKey(null);
                const source = parseSource(e);
                if (!source) return;
                // Same slot — no-op
                if (
                  source.kind === "court" &&
                  opts.dropTarget &&
                  "kind" in opts.dropTarget &&
                  opts.dropTarget.kind === "court" &&
                  source.courtNo === opts.dropTarget.courtNo &&
                  source.slot === opts.dropTarget.slot &&
                  source.roundIdx === opts.dropTarget.roundIdx
                ) {
                  return;
                }
                setRounds(applyMove(rounds, source, opts.dropTarget!));
              }
            : undefined
        }
        className={cn(
          "rounded-lg border px-2 sm:px-3 py-2.5 text-center text-[12px] sm:text-[13px] font-semibold transition-colors min-w-0 select-none",
          opts.resting && "rounded-full px-3.5 py-1.5 text-[13px] font-medium",
          playerId
            ? isYou
              ? "bg-[#10B981]/15 border-[#10B981]/50 text-[#34D399]"
              : isGuest
                ? "bg-[#1A2120] border-[rgba(245,158,11,0.35)] text-[#FBBF24]"
                : "bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE]"
            : "bg-[#1A2120]/60 border-dashed border-[rgba(255,255,255,0.08)] text-[#4A5E58]",
          editing && canDrag && "cursor-grab active:cursor-grabbing hover:border-[rgba(16,185,129,0.45)]",
          editing && !playerId && "cursor-pointer",
          isOver && editing && "border-[#10B981]/60 bg-[#10B981]/10 ring-1 ring-[#10B981]/30",
          isDragging && "opacity-40",
          editing && playerId && "inline-flex items-center justify-center gap-1",
          showGrade && playerId && !opts.resting && "flex flex-col items-center justify-center gap-0.5",
          showGrade && playerId && opts.resting && "inline-flex flex-col items-center gap-0.5",
        )}
        title={
          playerId
            ? showGrade && memberGrade?.(playerId)
              ? `${displayName(playerId)} · ${memberGrade(playerId)}`
              : displayName(playerId)
            : editing
              ? "Drop player here"
              : undefined
        }
      >
        <span className="inline-flex items-center justify-center gap-1 min-w-0 max-w-full">
          {editing && playerId && (
            <GripVertical className="size-3.5 shrink-0 text-[#6B7F78]" aria-hidden />
          )}
          <span className="break-words text-balance leading-snug">
            {playerId ? displayName(playerId) : editing ? "Drop here" : "—"}
          </span>
        </span>
        {showGrade && playerId && memberGrade?.(playerId) && (
          <span
            className={cn(
              "text-[10px] font-medium truncate max-w-full leading-tight",
              isYou ? "text-[#6EE7B7]" : "text-[#8FA89F]",
            )}
          >
            {memberGrade(playerId)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2",
              !canChangeShowGrade && "opacity-70",
            )}
            title={
              canChangeShowGrade
                ? undefined
                : "Grade visibility is locked after the rotation is published."
            }
          >
            <Switch
              id="show-grade-court-rotation"
              checked={showGrade}
              disabled={!canChangeShowGrade || savingGradePref}
              onCheckedChange={(v) => void onToggleShowGrade(v)}
              className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-foreground/25"
            />
            <Label
              htmlFor="show-grade-court-rotation"
              className={cn(
                "text-[12px] font-semibold tracking-wide uppercase !text-foreground",
                canChangeShowGrade ? "cursor-pointer" : "cursor-default",
              )}
            >
              Show member grades
            </Label>
          </div>
        </div>
      )}
      {editing && (
        <p className="text-[12px] text-[#8FA89F] bg-[#0C0F0E]/60 border border-white/[0.06] rounded-lg px-3 py-2">
          Drag players between court slots and resting. Drop onto another player to swap.
        </p>
      )}
      <Tabs
        value={effectiveRoundValue}
        onValueChange={setActiveRound}
        className="w-full"
      >
        <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex mb-4 h-10 max-w-full w-full sm:w-auto overflow-x-auto">
          {visibleRoundList.map((r) => (
            <TabsTrigger
              key={r.round}
              value={`r${r.round}`}
              className="text-[13px] font-medium px-3 sm:px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all shrink-0"
            >
              Round {r.round}
            </TabsTrigger>
          ))}
        </TabsList>

        {showCourtFilter && (
          <Tabs
            value={courtFilter}
            onValueChange={(v) => setCourtFilter(v as "your" | "all")}
            className="w-full mb-4"
          >
            <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex h-10 max-w-full w-full sm:w-auto">
              <TabsTrigger
                value="your"
                className="text-[13px] font-medium px-3 sm:px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all shrink-0"
              >
                Your Court
              </TabsTrigger>
              <TabsTrigger
                value="all"
                className="text-[13px] font-medium px-3 sm:px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all shrink-0"
              >
                All Courts
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {visibleRoundList.length === 0 ? (
          <p className="text-[13px] text-[#8FA89F] bg-[#0C0F0E]/60 border border-white/[0.06] rounded-lg px-4 py-6 text-center">
            You’re not assigned to a court in any round.
          </p>
        ) : (
          rounds.map((r, roundIdx) => {
          const courtTime = getCourtTimeRange(schedule, r.round, roundCount);
          const yourCourts = r.courts.filter((c) =>
            (c.players || []).some((p) => p && myMemberIds.has(p)),
          );
          const isMemberRestingInRound = (r.resting || []).some((p) => p && myMemberIds.has(p));
          const showYourOnly = showCourtFilter && courtFilter === "your";
          if (showYourOnly && yourCourts.length === 0 && !isMemberRestingInRound) return null;
          const visibleCourts = showYourOnly ? yourCourts : r.courts;
          const showResting = showYourOnly ? isMemberRestingInRound : true;

          return (
            <TabsContent key={r.round} value={`r${r.round}`} className="focus-visible:outline-none space-y-6">
              <div
                className={cn(
                  "grid gap-5",
                  visibleCourts.length > 1 ? "md:grid-cols-2" : "grid-cols-1",
                )}
              >
                {visibleCourts.map((c) => (
                  <Card
                    key={c.courtNo}
                    className={cn(
                      "bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top",
                      visibleCourts.length === 1 && "md:max-w-none",
                    )}
                  >
                    <CardHeader className="pb-3 border-b border-white/[0.03]">
                      <CardTitle className="text-[12px] font-semibold text-[#F1F0EE] flex flex-col xs:flex-row sm:flex-row sm:items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Trophy className="size-4 text-[#34D399]" /> Court {c.courtNo}
                        </span>
                        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-[#34D399] tracking-normal whitespace-nowrap">
                          <Clock className="size-3.5 opacity-80" aria-hidden="true" />
                          {courtTime.label}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 grid grid-cols-2 gap-2.5">
                      {[0, 1, 2, 3].map((idx) => {
                        const p = c.players[idx] || "";
                        const key = `r${roundIdx}-c${c.courtNo}-s${idx}`;
                        const source: DragSource | undefined = p
                          ? { kind: "court", roundIdx, courtNo: c.courtNo, slot: idx, playerId: p }
                          : undefined;
                        return playerChip(p || undefined, {
                          key,
                          source,
                          dropTarget: { kind: "court", roundIdx, courtNo: c.courtNo, slot: idx, playerId: p || "" },
                          empty: !p,
                        });
                      })}
                    </CardContent>
                  </Card>
                ))}

                {showResting && (
                <Card
                  className={cn(
                    "md:col-span-2 bg-[#131916] border-[rgba(255,255,255,0.06)]",
                    editing && dragOverKey === `r${roundIdx}-rest-zone` && "border-[#10B981]/40",
                  )}
                  onDragOver={
                    editing
                      ? (e) => {
                          e.preventDefault();
                          setDragOverKey(`r${roundIdx}-rest-zone`);
                        }
                      : undefined
                  }
                  onDrop={
                    editing
                      ? (e) => {
                          e.preventDefault();
                          setDragOverKey(null);
                          const source = parseSource(e);
                          if (!source || source.roundIdx !== roundIdx) return;
                          if (source.kind === "rest") return; // already resting
                          setRounds(applyMove(rounds, source, { kind: "rest-zone", roundIdx }));
                        }
                      : undefined
                  }
                >
                  <CardHeader className="pb-3 border-b border-white/[0.03]">
                    <CardTitle className="text-[11px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase">
                      Resting Players (Bye)
                      {editing && (
                        <span className="ml-2 normal-case tracking-normal font-normal text-[#6B7F78]">
                          — drop here to rest
                        </span>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4 flex flex-wrap gap-2 min-h-[48px]">
                    {r.resting.length === 0 && (
                      <p className="text-[12px] text-[#4A5E58]">
                        {editing ? "Drop a player here for a bye" : "No resting players"}
                      </p>
                    )}
                    {r.resting.map((p, restIdx) =>
                      playerChip(p, {
                        key: `r${roundIdx}-rest-${restIdx}-${p}`,
                        source: { kind: "rest", roundIdx, restIdx, playerId: p },
                        dropTarget: { kind: "rest", roundIdx, restIdx, playerId: p },
                        resting: true,
                      }),
                    )}
                  </CardContent>
                </Card>
                )}
              </div>
            </TabsContent>
          );
        })
        )}
      </Tabs>
    </div>
  );
}

export { stripEmptySlots, cloneRounds };
