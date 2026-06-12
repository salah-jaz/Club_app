import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/schedules/$id/edit")({
  component: EditSchedule,
});

function EditSchedule() {
  const { id } = Route.useParams();
  const s = useStore();
  const sch = s.schedules.find((x) => x.id === id);
  const update = useStore((state) => state.updateSchedule);
  const locations = useStore((state) => state.locations);
  const navigate = useNavigate();

  // Helper to convert date format to datetime-local expected string
  const formatDateTimeLocal = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const tzoffset = date.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(date.getTime() - tzoffset))
      .toISOString()
      .slice(0, 16);
    return localISOTime;
  };

  const [f, setF] = useState({
    name: "",
    date: "",
    courts: 2,
    players: 16,
    slotHours: 2,
    slotDuration: "15 min",
    sessionRate: 8,
    hallRate: 40,
    location: "",
  });

  useEffect(() => {
    if (sch) {
      setF({
        name: sch.name,
        date: formatDateTimeLocal(sch.date),
        courts: sch.courts,
        players: sch.players,
        slotHours: sch.slotHours,
        slotDuration: sch.slotDuration,
        sessionRate: sch.sessionRate,
        hallRate: sch.hallRate,
        location: sch.location,
      });
    }
  }, [sch]);

  if (!sch) return <Navigate to="/schedules" />;

  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Edit ${sch.name}`}
        description="Update court capacity, scheduling details, and pricing."
        backTo={`/schedules/${sch.id}`}
      />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await update(sch.id, f);
            toast.success("Schedule updated successfully");
            navigate({ to: `/schedules/${sch.id}` });
          } catch (error: any) {
            toast.error(error.message || "Failed to update schedule.");
          }
        }}
        className="space-y-6"
      >
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Session Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Session Name</Label>
              <Input
                required
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Friday Night Play"
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Date & Time</Label>
              <Input
                required
                type="datetime-local"
                value={f.date}
                onChange={(e) => set("date", e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Club Location</Label>
              {locations.length > 0 && f.location ? (
                <Select value={f.location} onValueChange={(v) => set("location", v)}>
                  <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                    {locations.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="h-10 bg-[#1A2120] border border-[rgba(255,255,255,0.06)] rounded-lg animate-pulse" />
              )}
            </div>
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
              <Input
                required
                type="number"
                min={1}
                value={f.courts}
                onChange={(e) => set("courts", +e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Max Players</Label>
              <Input
                required
                type="number"
                min={1}
                value={f.players}
                onChange={(e) => set("players", +e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Slot Hours</Label>
              <Input
                required
                type="number"
                min={0.5}
                step={0.5}
                value={f.slotHours}
                onChange={(e) => set("slotHours", +e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Slot Duration</Label>
              <Input
                required
                value={f.slotDuration}
                onChange={(e) => set("slotDuration", e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
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
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Session Rate (Per Player)
              </Label>
              <Input
                required
                type="number"
                min={0}
                step={0.01}
                value={f.sessionRate}
                onChange={(e) => set("sessionRate", +e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Hall Rate (Total Cost)
              </Label>
              <Input
                required
                type="number"
                min={0}
                step={0.01}
                value={f.hallRate}
                onChange={(e) => set("hallRate", +e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono"
              />
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" className="btn-premium-solid h-10 px-6 font-semibold cursor-pointer">
            Update schedule
          </Button>
        </div>
      </form>
    </div>
  );
}
