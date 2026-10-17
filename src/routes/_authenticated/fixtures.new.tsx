import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { parseScheduleDateTime } from "@/lib/format";
import { datetimeLocalNow } from "@/lib/sessionTiming";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FixtureStatus } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/fixtures/new")({
  component: NewFixturePage,
});

function NewFixturePage() {
  const navigate = useNavigate();
  const user = useCurrentUser()!;
  const activeRole = useStore((s) => s.activeRole) || user?.role;
  const isAdmin = activeRole === "admin";
  const leagueGroups = useStore((s) => s.leagueGroups);
  const matchTypes = useStore((s) => s.matchTypes);
  const venueTypes = useStore((s) => s.venueTypes);
  const grades = useStore((s) => s.grades);
  const createFixture = useStore((s) => s.createFixture);

  // If member has no groups, redirect away
  const memberGroupIds = useMemo(
    () => new Set(leagueGroups.map((g) => g.id)),
    [leagueGroups],
  );

  const availableGroups = useMemo(() => {
    if (isAdmin) return leagueGroups;
    return leagueGroups.filter((g) => memberGroupIds.has(g.id));
  }, [isAdmin, leagueGroups, memberGroupIds]);

  const [f, setF] = useState({
    name: "",
    date: "",
    leagueGroupId: availableGroups[0]?.id || "",
    matchType: matchTypes[0] || "",
    venueType: venueTypes[0] || "Home",
    oppositionClub: "",
    teamName: "",
    grade: grades[0] || "",
    status: "Opened" as FixtureStatus,
  });

  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const set = useCallback((k: keyof typeof f, v: any) => {
    setF((p) => (p[k] === v ? p : { ...p, [k]: v }));
  }, []);

  // Sync defaults if options load asynchronously
  useEffect(() => {
    if (!f.leagueGroupId && availableGroups.length > 0) {
      set("leagueGroupId", availableGroups[0].id);
    }
  }, [availableGroups, f.leagueGroupId, set]);

  useEffect(() => {
    if (!f.matchType && matchTypes.length > 0) {
      set("matchType", matchTypes[0]);
    }
  }, [matchTypes, f.matchType, set]);

  useEffect(() => {
    if (!f.venueType && venueTypes.length > 0) {
      set("venueType", venueTypes[0]);
    }
  }, [venueTypes, f.venueType, set]);

  useEffect(() => {
    if (!f.grade && grades.length > 0) {
      set("grade", grades[0]);
    }
  }, [grades, f.grade, set]);

  const minDateTime = datetimeLocalNow();
  const scheduleWhen = useMemo(() => parseScheduleDateTime(f.date), [f.date]);

  const onDateChange = (value: string) => {
    const parsed = parseScheduleDateTime(value);
    setF((p) => ({
      ...p,
      date: value,
      name: !nameTouched && parsed ? parsed.label : p.name,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.date) {
      toast.error("Please select a Date & Time for the fixture.");
      return;
    }
    if (!f.name.trim()) {
      toast.error("Please provide a fixture name.");
      return;
    }
    if (!f.leagueGroupId) {
      toast.error("Please select a group for the fixture.");
      return;
    }
    if (!f.matchType) {
      toast.error("Please select a match type.");
      return;
    }
    if (!f.venueType) {
      toast.error("Please select a venue type.");
      return;
    }
    if (!f.oppositionClub.trim()) {
      toast.error("Please enter the opposition club name.");
      return;
    }
    if (!f.teamName.trim()) {
      toast.error("Please enter your team name.");
      return;
    }
    if (!f.grade) {
      toast.error("Please select a grade.");
      return;
    }

    setSubmitting(true);
    try {
      await createFixture({
        name: f.name.trim(),
        date: f.date,
        leagueGroupId: f.leagueGroupId,
        matchType: f.matchType,
        venueType: f.venueType,
        oppositionClub: f.oppositionClub.trim(),
        teamName: f.teamName.trim(),
        grade: f.grade,
        status: f.status,
      });

      toast.success("Fixture created successfully");
      navigate({ to: "/fixtures" });
    } catch (error: any) {
      toast.error(error.message || "Failed to create fixture.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New fixture"
        description="Schedule a match against an opposition club and set match configurations."
        backTo="/fixtures"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Schedule & Identification
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Date & Time
              </Label>
              <DateTimePicker
                value={f.date}
                onChange={onDateChange}
                minDateTime={minDateTime}
                placeholder="Select Date & Time..."
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
                Fixture Name
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
          </CardContent>
        </Card>

        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Match & Team Details
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 grid sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Group
              </Label>
              <Select
                value={f.leagueGroupId}
                onValueChange={(val) => set("leagueGroupId", val)}
              >
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Group" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {availableGroups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name} ({g.groupType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Match Type
              </Label>
              <Select
                value={f.matchType}
                onValueChange={(val) => set("matchType", val)}
              >
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Match Type" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {matchTypes.map((mt) => (
                    <SelectItem key={mt} value={mt}>
                      {mt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Venue Type
              </Label>
              <Select
                value={f.venueType}
                onValueChange={(val) => set("venueType", val)}
              >
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Venue Type" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {venueTypes.map((vt) => (
                    <SelectItem key={vt} value={vt}>
                      {vt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Grade
              </Label>
              <Select
                value={f.grade}
                onValueChange={(val) => set("grade", val)}
              >
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Grade" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {grades.map((grade) => (
                    <SelectItem key={grade} value={grade}>
                      {grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Team Name
              </Label>
              <Input
                required
                value={f.teamName}
                onChange={(e) => set("teamName", e.target.value)}
                placeholder="e.g. Phoenix Eagles"
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Opposition Club Name
              </Label>
              <Input
                required
                value={f.oppositionClub}
                onChange={(e) => set("oppositionClub", e.target.value)}
                placeholder="e.g. Metro Warriors"
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Status
              </Label>
              <Select
                value={f.status}
                onValueChange={(val: FixtureStatus) => set("status", val)}
              >
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="Opened">Opened</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="border-white/10 hover:bg-white/5"
            onClick={() => navigate({ to: "/fixtures" })}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="btn-premium-solid px-6"
            disabled={submitting}
          >
            {submitting ? "Creating..." : "Create Fixture"}
          </Button>
        </div>
      </form>
    </div>
  );
}
