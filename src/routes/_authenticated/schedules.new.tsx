import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtMoney, parseScheduleDateTime } from "@/lib/format";
import { datetimeLocalNow, isScheduleDateTimeInPast } from "@/lib/sessionTiming";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";

import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { LeagueGroupSelector } from "@/components/LeagueGroupSelector";

export const Route = createFileRoute("/_authenticated/schedules/new")({ component: NewSchedule });

function NewSchedule() {
  const holidays = useStore((s) => s.holidays);
  const create = useStore((s) => s.createSchedule);
  const locations = useStore((s) => s.locations);
  const leagueGroups = useStore((s) => s.leagueGroups || []);
  const allMembers = useStore((s) => s.members || []);
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "", date: "", courts: 2, players: 16, slotHours: 2, slotDuration: "15",
    sessionRate: 8, hallRate: 40, location: locations[0] || "Main Hall",
    isLeagueMatch: false, leagueGroupIds: [] as string[],
    repeatWeeks: 1,
  });
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!f.location && locations.length > 0) {
      set("location", locations[0]);
    }
  }, [locations, f.location]);

  const minDateTime = datetimeLocalNow();

  const leagueStats = useMemo(() => {
    if (!f.isLeagueMatch || !f.leagueGroupIds?.length)
      return { uniqueCount: 0, totalSlots: 0, sharedCount: 0 };
    const memberCounts = new Map<string, number>();
    let totalSlots = 0;
    for (const group of leagueGroups) {
      if (f.leagueGroupIds.includes(group.id)) {
        const ids =
          Array.isArray(group.memberIds) && group.memberIds.length > 0
            ? group.memberIds
            : group.members?.map((m) => m.id) || [];
        totalSlots += ids.length;
        ids.forEach((id) => {
          if (id) memberCounts.set(id, (memberCounts.get(id) || 0) + 1);
        });
      }
    }
    let sharedCount = 0;
    memberCounts.forEach((cnt) => {
      if (cnt > 1) sharedCount++;
    });
    return {
      uniqueCount: memberCounts.size,
      totalSlots,
      sharedCount,
    };
  }, [f.isLeagueMatch, f.leagueGroupIds, leagueGroups]);

  const leagueUniqueMemberCount = leagueStats.uniqueCount;

  useEffect(() => {
    if (f.isLeagueMatch) {
      setF((prev) => (prev.players === leagueUniqueMemberCount ? prev : { ...prev, players: leagueUniqueMemberCount }));
    }
  }, [f.isLeagueMatch, leagueUniqueMemberCount]);

  const scheduleWhen = useMemo(() => parseScheduleDateTime(f.date), [f.date]);

  const holidaySet = useMemo(() => new Set(holidays ?? []), [holidays]);

  const toIsoDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const repeatPreview = useMemo(() => {
    const weeks = Math.max(1, Math.min(52, Number(f.repeatWeeks) || 1));
    if (!f.date || weeks <= 1) return null;
    const start = new Date(f.date);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start);
    end.setDate(end.getDate() + (weeks - 1) * 7);
    const endLabel = parseScheduleDateTime(
      `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}T${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
    );

    let holidayWeeks = 0;
    const cursor = new Date(start);
    for (let i = 0; i < weeks; i++) {
      if (holidaySet.has(toIsoDate(cursor))) holidayWeeks++;
      cursor.setDate(cursor.getDate() + 7);
    }

    return {
      weeks,
      day: scheduleWhen?.day ?? "same day",
      endDate: endLabel?.date ?? end.toLocaleDateString(),
      holidayWeeks,
    };
  }, [f.date, f.repeatWeeks, scheduleWhen?.day, holidaySet]);

  const onDateChange = (value: string) => {
    const parsed = parseScheduleDateTime(value);
    setF((p) => ({
      ...p,
      date: value,
      name: !nameTouched && parsed ? parsed.label : p.name,
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="New play schedule" description="Define the court capacity, scheduling details, and membership pricing." backTo="/schedules" />
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!f.date) {
          toast.error("Please select a Date & Time for the schedule.");
          return;
        }
        if (f.isLeagueMatch && f.leagueGroupIds.length === 0) {
          toast.error("Please select at least one league group for the league schedule.");
          return;
        }
        if (isScheduleDateTimeInPast(f.date)) {
          toast.error("Schedule date and time must be today or later.");
          return;
        }
        const weeks = Math.max(1, Math.min(52, Number(f.repeatWeeks) || 1));
        setSubmitting(true);
        try {
          const { repeatWeeks: _rw, ...schedule } = f;
          await create({ ...schedule, repeatWeeks: weeks } as any);
          toast.success(
            weeks > 1
              ? `${weeks} schedules created (same day each week)`
              : "Schedule created",
          );
          navigate({ to: "/schedules" });
        } catch (error: any) {
          toast.error(error.message || "Failed to create schedule.");
        } finally {
          setSubmitting(false);
        }
      }} className="space-y-6">
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Session Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Date & Time</Label>
              <DateTimePicker
                value={f.date}
                onChange={onDateChange}
                minDateTime={minDateTime}
                placeholder="Select Date & Time..."
              />
              {scheduleWhen && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/60 px-3 py-2">
                    <p className="text-[9px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Day</p>
                    <p className="text-[13px] font-semibold text-[#F1F0EE] mt-0.5">{scheduleWhen.day}</p>
                  </div>
                  <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/60 px-3 py-2">
                    <p className="text-[9px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Date</p>
                    <p className="text-[13px] font-semibold text-[#F1F0EE] mt-0.5">{scheduleWhen.date}</p>
                  </div>
                  <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/60 px-3 py-2">
                    <p className="text-[9px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Time</p>
                    <p className="text-[13px] font-semibold text-[#F1F0EE] mt-0.5">{scheduleWhen.time}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Session Name</Label>
              <Input
                required
                value={f.name}
                onChange={(e) => {
                  setNameTouched(true);
                  set("name", e.target.value);
                }}
                placeholder="Friday · 18 Jul 2026 · 7:00 PM"
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
              {!nameTouched && scheduleWhen && (
                <p className="text-[11px] text-[#8A8A98]">Auto-filled from the selected date &amp; time. Edit anytime.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Repeat for Weeks
              </Label>
              <Input
                required
                type="number"
                min={1}
                max={52}
                value={f.repeatWeeks}
                onChange={(e) => set("repeatWeeks", Math.max(1, Math.min(52, Number(e.target.value) || 1)))}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
              />
              <p className="text-[11px] text-[#8A8A98]">
                {repeatPreview
                  ? `Creates ${repeatPreview.weeks} schedules every ${repeatPreview.day} through ${repeatPreview.endDate}${
                      repeatPreview.holidayWeeks > 0
                        ? ` (${repeatPreview.holidayWeeks} fall on club holiday${repeatPreview.holidayWeeks === 1 ? "" : "s"})`
                        : ""
                    }.`
                  : "Enter 1 for a single session, or more to repeat on the same weekday."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Club Location</Label>
              <Select value={f.location} onValueChange={(v) => set("location", v)}>
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">{locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              League Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
              <div>
                <Label className="text-[11px] font-medium text-[#F1F0EE]">Enable League</Label>
                <p className="text-xs text-muted-foreground">Limit invitations to specific league groups</p>
              </div>
              <Switch checked={f.isLeagueMatch} onCheckedChange={(v) => set("isLeagueMatch", v)} />
            </div>

            {f.isLeagueMatch && (
              <div className="pt-2">
                <LeagueGroupSelector
                  selectedGroupIds={f.leagueGroupIds}
                  onSelectionChange={(nextIds) => set("leagueGroupIds", nextIds)}
                  leagueGroups={leagueGroups}
                  allMembers={allMembers}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Capacity & Timing Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Courts</Label>
              <Input required type="number" min={1} value={f.courts} onChange={(e) => set("courts", +e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Max Players</Label>
              <Input
                required
                type="number"
                min={f.isLeagueMatch ? 0 : 1}
                value={f.isLeagueMatch ? leagueUniqueMemberCount : f.players}
                onChange={(e) => set("players", +e.target.value)}
                readOnly={f.isLeagueMatch}
                className={`bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono ${
                  f.isLeagueMatch ? "opacity-75 cursor-not-allowed bg-[#131916]" : ""
                }`}
              />
              {f.isLeagueMatch && (
                <p className="text-[11px] text-[#34D399] leading-relaxed">
                  {f.leagueGroupIds.length === 0
                    ? "Select league groups above to calculate max players."
                    : `Dynamic: ${leagueStats.uniqueCount} unique player${leagueStats.uniqueCount === 1 ? "" : "s"} across ${f.leagueGroupIds.length} selected team${f.leagueGroupIds.length === 1 ? "" : "s"}${
                        leagueStats.sharedCount > 0
                          ? ` (${leagueStats.totalSlots} total slots - ${leagueStats.sharedCount} shared member${leagueStats.sharedCount === 1 ? "" : "s"} counted once).`
                          : "."
                      }`}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Slot Hours</Label>
              <Input required type="number" min={0.5} step={0.5} value={f.slotHours} onChange={(e) => set("slotHours", +e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Slot Duration (min)</Label>
              <Input required type="number" min={1} value={f.slotDuration} onChange={(e) => set("slotDuration", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Financial Pricing
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Session Rate (Per Player)</Label>
              <Input required type="number" min={0} step={0.01} value={f.sessionRate} onChange={(e) => set("sessionRate", +e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Hall Rate (Total Cost)</Label>
              <Input required type="number" min={0} step={0.01} value={f.hallRate} onChange={(e) => set("hallRate", +e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
            </div>
            <div className="sm:col-span-2 pt-2 border-t border-white/[0.03] text-xs text-[#8A8A98]">
              Estimated per-player cost: <span className="font-semibold text-[#34D399] font-mono">{fmtMoney(Number(f.sessionRate))}</span> (session rate)
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting} className="btn-premium-solid h-10 px-6 font-semibold cursor-pointer">
            {submitting
              ? "Creating…"
              : Number(f.repeatWeeks) > 1
                ? `Create ${Math.max(1, Math.min(52, Number(f.repeatWeeks) || 1))} schedules`
                : "Create schedule"}
          </Button>
        </div>
      </form>
    </div>
  );
}