import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { parseScheduleDateTime } from "@/lib/format";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Trophy, XCircle, Shield, Swords } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FixtureStatus } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/fixtures/$id/edit")({
  component: EditFixturePage,
});

/** Normalize any incoming date/datetime string into the HTML/picker "YYYY-MM-DDTHH:mm" format without timezone drift. */
function formatToDateTimeLocal(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const str = String(dateStr).trim();
  const match = str.match(/^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2})/);
  if (match) {
    return `${match[1]}T${match[2]}`;
  }
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

const DEFAULT_MATCH_TYPES = ["Friendly", "League", "Tournament", "Practice"];
const DEFAULT_VENUE_TYPES = ["Home", "Away"];
const DEFAULT_GRADES = [
  "A",
  "B",
  "C",
  "D",
  "Beginner",
  "Intermediate",
  "Advanced",
];

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
  const adultGrades = useStore((s) => s.adultGrades);
  const juniorGrades = useStore((s) => s.juniorGrades);
  const updateFixture = useStore((s) => s.updateFixture);
  const fetchFixtureById = useStore((s) => s.fetchFixtureById);

  const lastInitializedFixtureId = useRef<string | null>(null);
  const lastFixtureUpdatedAt = useRef<string | undefined>(undefined);
  const [loading, setLoading] = useState(!fixture);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    result: "" as "Win" | "Loss" | "",
    homeTeamName: "",
    homeTotalMatches: "" as string | number,
    homeTotalGames: "" as string | number,
    homeTotalPoints: "" as string | number,
    visitingTeamName: "",
    visitingTotalMatches: "" as string | number,
    visitingTotalGames: "" as string | number,
    visitingTotalPoints: "" as string | number,
  });

  // Fetch fixture by ID directly to guarantee fresh persisted state (especially on direct navigation or refresh)
  useEffect(() => {
    let isMounted = true;
    if (!fixture && !notFound) {
      setLoading(true);
    }
    fetchFixtureById(id)
      .then((res) => {
        if (!isMounted) return;
        setLoading(false);
        if (!res && !fixture) {
          setNotFound(true);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setLoading(false);
        if (!fixture) {
          setNotFound(true);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [id, fetchFixtureById]);

  // Synchronize form state whenever fixture data becomes available or updates
  useEffect(() => {
    if (!fixture) return;

    const fixtureGroupId =
      fixture.leagueGroupId || (fixture as any).league_group_id || "";
    const fixtureMatchType =
      fixture.matchType || (fixture as any).match_type || "";
    const fixtureVenueType =
      fixture.venueType || (fixture as any).venue_type || "Home";
    const fixtureOppClub =
      fixture.oppositionClub || (fixture as any).opposition_club || "";
    const fixtureTeamName =
      fixture.teamName || (fixture as any).team_name || "";
    const fixtureGrade = fixture.grade || "";
    const fixtureStatus = (fixture.status as FixtureStatus) || "Opened";
    const fixtureName = fixture.name || "";
    const fixtureDate = formatToDateTimeLocal(fixture.date);

    const fixtureResult = (fixture.result as "Win" | "Loss" | undefined) || "";
    const fixtureHomeTeamName = fixture.homeTeamName || fixture.teamName || "";
    const fixtureHomeMatches = fixture.homeTotalMatches ?? "";
    const fixtureHomeGames = fixture.homeTotalGames ?? "";
    const fixtureHomePoints = fixture.homeTotalPoints ?? "";
    const fixtureVisitingTeamName =
      fixture.visitingTeamName || fixture.oppositionClub || "";
    const fixtureVisitingMatches = fixture.visitingTotalMatches ?? "";
    const fixtureVisitingGames = fixture.visitingTotalGames ?? "";
    const fixtureVisitingPoints = fixture.visitingTotalPoints ?? "";

    // Initialize if switching fixtures, or if form was not initialized, or if essential fields were previously empty, or if fixture updated
    const isNewFixture = lastInitializedFixtureId.current !== fixture.id;
    const isMissingData = !f.leagueGroupId && !!fixtureGroupId;
    const isUpdatedFixture =
      Boolean(fixture.updatedAt) &&
      lastFixtureUpdatedAt.current !== fixture.updatedAt;

    if (isNewFixture || isMissingData || isUpdatedFixture) {
      lastInitializedFixtureId.current = fixture.id;
      lastFixtureUpdatedAt.current = fixture.updatedAt;
      setF({
        name: fixtureName,
        date: fixtureDate,
        leagueGroupId: fixtureGroupId,
        matchType: fixtureMatchType,
        venueType: fixtureVenueType,
        oppositionClub: fixtureOppClub,
        teamName: fixtureTeamName,
        grade: fixtureGrade,
        status: fixtureStatus,
        result: fixtureResult,
        homeTeamName: fixtureHomeTeamName,
        homeTotalMatches: fixtureHomeMatches,
        homeTotalGames: fixtureHomeGames,
        homeTotalPoints: fixtureHomePoints,
        visitingTeamName: fixtureVisitingTeamName,
        visitingTotalMatches: fixtureVisitingMatches,
        visitingTotalGames: fixtureVisitingGames,
        visitingTotalPoints: fixtureVisitingPoints,
      });
    }
  }, [fixture, f.leagueGroupId]);

  const memberGroupIds = useMemo(
    () => new Set(leagueGroups.map((g) => g.id)),
    [leagueGroups],
  );

  const availableGroups = useMemo(() => {
    const base = isAdmin ? leagueGroups : leagueGroups.filter((g) => memberGroupIds.has(g.id));
    const targetGroupId =
      f.leagueGroupId ||
      fixture?.leagueGroupId ||
      (fixture as any)?.league_group_id;

    if (targetGroupId && !base.some((g) => g.id === targetGroupId)) {
      const fallbackName =
        fixture?.leagueGroupName ||
        (fixture as any)?.league_group?.name ||
        "Assigned Group";
      const fallbackType = (fixture?.leagueGroupType ||
        (fixture as any)?.league_group?.group_type ||
        "Adult") as "Adult" | "Junior";

      return [
        {
          id: targetGroupId,
          name: fallbackName,
          groupType: fallbackType,
          memberIds: [],
        },
        ...base,
      ];
    }
    return base;
  }, [isAdmin, leagueGroups, memberGroupIds, fixture, f.leagueGroupId]);

  const availableMatchTypes = useMemo(() => {
    const baseList = matchTypes && matchTypes.length > 0 ? matchTypes : DEFAULT_MATCH_TYPES;
    const list = [...baseList];
    const currentVal = f.matchType || fixture?.matchType || (fixture as any)?.match_type;
    if (currentVal && !list.includes(currentVal)) {
      list.unshift(currentVal);
    }
    return Array.from(new Set(list));
  }, [matchTypes, f.matchType, fixture]);

  const availableVenueTypes = useMemo(() => {
    const baseList = venueTypes && venueTypes.length > 0 ? venueTypes : DEFAULT_VENUE_TYPES;
    const list = [...baseList];
    const currentVal = f.venueType || fixture?.venueType || (fixture as any)?.venue_type;
    if (currentVal && !list.includes(currentVal)) {
      list.unshift(currentVal);
    }
    return Array.from(new Set(list));
  }, [venueTypes, f.venueType, fixture]);

  const availableGrades = useMemo(() => {
    let baseList = grades && grades.length > 0 ? grades : [];
    if (baseList.length === 0) {
      if ((adultGrades && adultGrades.length > 0) || (juniorGrades && juniorGrades.length > 0)) {
        baseList = [...(adultGrades || []), ...(juniorGrades || [])];
      } else {
        baseList = DEFAULT_GRADES;
      }
    }
    const list = [...baseList];
    const currentVal = f.grade || fixture?.grade;
    if (currentVal && !list.includes(currentVal)) {
      list.unshift(currentVal);
    }
    return Array.from(new Set(list));
  }, [grades, adultGrades, juniorGrades, f.grade, fixture]);

  const set = useCallback((k: keyof typeof f, v: any) => {
    setF((p) => (p[k] === v ? p : { ...p, [k]: v }));
  }, []);

  if (loading && !fixture) {
    return (
      <div className="p-12 text-center text-[#8A8A98] flex flex-col items-center justify-center space-y-3">
        <div className="animate-spin size-7 rounded-full border-2 border-[#10B981] border-t-transparent" />
        <p className="text-sm">Loading fixture details...</p>
      </div>
    );
  }

  if (!fixture || notFound) {
    return (
      <div className="p-8 text-center text-[#8A8A98]">
        <p>Fixture not found or access denied.</p>
        <Button
          variant="outline"
          className="mt-4 border-white/10 hover:bg-white/5"
          onClick={() => navigate({ to: "/fixtures" })}
        >
          Back to Fixtures
        </Button>
      </div>
    );
  }

  // Authorization check for member (only after groups are loaded and fixture is ready)
  const currentAssignedGroupId = fixture?.leagueGroupId || (fixture as any)?.league_group_id;
  if (!isAdmin && fixture && leagueGroups.length > 0 && currentAssignedGroupId && !memberGroupIds.has(currentAssignedGroupId)) {
    toast.error("You are not authorized to edit this fixture.");
    return <Navigate to="/fixtures" />;
  }

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
        result: f.result ? f.result : null,
        homeTeamName: f.teamName.trim(),
        homeTotalMatches:
          f.homeTotalMatches !== "" && f.homeTotalMatches !== null
            ? Math.max(0, parseInt(String(f.homeTotalMatches), 10) || 0)
            : null,
        homeTotalGames:
          f.homeTotalGames !== "" && f.homeTotalGames !== null
            ? Math.max(0, parseInt(String(f.homeTotalGames), 10) || 0)
            : null,
        homeTotalPoints:
          f.homeTotalPoints !== "" && f.homeTotalPoints !== null
            ? Math.max(0, parseInt(String(f.homeTotalPoints), 10) || 0)
            : null,
        visitingTeamName: f.oppositionClub.trim(),
        visitingTotalMatches:
          f.visitingTotalMatches !== "" && f.visitingTotalMatches !== null
            ? Math.max(0, parseInt(String(f.visitingTotalMatches), 10) || 0)
            : null,
        visitingTotalGames:
          f.visitingTotalGames !== "" && f.visitingTotalGames !== null
            ? Math.max(0, parseInt(String(f.visitingTotalGames), 10) || 0)
            : null,
        visitingTotalPoints:
          f.visitingTotalPoints !== "" && f.visitingTotalPoints !== null
            ? Math.max(0, parseInt(String(f.visitingTotalPoints), 10) || 0)
            : null,
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
                value={f.leagueGroupId || undefined}
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
                value={f.matchType || undefined}
                onValueChange={(val) => set("matchType", val)}
              >
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Match Type" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {availableMatchTypes.map((mt) => (
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
                value={f.venueType || undefined}
                onValueChange={(val) => set("venueType", val)}
              >
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Venue Type" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {availableVenueTypes.map((vt) => (
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
                value={f.grade || undefined}
                onValueChange={(val) => set("grade", val)}
              >
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Grade" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  {availableGrades.map((grade) => (
                    <SelectItem key={grade} value={grade}>
                      {grade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Home / Team Name
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
                Opposition Club / Team Name
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

        {/* Match Result Section */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top overflow-hidden">
          <CardHeader className="pb-3 border-b border-[rgba(255,255,255,0.06)] flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-[12px] font-bold tracking-[0.12em] text-[#34D399] uppercase">
                Match Result
              </CardTitle>
              <p className="text-xs text-[#8FA89F] mt-0.5">
                Record match outcome and team statistics (optional until results are available)
              </p>
            </div>
            {f.result && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set("result", "")}
                className="h-7 px-2.5 text-xs text-[#8FA89F] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-md transition-colors cursor-pointer"
                title="Clear outcome selection"
              >
                Clear Selection
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-4 space-y-5">
            {/* Outcome Radio Buttons */}
            <div className="space-y-2">
              <Label className="text-[11px] font-bold tracking-[0.1em] text-[#8FA89F] uppercase block">
                Match Outcome
              </Label>
              <RadioGroup
                value={f.result}
                onValueChange={(val) => set("result", val as "Win" | "Loss")}
                className="flex flex-wrap items-center gap-3 sm:gap-4"
              >
                <label
                  htmlFor="result-win"
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border cursor-pointer transition-all text-xs sm:text-sm font-semibold select-none",
                    f.result === "Win"
                      ? "bg-[#10B981]/15 border-[#10B981] text-[#10B981] shadow-sm shadow-[#10B981]/20 ring-1 ring-[#10B981]"
                      : "bg-[#1A2120]/50 hover:bg-[#1A2120]/80 border-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.20)] text-[#EEF2F0]",
                  )}
                >
                  <RadioGroupItem
                    value="Win"
                    id="result-win"
                    className="border-[#10B981] text-[#10B981]"
                  />
                  <span className="flex items-center gap-1.5 font-bold">
                    <Trophy className="size-4 text-[#10B981]" /> Win
                  </span>
                </label>

                <label
                  htmlFor="result-loss"
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border cursor-pointer transition-all text-xs sm:text-sm font-semibold select-none",
                    f.result === "Loss"
                      ? "bg-[#EF4444]/15 border-[#EF4444] text-[#EF4444] shadow-sm shadow-[#EF4444]/20 ring-1 ring-[#EF4444]"
                      : "bg-[#1A2120]/50 hover:bg-[#1A2120]/80 border-[rgba(255,255,255,0.10)] hover:border-[rgba(255,255,255,0.20)] text-[#EEF2F0]",
                  )}
                >
                  <RadioGroupItem
                    value="Loss"
                    id="result-loss"
                    className="border-[#EF4444] text-[#EF4444]"
                  />
                  <span className="flex items-center gap-1.5 font-bold">
                    <XCircle className="size-4 text-[#EF4444]" /> Loss
                  </span>
                </label>
              </RadioGroup>
            </div>

            {/* Match Statistics & Scores */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-bold tracking-[0.1em] text-[#8FA89F] uppercase block">
                  Match Statistics & Scores
                </Label>
                <span className="text-[11px] text-[#8FA89F]">
                  Enter final counts for each team
                </span>
              </div>

              {/* Desktop Table View (md and up) */}
              <div className="hidden md:block rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1A2120]/40 overflow-hidden">
                <Table className="w-full">
                  <TableHeader className="bg-[#1A2120]/50 border-b border-[rgba(255,255,255,0.08)]">
                    <TableRow className="hover:bg-transparent border-none">
                      <TableHead className="h-11 px-4 text-[11px] font-bold tracking-wider text-[#8FA89F] uppercase w-[180px]">
                        Team
                      </TableHead>
                      <TableHead className="h-11 px-4 text-[11px] font-bold tracking-wider text-[#8FA89F] uppercase min-w-[200px]">
                        Badminton Club
                      </TableHead>
                      <TableHead className="h-11 px-3 text-center text-[11px] font-bold tracking-wider text-[#8FA89F] uppercase w-[130px]">
                        Total Matches
                      </TableHead>
                      <TableHead className="h-11 px-3 text-center text-[11px] font-bold tracking-wider text-[#8FA89F] uppercase w-[130px]">
                        Total Games
                      </TableHead>
                      <TableHead className="h-11 px-3 text-center text-[11px] font-bold tracking-wider text-[#8FA89F] uppercase w-[130px]">
                        Total Points
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Row 1: Home Team */}
                    <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-white/[0.02] transition-colors">
                      <TableCell className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="size-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[#10B981] shrink-0">
                            <Shield className="size-4" />
                          </div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-[#10B981] border border-emerald-500/20">
                            Home Team
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <Input
                          value={f.teamName}
                          onChange={(e) => set("teamName", e.target.value)}
                          placeholder="Home Team Name"
                          className="bg-[#131916] border border-[rgba(255,255,255,0.12)] hover:border-[rgba(255,255,255,0.22)] focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 text-[#EEF2F0] h-10 text-xs sm:text-sm rounded-lg font-medium shadow-sm transition-all"
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <Input
                          type="number"
                          min="0"
                          value={f.homeTotalMatches ?? ""}
                          onChange={(e) => set("homeTotalMatches", e.target.value)}
                          placeholder="0"
                          className="bg-[#131916] border border-[rgba(255,255,255,0.12)] hover:border-[#10B981]/50 focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 text-[#EEF2F0] h-10 text-sm sm:text-base text-center font-mono font-bold rounded-lg shadow-sm transition-all"
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <Input
                          type="number"
                          min="0"
                          value={f.homeTotalGames ?? ""}
                          onChange={(e) => set("homeTotalGames", e.target.value)}
                          placeholder="0"
                          className="bg-[#131916] border border-[rgba(255,255,255,0.12)] hover:border-[#10B981]/50 focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 text-[#EEF2F0] h-10 text-sm sm:text-base text-center font-mono font-bold rounded-lg shadow-sm transition-all"
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <Input
                          type="number"
                          min="0"
                          value={f.homeTotalPoints ?? ""}
                          onChange={(e) => set("homeTotalPoints", e.target.value)}
                          placeholder="0"
                          className="bg-[#131916] border border-[rgba(255,255,255,0.12)] hover:border-[#10B981]/50 focus:border-[#10B981] focus:ring-2 focus:ring-[#10B981]/20 text-[#EEF2F0] h-10 text-sm sm:text-base text-center font-mono font-bold rounded-lg shadow-sm transition-all"
                        />
                      </TableCell>
                    </TableRow>

                    {/* Row 2: Visiting Team */}
                    <TableRow className="border-none hover:bg-white/[0.02] transition-colors">
                      <TableCell className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="size-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#F59E0B] shrink-0">
                            <Swords className="size-4" />
                          </div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-[#F59E0B] border border-amber-500/20">
                            Visiting Team
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <Input
                          value={f.oppositionClub}
                          onChange={(e) => set("oppositionClub", e.target.value)}
                          placeholder="Opposition Club / Team Name"
                          className="bg-[#131916] border border-[rgba(255,255,255,0.12)] hover:border-[rgba(255,255,255,0.22)] focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/20 text-[#EEF2F0] h-10 text-xs sm:text-sm rounded-lg font-medium shadow-sm transition-all"
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <Input
                          type="number"
                          min="0"
                          value={f.visitingTotalMatches ?? ""}
                          onChange={(e) => set("visitingTotalMatches", e.target.value)}
                          placeholder="0"
                          className="bg-[#131916] border border-[rgba(255,255,255,0.12)] hover:border-[#F59E0B]/50 focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/20 text-[#EEF2F0] h-10 text-sm sm:text-base text-center font-mono font-bold rounded-lg shadow-sm transition-all"
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <Input
                          type="number"
                          min="0"
                          value={f.visitingTotalGames ?? ""}
                          onChange={(e) => set("visitingTotalGames", e.target.value)}
                          placeholder="0"
                          className="bg-[#131916] border border-[rgba(255,255,255,0.12)] hover:border-[#F59E0B]/50 focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/20 text-[#EEF2F0] h-10 text-sm sm:text-base text-center font-mono font-bold rounded-lg shadow-sm transition-all"
                        />
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <Input
                          type="number"
                          min="0"
                          value={f.visitingTotalPoints ?? ""}
                          onChange={(e) => set("visitingTotalPoints", e.target.value)}
                          placeholder="0"
                          className="bg-[#131916] border border-[rgba(255,255,255,0.12)] hover:border-[#F59E0B]/50 focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/20 text-[#EEF2F0] h-10 text-sm sm:text-base text-center font-mono font-bold rounded-lg shadow-sm transition-all"
                        />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card-Based View (under md) */}
              <div className="block md:hidden space-y-3.5">
                {/* Mobile Home Team Card */}
                <div className="p-4 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1A2120]/40 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[#10B981] shrink-0">
                        <Shield className="size-4" />
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-[#10B981] border border-emerald-500/20">
                        Home Team
                      </span>
                    </div>
                    <span className="text-[11px] text-[#8FA89F]">Badminton Club</span>
                  </div>

                  <div>
                    <Label className="text-[10px] font-bold tracking-wider text-[#8FA89F] uppercase block mb-1">
                      Team Name
                    </Label>
                    <Input
                      value={f.teamName}
                      onChange={(e) => set("teamName", e.target.value)}
                      placeholder="Home Team Name"
                      className="bg-[#131916] border border-[rgba(255,255,255,0.12)] focus:border-[#10B981] text-[#EEF2F0] h-10 text-sm rounded-lg font-medium shadow-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] font-bold tracking-wider text-[#8FA89F] uppercase block mb-1.5">
                      Scores
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2.5 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center space-y-1">
                        <span className="text-[10px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                          Matches
                        </span>
                        <Input
                          type="number"
                          min="0"
                          value={f.homeTotalMatches ?? ""}
                          onChange={(e) => set("homeTotalMatches", e.target.value)}
                          placeholder="0"
                          className="bg-transparent border border-[rgba(255,255,255,0.10)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]/30 text-[#EEF2F0] text-center font-mono font-bold text-sm h-9 px-1 rounded-md"
                        />
                      </div>
                      <div className="p-2.5 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center space-y-1">
                        <span className="text-[10px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                          Games
                        </span>
                        <Input
                          type="number"
                          min="0"
                          value={f.homeTotalGames ?? ""}
                          onChange={(e) => set("homeTotalGames", e.target.value)}
                          placeholder="0"
                          className="bg-transparent border border-[rgba(255,255,255,0.10)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]/30 text-[#EEF2F0] text-center font-mono font-bold text-sm h-9 px-1 rounded-md"
                        />
                      </div>
                      <div className="p-2.5 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center space-y-1">
                        <span className="text-[10px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                          Points
                        </span>
                        <Input
                          type="number"
                          min="0"
                          value={f.homeTotalPoints ?? ""}
                          onChange={(e) => set("homeTotalPoints", e.target.value)}
                          placeholder="0"
                          className="bg-transparent border border-[rgba(255,255,255,0.10)] focus:border-[#10B981] focus:ring-1 focus:ring-[#10B981]/30 text-[#EEF2F0] text-center font-mono font-bold text-sm h-9 px-1 rounded-md"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mobile Visiting Team Card */}
                <div className="p-4 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1A2120]/40 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#F59E0B] shrink-0">
                        <Swords className="size-4" />
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-[#F59E0B] border border-amber-500/20">
                        Visiting Team
                      </span>
                    </div>
                    <span className="text-[11px] text-[#8FA89F]">Badminton Club</span>
                  </div>

                  <div>
                    <Label className="text-[10px] font-bold tracking-wider text-[#8FA89F] uppercase block mb-1">
                      Opposition Club / Team
                    </Label>
                    <Input
                      value={f.oppositionClub}
                      onChange={(e) => set("oppositionClub", e.target.value)}
                      placeholder="Opposition Club / Team Name"
                      className="bg-[#131916] border border-[rgba(255,255,255,0.12)] focus:border-[#F59E0B] text-[#EEF2F0] h-10 text-sm rounded-lg font-medium shadow-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] font-bold tracking-wider text-[#8FA89F] uppercase block mb-1.5">
                      Scores
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="p-2.5 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center space-y-1">
                        <span className="text-[10px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                          Matches
                        </span>
                        <Input
                          type="number"
                          min="0"
                          value={f.visitingTotalMatches ?? ""}
                          onChange={(e) => set("visitingTotalMatches", e.target.value)}
                          placeholder="0"
                          className="bg-transparent border border-[rgba(255,255,255,0.10)] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]/30 text-[#EEF2F0] text-center font-mono font-bold text-sm h-9 px-1 rounded-md"
                        />
                      </div>
                      <div className="p-2.5 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center space-y-1">
                        <span className="text-[10px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                          Games
                        </span>
                        <Input
                          type="number"
                          min="0"
                          value={f.visitingTotalGames ?? ""}
                          onChange={(e) => set("visitingTotalGames", e.target.value)}
                          placeholder="0"
                          className="bg-transparent border border-[rgba(255,255,255,0.10)] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]/30 text-[#EEF2F0] text-center font-mono font-bold text-sm h-9 px-1 rounded-md"
                        />
                      </div>
                      <div className="p-2.5 rounded-lg border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center space-y-1">
                        <span className="text-[10px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                          Points
                        </span>
                        <Input
                          type="number"
                          min="0"
                          value={f.visitingTotalPoints ?? ""}
                          onChange={(e) => set("visitingTotalPoints", e.target.value)}
                          placeholder="0"
                          className="bg-transparent border border-[rgba(255,255,255,0.10)] focus:border-[#F59E0B] focus:ring-1 focus:ring-[#F59E0B]/30 text-[#EEF2F0] text-center font-mono font-bold text-sm h-9 px-1 rounded-md"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
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
