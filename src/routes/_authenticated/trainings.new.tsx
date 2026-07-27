import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMemo, useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { parseScheduleDateTime } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/trainings/new")({ component: NewTraining });

function NewTraining() {
  const create = useStore((s) => s.createTraining);
  const locations = useStore((s) => s.locations);
  const coaches = useStore((s) => s.coaches);
  const navigate = useNavigate();

  const [f, setF] = useState({
    name: "",
    startDate: "",
    endDate: "",
    repeatWeeks: 3,
    repeatMonths: 1,
    slots: 12,
    duration: "1 hour",
    fees: 120,
    coach: coaches[0] || "Coach Lee",
    location: locations[0] || "",
    targetType: "junior" as "adult" | "junior",
  });

  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!f.coach && coaches.length > 0) {
      setF((p) => ({ ...p, coach: coaches[0] }));
    }
  }, [coaches, f.coach]);

  useEffect(() => {
    if (!f.location && locations.length > 0) {
      setF((p) => ({ ...p, location: locations[0] }));
    }
  }, [locations, f.location]);

  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));

  const scheduleWhen = useMemo(() => parseScheduleDateTime(f.startDate), [f.startDate]);

  const repeatPreview = useMemo(() => {
    const weeks = Math.max(1, Math.min(52, Number(f.repeatWeeks) || 1));
    const months = Math.max(1, Math.min(24, Number(f.repeatMonths) || 1));
    if (!f.startDate) return null;
    const start = new Date(f.startDate);
    if (Number.isNaN(start.getTime())) return null;

    const dates: Date[] = [];
    for (let m = 0; m < months; m++) {
      for (let w = 0; w < weeks; w++) {
        const d = new Date(start);
        d.setDate(d.getDate() + (m * 4 + w) * 7);
        dates.push(d);
      }
    }

    const lastSession = dates[dates.length - 1];
    const endIso = `${lastSession.getFullYear()}-${String(lastSession.getMonth() + 1).padStart(2, "0")}-${String(lastSession.getDate()).padStart(2, "0")}`;
    const endLabel = parseScheduleDateTime(`${endIso}T${String(lastSession.getHours()).padStart(2, "0")}:${String(lastSession.getMinutes()).padStart(2, "0")}`);

    return {
      weeks,
      months,
      totalSessions: dates.length,
      endDate: endLabel?.date ?? lastSession.toLocaleDateString(),
      endIso,
    };
  }, [f.startDate, f.repeatWeeks, f.repeatMonths]);

  const onDateChange = (value: string) => {
    const parsed = parseScheduleDateTime(value);
    setF((p) => ({
      ...p,
      startDate: value,
      name: !nameTouched && parsed ? parsed.label : p.name,
    }));
  };

  return (
    <div className="space-y-6">
      <PageHeader title="New training program" description="Set up a weekly coaching program." backTo="/trainings" />
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!f.targetType) {
          toast.error("Please select Training For (Adult or Junior).");
          return;
        }
        setSubmitting(true);
        try {
          const totalSessions = Math.max(1, Number(f.repeatWeeks) || 1) * Math.max(1, Number(f.repeatMonths) || 1);
          const computedEndDate = repeatPreview?.endIso || f.endDate || f.startDate.split("T")[0];

          const payload = {
            name: f.name,
            startDate: f.startDate,
            endDate: computedEndDate,
            repeatWeeks: Math.max(1, Math.min(52, Number(f.repeatWeeks) || 1)),
            repeatMonths: Math.max(1, Math.min(24, Number(f.repeatMonths) || 1)),
            sessions: totalSessions,
            slots: f.slots,
            duration: f.duration,
            fees: f.fees,
            coach: f.coach,
            location: f.location,
            targetType: f.targetType,
          };

          await create(payload as any);
          toast.success("Training program created successfully");
          navigate({ to: "/trainings" });
        } catch (error: any) {
          toast.error(error.message || "Failed to create training.");
        } finally {
          setSubmitting(false);
        }
      }} className="space-y-6">
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Program Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Start Date &amp; Time</Label>
              <Input
                required
                type="datetime-local"
                value={f.startDate}
                onChange={(e) => onDateChange(e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg w-full min-w-0 font-mono"
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
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Program Name</Label>
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
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Repeat for Weeks</Label>
              <Input
                required
                type="number"
                min={1}
                max={52}
                value={f.repeatWeeks}
                onChange={(e) => set("repeatWeeks", Math.max(1, Math.min(52, +e.target.value || 1)))}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
              />
              <p className="text-[11px] text-[#8A8A98]">Number of weekly sessions to create per month.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Repeat for Months</Label>
              <Input
                required
                type="number"
                min={1}
                max={24}
                value={f.repeatMonths}
                onChange={(e) => set("repeatMonths", Math.max(1, Math.min(24, +e.target.value || 1)))}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
              />
              <p className="text-[11px] text-[#8A8A98]">
                {repeatPreview
                  ? `Creates ${repeatPreview.totalSessions} total sessions (${repeatPreview.weeks} per month) through ${repeatPreview.endDate}.`
                  : "Defines how many months the training program should repeat."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Maximum Slots (Capacity)</Label>
              <Input required type="number" min={1} value={f.slots} onChange={(e) => set("slots", +e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Session Duration</Label>
              <Input required value={f.duration} onChange={(e) => set("duration", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Training Fees</Label>
              <Input required type="number" min={0} step={0.01} value={f.fees} onChange={(e) => set("fees", +e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Training For <span className="text-[#EF4444]">*</span>
              </Label>
              <Select value={f.targetType} onValueChange={(v: "adult" | "junior") => set("targetType", v)}>
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Target Type" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="adult">Adult</SelectItem>
                  <SelectItem value="junior">Junior</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Coach Name</Label>
              <Select value={f.coach} onValueChange={(v) => set("coach", v)}>
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Coach" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {(coaches.length > 0 ? coaches : ["Coach Lee"]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Location</Label>
              <Select value={f.location} onValueChange={(v) => set("location", v)}>
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">{locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" disabled={submitting} className="btn-premium-solid h-10 px-6 font-semibold cursor-pointer">
            {submitting ? "Creating…" : "Create program"}
          </Button>
        </div>
      </form>
    </div>
  );
}