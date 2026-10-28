import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Mail, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FixtureStatus } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/fixtures/new")({
  component: NewFixturePage,
});

export function validateCaptainEmails(
  emails: string,
  fieldName: string,
): { valid: boolean; error?: string; normalized: string } {
  if (!emails || !emails.trim()) {
    return { valid: true, normalized: "" };
  }
  if (emails.includes(";")) {
    return {
      valid: false,
      error: `${fieldName} must use comma-separated email addresses only. Semicolons and other separators are not allowed.`,
      normalized: "",
    };
  }
  const parts = emails.split(",");
  const validList: string[] = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) {
      return {
        valid: false,
        error: `${fieldName} contains empty email entries between commas.`,
        normalized: "",
      };
    }
    if (!emailRegex.test(trimmed)) {
      return {
        valid: false,
        error: `${fieldName} contains an invalid email address: "${trimmed}".`,
        normalized: "",
      };
    }
    validList.push(trimmed);
  }
  return { valid: true, normalized: validList.join(", ") };
}

function NewFixturePage() {
  const navigate = useNavigate();
  const user = useCurrentUser()!;
  const activeRole = useStore((s) => s.activeRole) || user?.role;
  const isAdmin = activeRole === "admin";
  const leagueGroups = useStore((s) => s.leagueGroups);
  const locations = useStore((s) => s.locations) || [];
  const matchTypes = useStore((s) => s.matchTypes);
  const venueTypes = useStore((s) => s.venueTypes);
  const grades = useStore((s) => s.grades);
  const adultGrades = useStore((s) => s.adultGrades);
  const juniorGrades = useStore((s) => s.juniorGrades);
  const createFixture = useStore((s) => s.createFixture);
  const sendFixtureMail = useStore((s) => s.sendFixtureMail);
  const emailTemplates = useStore((s) => s.emailTemplates);

  // If member has no groups, redirect away
  const memberGroupIds = useMemo(
    () => new Set(leagueGroups.map((g) => g.id)),
    [leagueGroups],
  );

  const availableGroups = useMemo(() => {
    if (isAdmin) return leagueGroups;
    return leagueGroups.filter((g) => memberGroupIds.has(g.id));
  }, [isAdmin, leagueGroups, memberGroupIds]);

  const availableMatchTypes = useMemo(() => {
    return matchTypes && matchTypes.length > 0
      ? matchTypes
      : ["Friendly", "League", "Tournament", "Practice"];
  }, [matchTypes]);

  const availableVenueTypes = useMemo(() => {
    return venueTypes && venueTypes.length > 0 ? venueTypes : ["Home", "Away"];
  }, [venueTypes]);

  const availableGrades = useMemo(() => {
    if (grades && grades.length > 0) return grades;
    if ((adultGrades && adultGrades.length > 0) || (juniorGrades && juniorGrades.length > 0)) {
      return [...(adultGrades || []), ...(juniorGrades || [])];
    }
    return ["A", "B", "C", "D", "Beginner", "Intermediate", "Advanced"];
  }, [grades, adultGrades, juniorGrades]);

  const [f, setF] = useState({
    name: "",
    date: "",
    leagueGroupId: availableGroups[0]?.id || "",
    matchType: availableMatchTypes[0] || "",
    venueType: availableVenueTypes[0] || "Home",
    oppositionClub: "",
    teamName: "",
    clubLocation: "",
    homeCaptainEmail: "",
    oppositionCaptainEmail: "",
    grade: availableGrades[0] || "",
    status: "Created" as FixtureStatus,
  });

  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingMail, setSendingMail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

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
    if (!f.matchType && availableMatchTypes.length > 0) {
      set("matchType", availableMatchTypes[0]);
    }
  }, [availableMatchTypes, f.matchType, set]);

  useEffect(() => {
    if (!f.venueType && availableVenueTypes.length > 0) {
      set("venueType", availableVenueTypes[0]);
    }
  }, [availableVenueTypes, f.venueType, set]);

  useEffect(() => {
    if (!f.grade && availableGrades.length > 0) {
      set("grade", availableGrades[0]);
    }
  }, [availableGrades, f.grade, set]);

  const scheduleWhen = useMemo(() => parseScheduleDateTime(f.date), [f.date]);

  const onDateChange = (value: string) => {
    const parsed = parseScheduleDateTime(value);
    setF((p) => ({
      ...p,
      date: value,
      name: !nameTouched && parsed ? parsed.label : p.name,
    }));
  };

  const handleSendMail = async () => {
    if (sendingMail || submitting) return;

    const isFixtureNotificationEnabled =
      emailTemplates?.fixture_scheduled?.is_enabled !== false;
    if (!isFixtureNotificationEnabled) {
      toast.error(
        "Fixture Scheduled Notification is currently disabled. Enable it under Email Templates & Notifications to send emails.",
      );
      return;
    }

    if (!f.date) {
      toast.error("Please select a Date & Time before sending mail.");
      return;
    }
    if (!f.name.trim()) {
      toast.error("Please enter a fixture name before sending mail.");
      return;
    }
    if (!f.teamName.trim()) {
      toast.error("Please enter your team name before sending mail.");
      return;
    }
    if (!f.oppositionClub.trim()) {
      toast.error("Please enter the opposition club name before sending mail.");
      return;
    }

    const oppCheck = validateCaptainEmails(f.oppositionCaptainEmail, "Opposition Club / Team Captain Email");
    if (!oppCheck.valid) {
      toast.error(oppCheck.error);
      return;
    }
    if (!oppCheck.normalized) {
      toast.error("Please enter at least one valid email address in Opposition Club / Team Captain Email (To recipient) before sending.");
      return;
    }

    const homeCheck = validateCaptainEmails(f.homeCaptainEmail, "Home Captain Email");
    if (!homeCheck.valid) {
      toast.error(homeCheck.error);
      return;
    }

    setSendingMail(true);
    try {
      const res = await sendFixtureMail(undefined, {
        name: f.name.trim(),
        date: f.date,
        leagueGroupId: f.leagueGroupId,
        matchType: f.matchType,
        venueType: f.venueType,
        oppositionClub: f.oppositionClub.trim(),
        teamName: f.teamName.trim(),
        clubLocation: f.clubLocation?.trim() || null,
        homeCaptainEmail: homeCheck.normalized || null,
        oppositionCaptainEmail: oppCheck.normalized || null,
        grade: f.grade,
        status: f.status,
      });
      setEmailSent(true);
      toast.success(res?.message || "Fixture notification email sent successfully");
    } catch (error: any) {
      console.error("Fixture notification email sending failed:", error);
      const errMsg =
        error.message ||
        error.response?.data?.message ||
        "Failed to send fixture notification email.";
      toast.error(errMsg);
    } finally {
      setSendingMail(false);
    }
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

    const homeCheck = validateCaptainEmails(f.homeCaptainEmail, "Home Captain Email");
    if (!homeCheck.valid) {
      toast.error(homeCheck.error);
      return;
    }

    const oppCheck = validateCaptainEmails(f.oppositionCaptainEmail, "Opposition Club / Team Captain Email");
    if (!oppCheck.valid) {
      toast.error(oppCheck.error);
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
        clubLocation: f.clubLocation ? f.clubLocation.trim() : null,
        homeCaptainEmail: homeCheck.normalized || null,
        oppositionCaptainEmail: oppCheck.normalized || null,
        grade: f.grade,
        status: f.status,
        emailSent: emailSent,
        email_sent: emailSent,
        emailSentAt: emailSent ? new Date().toISOString() : null,
        email_sent_at: emailSent ? new Date().toISOString() : null,
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
                  const val = e.target.value;
                  if (!val.trim()) {
                    setNameTouched(false);
                    set("name", scheduleWhen?.label || "");
                  } else {
                    setNameTouched(true);
                    set("name", val);
                  }
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
                placeholder="e.g. Phoenix Eagles"
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
                placeholder="e.g. Metro Warriors"
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
            </div>

            {/* Club Location and Status side by side */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Club Location
              </Label>
              <Select
                value={f.clubLocation || "none"}
                onValueChange={(val) => set("clubLocation", val === "none" ? "" : val)}
              >
                <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg">
                  <SelectValue placeholder="Select Club Location (Optional)" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="none">No Location Selected</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc} value={loc}>
                      {loc}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-[#6B7F78]">
                Dynamically loaded from Settings → Club Locations.
              </p>
            </div>

            <div className="space-y-1.5">
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
                  <SelectItem value="Created">Created</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Captain Email Fields */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Home / Team Captain Email
              </Label>
              <Input
                value={f.homeCaptainEmail}
                onChange={(e) => set("homeCaptainEmail", e.target.value)}
                placeholder="captain@example.com, manager@example.com"
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
              <p className="text-[11px] text-[#6B7F78]">
                Multiple addresses supported. Separate with commas only.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                Opposition Club / Team Captain Email
              </Label>
              <Input
                value={f.oppositionCaptainEmail}
                onChange={(e) => set("oppositionCaptainEmail", e.target.value)}
                placeholder="opp.captain@example.com, club@example.com"
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
              <p className="text-[11px] text-[#6B7F78]">
                Multiple addresses supported. Separate with commas only.
              </p>
            </div>

            {/* Compact Send Mail Button */}
            <div className="sm:col-span-2 flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={sendingMail || submitting}
                onClick={handleSendMail}
                className={cn(
                  "h-8 px-3 gap-1.5 text-xs font-semibold transition-colors",
                  sendingMail
                    ? "border-white/10 bg-white/5 text-[#8FA89F] cursor-not-allowed opacity-80"
                    : "border-[#10B981]/30 text-[#10B981] hover:bg-[#10B981]/10 cursor-pointer"
                )}
                title="Send fixture details to captains"
              >
                {sendingMail ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Sending Mail...</span>
                  </>
                ) : (
                  <>
                    <Mail className="size-3.5" />
                    <span>Send Mail</span>
                  </>
                )}
              </Button>
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
