import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useMemo, useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { parseScheduleDateTime } from "@/lib/format";
import { datetimeLocalNow, isScheduleDateTimeInPast } from "@/lib/sessionTiming";
import { generateTrainingProgramDates } from "@/lib/rotation";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTimePicker } from "@/components/ui/date-time-picker";
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
import { Switch } from "@/components/ui/switch";
import { LeagueGroupSelector } from "@/components/LeagueGroupSelector";

export const Route = createFileRoute("/_authenticated/trainings/$id/edit")({
  component: EditTraining,
});

const toDatetimeLocal = (s?: string) => {
  if (!s) return "";
  if (s.includes("T")) return s.slice(0, 16);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function EditTraining() {
  const { id } = Route.useParams();
  const s = useStore();
  const tr = s.trainings.find((x) => x.id === id);
  const update = useStore((state) => state.updateTraining);
  const locations = useStore((state) => state.locations);
  const coaches = useStore((state) => state.coaches);
  const leagueGroups = useStore((state) => state.leagueGroups);
  const allMembers = useStore((state) => state.members);
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
    targetType: (tr?.targetType || "junior") as "adult" | "junior",
    isGroupTraining: tr?.isGroupTraining || false,
    leagueGroupIds: tr?.leagueGroupIds || ([] as string[]),
  });

  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dialogState, setDialogState] = useState<{ open: boolean; message: string } | null>(null);

  useEffect(() => {
    if (tr) {
      setF({
        name: tr.name,
        startDate: toDatetimeLocal(tr.startDate),
        endDate: tr.endDate,
        repeatWeeks: tr.repeatWeeks ?? 3,
        repeatMonths: tr.repeatMonths ?? 1,
        slots: tr.slots,
        duration: tr.duration,
        fees: tr.fees,
        coach: tr.coach || coaches[0] || "Coach Lee",
        location: tr.location || locations[0] || "",
        targetType: tr.targetType || "junior",
        isGroupTraining: tr.isGroupTraining || false,
        leagueGroupIds: tr.leagueGroupIds || [],
      });
      setNameTouched(true);
    }
  }, [tr, coaches, locations]);

  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));

  const minDateTime = datetimeLocalNow();

  const scheduleWhen = useMemo(() => parseScheduleDateTime(f.startDate), [f.startDate]);

  const targetLeagueGroups = useMemo(() => {
    return leagueGroups.filter((g) => g.groupType?.toLowerCase() === f.targetType);
  }, [leagueGroups, f.targetType]);

  const leagueStats = useMemo(() => {
    if (!f.isGroupTraining || !f.leagueGroupIds?.length)
      return { uniqueCount: 0, totalSlots: 0, sharedCount: 0 };
    const memberCounts = new Map<string, number>();
    let totalSlots = 0;
    for (const group of targetLeagueGroups) {
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
    return { uniqueCount: memberCounts.size, totalSlots, sharedCount };
  }, [f.isGroupTraining, f.leagueGroupIds, targetLeagueGroups]);

  const leagueUniqueMemberCount = leagueStats.uniqueCount;

  const repeatPreview = useMemo(() => {
    const weeks = Number(f.repeatWeeks);
    const months = Math.max(1, Math.min(24, Number(f.repeatMonths) || 1));
    if (!f.startDate || isNaN(weeks) || weeks < 1 || weeks > 5) return null;
    const start = new Date(f.startDate);
    if (Number.isNaN(start.getTime())) return null;

    const isoDates = generateTrainingProgramDates(f.startDate, weeks, months);
    if (isoDates.length === 0) return null;

    const dates = isoDates.map(
      (iso: string) => new Date(`${iso}T${f.startDate.split("T")[1] || "00:00"}`),
    );
    const lastSession = dates[dates.length - 1];
    const endIso = `${lastSession.getFullYear()}-${String(lastSession.getMonth() + 1).padStart(2, "0")}-${String(lastSession.getDate()).padStart(2, "0")}`;
    const endLabel = parseScheduleDateTime(
      `${endIso}T${String(lastSession.getHours()).padStart(2, "0")}:${String(lastSession.getMinutes()).padStart(2, "0")}`,
    );

    return {
      weeks,
      months,
      totalSessions: dates.length,
      endDate: endLabel?.date ?? lastSession.toLocaleDateString(),
      endIso,
    };
  }, [f.startDate, f.repeatWeeks, f.repeatMonths]);

  if (!tr) return <Navigate to="/trainings" />;

  const onDateChange = (value: string) => {
    const parsed = parseScheduleDateTime(value);
    setF((p) => ({
      ...p,
      startDate: value,
      name: parsed ? parsed.label : p.name,
    }));
    setNameTouched(false);
  };

  const executeSave = async () => {
    const weeks = Number(f.repeatWeeks);
    if (isNaN(weeks) || weeks < 1 || weeks > 5) {
      toast.error(
        "Repeat for Weeks cannot be greater than 5. Please select a value between 1 and 5.",
      );
      return;
    }
    if (isScheduleDateTimeInPast(f.startDate)) {
      toast.error("Schedule date and time must be today or later.");
      return;
    }
    setSubmitting(true);
    try {
      const totalSessions =
        repeatPreview?.totalSessions || weeks * Math.max(1, Number(f.repeatMonths) || 1);
      const computedEndDate = repeatPreview?.endIso || f.endDate || f.startDate.split("T")[0];

      const payload = {
        name: f.name,
        startDate: f.startDate,
        endDate: computedEndDate,
        repeatWeeks: weeks,
        repeatMonths: Math.max(1, Math.min(24, Number(f.repeatMonths) || 1)),
        sessions: totalSessions,
        slots: f.isGroupTraining ? leagueUniqueMemberCount : f.slots,
        duration: f.duration,
        fees: f.fees,
        coach: f.coach,
        location: f.location,
        targetType: f.targetType,
        isGroupTraining: f.isGroupTraining,
        leagueGroupIds: f.leagueGroupIds,
      };

      await update(tr.id, payload as any);
      toast.success("Training program updated successfully");
      navigate({ to: "/trainings" });
    } catch (error: any) {
      toast.error(error.message || "Failed to update training.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newWeeks = Number(f.repeatWeeks);
    if (isNaN(newWeeks) || newWeeks < 1 || newWeeks > 5) {
      toast.error(
        "Repeat for Weeks cannot be greater than 5. Please select a value between 1 and 5.",
      );
      return;
    }
    if (!f.targetType) {
      toast.error("Please select Training For (Adult or Junior).");
      return;
    }
    if (f.isGroupTraining && f.leagueGroupIds.length === 0) {
      toast.error("Please select at least one group for the training.");
      return;
    }

    const initialWeeks = tr.repeatWeeks ?? 3;
    const initialMonths = tr.repeatMonths ?? 1;
    const newMonths = Math.max(1, Math.min(24, Number(f.repeatMonths) || 1));

    if (newWeeks !== initialWeeks) {
      const diff = newWeeks - initialWeeks;
      let message = "";
      if (diff < 0) {
        message = `This training currently has ${initialWeeks} sessions per month. Changing it to ${newWeeks} will remove extra sessions for each month. Do you want to continue?`;
      } else {
        message = `This training currently has ${initialWeeks} sessions per month. Changing it to ${newWeeks} will generate additional available sessions for each month. Do you want to continue?`;
      }
      setDialogState({ open: true, message });
    } else if (newMonths !== initialMonths) {
      const diffM = newMonths - initialMonths;
      let message = "";
      if (diffM < 0) {
        const removeCount = Math.abs(diffM);
        message = `This training currently has ${initialMonths} remaining monthly session${initialMonths === 1 ? "" : "s"}. Changing it to ${newMonths} will remove ${removeCount} future month${removeCount === 1 ? "" : "s"} of sessions. Do you want to continue?`;
      } else {
        const addCount = diffM;
        message = `This training currently has ${initialMonths} remaining monthly session${initialMonths === 1 ? "" : "s"}. Changing it to ${newMonths} will create ${addCount} additional future month${addCount === 1 ? "" : "s"} of sessions. Do you want to continue?`;
      }
      setDialogState({ open: true, message });
    } else {
      executeSave();
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${tr.name}`}
        description="Update coaching program details, session duration, and fees."
        backTo="/trainings"
      />

      <AlertDialog
        open={!!dialogState?.open}
        onOpenChange={(open) => !open && setDialogState(null)}
      >
        <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.1)] text-[#F1F0EE]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#F1F0EE]">
              Confirm Training Program Changes
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#8A8A98]">
              {dialogState?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-[rgba(255,255,255,0.1)] text-[#F1F0EE] hover:bg-white/5 cursor-pointer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeSave}
              className="bg-[#10B981] hover:bg-[#059669] text-white font-medium cursor-pointer"
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Program Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Start Date & Time
              </Label>
              <DateTimePicker
                value={f.startDate}
                onChange={onDateChange}
                minDateTime={minDateTime}
                placeholder="Select Start Date & Time..."
              />
              {scheduleWhen && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/60 px-3 py-2">
                    <p className="text-[9px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                      Day
                    </p>
                    <p className="text-[13px] font-semibold text-[#F1F0EE] mt-0.5">
                      {scheduleWhen.day}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/60 px-3 py-2">
                    <p className="text-[9px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                      Date
                    </p>
                    <p className="text-[13px] font-semibold text-[#F1F0EE] mt-0.5">
                      {scheduleWhen.date}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#0C0F0E]/60 px-3 py-2">
                    <p className="text-[9px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                      Time
                    </p>
                    <p className="text-[13px] font-semibold text-[#F1F0EE] mt-0.5">
                      {scheduleWhen.time}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Program Name
              </Label>
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
                <p className="text-[11px] text-[#8A8A98]">
                  Auto-filled from the selected date &amp; time. Edit anytime.
                </p>
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
                max={5}
                value={f.repeatWeeks}
                onChange={(e) =>
                  set("repeatWeeks", e.target.value === "" ? "" : Number(e.target.value))
                }
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
              />
              <p className="text-[11px] text-[#8A8A98]">
                Number of weekly sessions to create per month (1–5).
              </p>
              {Number(f.repeatWeeks) > 5 && (
                <p className="text-[11px] text-[#EF4444] font-medium">
                  Repeat for Weeks cannot be greater than 5. Please select a value between 1 and 5.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Repeat for Months
              </Label>
              <Input
                required
                type="number"
                min={1}
                max={24}
                value={f.repeatMonths}
                onChange={(e) =>
                  set("repeatMonths", Math.max(1, Math.min(24, +e.target.value || 1)))
                }
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
              />
              <p className="text-[11px] text-[#8A8A98]">
                {repeatPreview
                  ? `Creates ${repeatPreview.totalSessions} total sessions (up to ${repeatPreview.weeks} per month) through ${repeatPreview.endDate}.`
                  : "Defines how many months the training program should repeat."}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Maximum Slots (Capacity)
              </Label>
              <Input
                required
                type="number"
                min={f.isGroupTraining ? 0 : 1}
                value={f.isGroupTraining ? leagueUniqueMemberCount : f.slots}
                onChange={(e) => set("slots", +e.target.value)}
                readOnly={f.isGroupTraining}
                className={`bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono ${f.isGroupTraining ? "opacity-75 cursor-not-allowed bg-[#131916]" : ""}`}
              />
              {f.isGroupTraining && (
                <p className="text-[11px] text-[#34D399] leading-relaxed">
                  {f.leagueGroupIds.length === 0
                    ? "Select groups below to calculate max slots."
                    : `Dynamic: ${leagueStats.uniqueCount} unique player${leagueStats.uniqueCount === 1 ? "" : "s"} across ${f.leagueGroupIds.length} selected group${f.leagueGroupIds.length === 1 ? "" : "s"}${
                        leagueStats.sharedCount > 0
                          ? ` (${leagueStats.totalSlots} total slots - ${leagueStats.sharedCount} shared member${leagueStats.sharedCount === 1 ? "" : "s"} counted once).`
                          : "."
                      }`}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Session Duration
              </Label>
              <Input
                required
                value={f.duration}
                onChange={(e) => set("duration", e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Training Fees
              </Label>
              <Input
                required
                type="number"
                min={0}
                step={0.01}
                value={f.fees}
                onChange={(e) => set("fees", +e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Training For <span className="text-[#EF4444]">*</span>
              </Label>
              <Select
                value={f.targetType}
                onValueChange={(v: "adult" | "junior") => {
                  setF((p) => ({ ...p, targetType: v, leagueGroupIds: [] })); // Reset group selections on type change
                }}
              >
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
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Coach Name
              </Label>
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
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Location
              </Label>
              <Select value={f.location} onValueChange={(v) => set("location", v)}>
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Location" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {locations.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Group Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
              <div>
                <Label className="text-[11px] font-medium text-[#F1F0EE]">
                  Enable Group Selection
                </Label>
                <p className="text-xs text-muted-foreground">
                  Automatically enroll members from selected {f.targetType} groups
                </p>
              </div>
              <Switch
                checked={f.isGroupTraining}
                onCheckedChange={(v) => set("isGroupTraining", v)}
              />
            </div>

            {f.isGroupTraining && (
              <div className="pt-2">
                <LeagueGroupSelector
                  selectedGroupIds={f.leagueGroupIds}
                  onSelectionChange={(nextIds) => set("leagueGroupIds", nextIds)}
                  leagueGroups={targetLeagueGroups}
                  allMembers={allMembers}
                />
              </div>
            )}
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={submitting}
            className="btn-premium-solid h-10 px-6 font-semibold cursor-pointer"
          >
            {submitting ? "Updating…" : "Update program"}
          </Button>
        </div>
      </form>
    </div>
  );
}
