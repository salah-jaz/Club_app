import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Member } from "@/lib/types";
import { useStore } from "@/lib/store";

export type MemberFormValues = Omit<Member, "id" | "credit"> & { credit?: number };

export function MemberForm({
  initial, onSubmit, submitLabel = "Save member",
}: { initial: MemberFormValues; onSubmit: (v: MemberFormValues) => void; submitLabel?: string }) {
  const grades = useStore((s) => s.grades);
  const [v, setV] = useState(initial);
  const set = <K extends keyof MemberFormValues>(k: K, val: MemberFormValues[K]) =>
    setV((p) => ({ ...p, [k]: val }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(v); }} className="space-y-6">
      <Card className="signature-card-top bg-[#131916] border-[rgba(255,255,255,0.06)]">
        <CardHeader>
          <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
            Personal information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">First name</Label>
            <Input required value={v.firstName} onChange={(e) => set("firstName", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Last name</Label>
            <Input required value={v.lastName} onChange={(e) => set("lastName", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Date of birth</Label>
            <Input required type="date" value={v.dob} onChange={(e) => set("dob", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Email</Label>
            <Input required type="email" value={v.email} onChange={(e) => set("email", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Sex</Label>
            <Select value={v.sex} onValueChange={(x) => set("sex", x as any)}>
              <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="signature-card-top bg-[#131916] border-[rgba(255,255,255,0.06)]">
        <CardHeader>
          <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
            Membership
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Member type</Label>
            <Select value={v.memberType} onValueChange={(x) => set("memberType", x as any)}>
              <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                <SelectItem value="adult">Adult</SelectItem>
                <SelectItem value="junior">Junior</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Grade</Label>
            <Select value={v.grade} onValueChange={(x) => set("grade", x)}>
              <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg"><SelectValue placeholder="Select grade" /></SelectTrigger>
              <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                {grades.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">BI Member ID</Label>
            <Input value={v.biMemberId} onChange={(e) => set("biMemberId", e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Status</Label>
            <Select value={v.status} onValueChange={(x) => set("status", x as any)}>
              <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
            <div>
              <Label className="text-[11px] font-medium text-[#F1F0EE]">Club membership</Label>
              <p className="text-xs text-[#8A8A98] font-light">Paid yearly fee</p>
            </div>
            <Switch checked={v.membership} onCheckedChange={(x) => set("membership", x)} className="data-[state=checked]:bg-[#10B981]" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/50 p-3">
            <div>
              <Label className="text-[11px] font-medium text-[#F1F0EE]">League participant</Label>
              <p className="text-xs text-[#8A8A98] font-light">Plays competitively</p>
            </div>
            <Switch checked={v.league} onCheckedChange={(x) => set("league", x)} className="data-[state=checked]:bg-[#10B981]" />
          </div>
        </CardContent>
      </Card>
      <div className="flex gap-2 justify-end">
        <Button type="submit" className="btn-premium-solid h-10 px-6 font-semibold cursor-pointer">{submitLabel}</Button>
      </div>
    </form>
  );
}