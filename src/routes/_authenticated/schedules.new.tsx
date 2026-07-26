import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { fmtMoney, parseScheduleDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";

import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/schedules/new")({ component: NewSchedule });

function NewSchedule() {
  const holidays = useStore((s) => s.holidays);
  const create = useStore((s) => s.createSchedule);
  const locations = useStore((s) => s.locations);
  const leagueGroups = useStore((s) => s.leagueGroups || []);
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "", date: "", courts: 2, players: 16, slotHours: 2, slotDuration: "15 min",
    sessionRate: 8, hallRate: 40, location: locations[0],
    isLeagueMatch: false, leagueGroupIds: [] as string[],
    repeatWeeks: 1,
  });
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));

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
                <Label className="text-[11px] font-medium text-[#F1F0EE]">Enable League Match</Label>
                <p className="text-xs text-muted-foreground">Limit invitations to specific league groups</p>
              </div>
              <Switch checked={f.isLeagueMatch} onCheckedChange={(v) => set("isLeagueMatch", v)} />
            </div>

            {f.isLeagueMatch && (
              <div className="space-y-2">
                <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Select League Groups</Label>
                {leagueGroups.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No league groups found. Create one in the League Groups module.</p>
                ) : (
                  <div className="grid sm:grid-cols-3 gap-2">
                    {leagueGroups.map((g) => (
                      <label
                        key={g.id}
                        className={`flex items-center gap-2.5 p-2.5 bg-[#1A2120] border rounded-lg cursor-pointer transition-all ${
                          f.leagueGroupIds.includes(g.id)
                            ? "border-[#10B981] bg-[#1A2120]/80"
                            : "border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
                        }`}
                      >
                        <Checkbox
                          checked={f.leagueGroupIds.includes(g.id)}
                          onCheckedChange={(checked) => {
                            const next = checked
                              ? [...f.leagueGroupIds, g.id]
                              : f.leagueGroupIds.filter((id) => id !== g.id);
                            set("leagueGroupIds", next);
                          }}
                          className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981]"
                        />
                        <span className="text-xs text-[#F1F0EE] truncate">{g.name}</span>
                      </label>
                    ))}
                  </div>
                )}
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
              <Input required type="number" min={1} value={f.players} onChange={(e) => set("players", +e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Slot Hours</Label>
              <Input required type="number" min={0.5} step={0.5} value={f.slotHours} onChange={(e) => set("slotHours", +e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Slot Duration</Label>
              <Input required value={f.slotDuration} onChange={(e) => set("slotDuration", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
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