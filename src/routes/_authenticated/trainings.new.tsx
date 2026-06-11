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

export const Route = createFileRoute("/_authenticated/trainings/new")({ component: NewTraining });

function NewTraining() {
  const create = useStore((s) => s.createTraining);
  const locations = useStore((s) => s.locations);
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "", startDate: "", endDate: "", sessions: 8, slots: 12,
    duration: "1 hour", fees: 120, coach: "Coach Lee", location: locations[0],
  });
  const set = (k: keyof typeof f, v: any) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <PageHeader title="New training program" description="Set up a weekly coaching program for juniors." backTo="/trainings" />
      <form onSubmit={async (e) => {
        e.preventDefault();
        try {
          await create(f);
          toast.success("Training created");
          navigate({ to: "/trainings" });
        } catch (error: any) {
          toast.error(error.message || "Failed to create training.");
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
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Program Name</Label>
              <Input required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Spring Term 2026" className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Start Date</Label>
              <Input required type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">End Date</Label>
              <Input required type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Weekly Sessions</Label>
              <Input required type="number" min={1} value={f.sessions} onChange={(e) => set("sessions", +e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
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
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Program Fees</Label>
              <Input required type="number" min={0} step={0.01} value={f.fees} onChange={(e) => set("fees", +e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Coach Name</Label>
              <Input required value={f.coach} onChange={(e) => set("coach", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
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
          <Button type="submit" className="btn-premium-solid h-10 px-6 font-semibold cursor-pointer">Create program</Button>
        </div>
      </form>
    </div>
  );
}