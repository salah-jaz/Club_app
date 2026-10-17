import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
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

export const Route = createFileRoute("/_authenticated/fixtures/$id/edit")({
  component: EditFixturePage,
});

function EditFixturePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const user = useCurrentUser()!;
  const activeRole = useStore((s) => s.activeRole) || user?.role;
  const isAdmin = activeRole === "admin";
  const fixture = useStore((s) => s.fixtures.find((x) => x.id === id));
  const leagueGroups = useStore((s) => s.leagueGroups);
  const matchTypes = useStore((s) => s.matchTypes);
  const venueTypes = useStore((s) => s.venueTypes);
  const grades = useStore((s) => s.grades);
  const updateFixture = useStore((s) => s.updateFixture);

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
    leagueGroupId: "",
    matchType: "",
    venueType: "Home",
    oppositionClub: "",
    teamName: "",
    grade: "",
    status: "Opened" as FixtureStatus,
  });

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (fixture) {
      setF({
        name: fixture.name,
        date: fixture.date,
        leagueGroupId: fixture.leagueGroupId,
        matchType: fixture.matchType,
        venueType: fixture.venueType,
        oppositionClub: fixture.oppositionClub,
        teamName: fixture.teamName,
        grade: fixture.grade,
        status: fixture.status,
      });
    }
  }, [fixture]);

  const set = useCallback((k: keyof typeof f, v: any) => {
    setF((p) => (p[k] === v ? p : { ...p, [k]: v }));
  }, []);

  if (!fixture) {
    return (
      <div className="p-8 text-center text-[#8A8A98]">
        <p>Fixture not found or still loading...</p>
        <Button
          variant="outline"
          className="mt-4 border-white/10"
          onClick={() => navigate({ to: "/fixtures" })}
        >
          Back to Fixtures
        </Button>
      </div>
    );
  }

  // Authorization check for member
  if (!isAdmin && !memberGroupIds.has(fixture.leagueGroupId)) {
    toast.error("You are not authorized to edit this fixture.");
    return <Navigate to="/fixtures" />;
  }

  const minDateTime = datetimeLocalNow();
  const scheduleWhen = parseScheduleDateTime(f.date);

  const onDateChange = (value: string) => {
    setF((p) => ({
      ...p,
      date: value,
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
      await updateFixture(id, {
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

      toast.success("Fixture updated successfully");
      navigate({ to: "/fixtures" });
    } catch (error: any) {
      toast.error(error.message || "Failed to update fixture.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Edit fixture"
        description={`Update match details and timing for ${fixture.name}`}
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
                onChange={(e) => set("name", e.target.value)}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
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
            {submitting ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
