import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/schedules/new")({ component: NewSchedule });

function NewSchedule() {
  const create = useStore((s) => s.createSchedule);
  const locations = useStore((s) => s.locations);
  const leagueGroups = useStore((s) => s.leagueGroups || []);
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "", date: "", courts: 2, players: 16, slotHours: 2, slotDuration: "15 min",
    sessionRate: 8, hallRate: 40, location: locations[0],
    isLeagueMatch: false, leagueGroupIds: [] as string[],
  });
  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <PageHeader title="New play schedule" description="Define the court capacity, scheduling details, and membership pricing." backTo="/schedules" />
      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          await create(f);
          toast.success("Schedule created");
          navigate({ to: "/schedules" });
        } catch (error: any) {
          toast.error(error.message || "Failed to create schedule.");
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
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Session Name</Label>
              <Input required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Friday Night Play" className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Date & Time</Label>
              <Input required type="datetime-local" value={f.date} onChange={(e) => set("date", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
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
              <Switch checked={f.isLeagueMatch} onCheckedChange={(v) => set("isLeagueMatch", v)} className="data-[state=checked]:bg-[#10B981]" />
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
              Estimated per-player cost: <span className="font-semibold text-[#34D399] font-mono">${(f.sessionRate + (f.hallRate / Math.max(f.players, 1))).toFixed(2)}</span> (calculated as Session Rate + Hall Rate / Max Players)
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Button type="submit" className="btn-premium-solid h-10 px-6 font-semibold cursor-pointer">Create schedule</Button>
        </div>
      </form>
    </div>
  );
}