import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlaySchedule, Rotation } from "@/lib/types";

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

export function CourtRotationView({
  schedule,
  rotation,
  memberName,
  className,
}: {
  schedule: PlaySchedule;
  rotation: Rotation;
  memberName: (id: string) => string;
  className?: string;
}) {
  const roundCount = rotation.rounds.length;

  return (
    <div className={cn("space-y-4", className)}>
      <Tabs defaultValue="r1" className="w-full">
        <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex mb-4 h-10 max-w-full w-full sm:w-auto overflow-x-auto">
          {rotation.rounds.map((r) => (
            <TabsTrigger
              key={r.round}
              value={`r${r.round}`}
              className="text-[13px] font-medium px-3 sm:px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all shrink-0"
            >
              Round {r.round}
            </TabsTrigger>
          ))}
        </TabsList>

        {rotation.rounds.map((r) => {
          const courtTime = getCourtTimeRange(schedule, r.round, roundCount);
          return (
            <TabsContent key={r.round} value={`r${r.round}`} className="focus-visible:outline-none space-y-6">
              <div className="grid md:grid-cols-2 gap-5">
                {r.courts.map((c) => (
                  <Card key={c.courtNo} className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
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
                        const p = c.players[idx];
                        const isGuest = typeof p === "string" && p.startsWith("guest_");
                        return (
                          <div
                            key={idx}
                            className={cn(
                              "rounded-lg border px-2 sm:px-3 py-2.5 text-center text-[12px] sm:text-[13px] font-semibold truncate transition-colors min-w-0",
                              p
                                ? isGuest
                                  ? "bg-[#1A2120] border-[rgba(245,158,11,0.35)] text-[#FBBF24]"
                                  : "bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] hover:border-[rgba(16,185,129,0.3)]"
                                : "bg-[#1A2120]/60 border-dashed border-[rgba(255,255,255,0.08)] text-[#4A5E58]",
                            )}
                            title={p ? memberName(p) : undefined}
                          >
                            {p ? memberName(p) : "—"}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                ))}

                {r.resting.length > 0 && (
                  <Card className="md:col-span-2 bg-[#131916] border-[rgba(255,255,255,0.06)]">
                    <CardHeader className="pb-3 border-b border-white/[0.03]">
                      <CardTitle className="text-[11px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase">
                        Resting Players (Bye)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 flex flex-wrap gap-2">
                      {r.resting.map((p) => (
                        <div
                          key={p}
                          className="rounded-full bg-white/5 border border-white/10 px-3.5 py-1 text-[13px] font-medium text-[#F1F0EE]"
                        >
                          {memberName(p)}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
