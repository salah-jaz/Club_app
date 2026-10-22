import { createFileRoute, useNavigate, Link, Navigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { toast } from "sonner";
import {
  Pencil,
  Trash2,
  Calendar,
  Users,
  Shield,
  MapPin,
  Clock,
  Swords,
  Award,
  ChevronRight,
  Building,
  Trophy,
  XCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDeleteDialog, type ConfirmDeleteRequest } from "@/components/ConfirmDeleteDialog";
import { api } from "@/lib/api";
import type { LeagueGroup } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/fixtures/$id/")({
  component: FixtureDetailPage,
});

function FixtureDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const user = useCurrentUser()!;
  const activeRole = useStore((s) => s.activeRole) || user?.role;
  const isAdmin = activeRole === "admin";
  const fixture = useStore((s) => s.fixtures.find((x) => x.id === id));
  const leagueGroups = useStore((s) => s.leagueGroups);
  const deleteFixture = useStore((s) => s.deleteFixture);
  const fetchFixtureById = useStore((s) => s.fetchFixtureById);

  const [deleteRequest, setDeleteRequest] = useState<ConfirmDeleteRequest | null>(null);
  const [loading, setLoading] = useState(!fixture);
  const [notFound, setNotFound] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [loadingGroupDetails, setLoadingGroupDetails] = useState(false);
  const [fetchedGroup, setFetchedGroup] = useState<LeagueGroup | null>(null);
  const allStoreMembers = useStore((s) => s.members);

  useEffect(() => {
    let isMounted = true;
    if (!fixture && !notFound) {
      setLoading(true);
      fetchFixtureById(id)
        .then((res) => {
          if (!isMounted) return;
          setLoading(false);
          if (!res) {
            setNotFound(true);
          }
        })
        .catch(() => {
          if (!isMounted) return;
          setLoading(false);
          setNotFound(true);
        });
    } else if (fixture && loading) {
      setLoading(false);
    }
    return () => {
      isMounted = false;
    };
  }, [id, fixture, fetchFixtureById, notFound, loading]);

  const memberGroupIds = useMemo(
    () => new Set(leagueGroups.map((g) => g.id)),
    [leagueGroups],
  );

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

  // Member authorization check: member must belong to at least one group to access Fixtures module
  if (!isAdmin && leagueGroups.length === 0) {
    toast.error("Access denied. You must belong to at least one group to access Fixtures.");
    return <Navigate to="/dashboard" />;
  }

  const fixtureGroupId = fixture.leagueGroupId || (fixture as any).league_group_id;
  const canEdit = isAdmin || Boolean(fixtureGroupId && memberGroupIds.has(fixtureGroupId));
  const hasGroupAccess = isAdmin || Boolean(fixtureGroupId && memberGroupIds.has(fixtureGroupId));

  const group = leagueGroups.find((g) => String(g.id) === String(fixtureGroupId));
  const activeGroup = fetchedGroup || group;
  const groupName = activeGroup?.name || fixture.leagueGroupName || "Unassigned Group";
  const groupType = activeGroup?.groupType || fixture.leagueGroupType || "Adult";

  const groupMembers = useMemo(() => {
    if (!activeGroup) return [];

    if (Array.isArray(activeGroup.members) && activeGroup.members.length > 0) {
      return activeGroup.members.map((m) => {
        const fullName = `${m.firstName || ""} ${m.lastName || ""}`.trim() || "Unknown Member";
        const storeMember = (allStoreMembers || []).find((sm) => sm.id === m.id);
        const grade = m.grade || storeMember?.grade || null;
        const position = m.position || activeGroup.memberPositions?.[m.id] || null;
        const initials =
          ((m.firstName?.[0] || "") + (m.lastName?.[0] || "")).toUpperCase() ||
          fullName.slice(0, 2).toUpperCase() ||
          "M";
        return {
          id: m.id,
          name: fullName,
          grade,
          position,
          initials,
        };
      });
    }

    if (Array.isArray(activeGroup.memberIds) && activeGroup.memberIds.length > 0) {
      return activeGroup.memberIds.map((memberId) => {
        const storeMember = (allStoreMembers || []).find((sm) => sm.id === memberId);
        const fullName = storeMember
          ? `${storeMember.firstName || ""} ${storeMember.lastName || ""}`.trim() || "Unknown Member"
          : `Member (${memberId})`;
        const grade = storeMember?.grade || null;
        const position = activeGroup.memberPositions?.[memberId] || null;
        const initials = storeMember
          ? ((storeMember.firstName?.[0] || "") + (storeMember.lastName?.[0] || "")).toUpperCase()
          : "M";
        return {
          id: memberId,
          name: fullName,
          grade,
          position,
          initials,
        };
      });
    }

    return [];
  }, [activeGroup, allStoreMembers]);

  const groupMemberCount =
    groupMembers.length > 0
      ? groupMembers.length
      : (activeGroup?.memberIds?.length || activeGroup?.members?.length || 0);

  const handleOpenGroupDetails = async () => {
    setIsGroupModalOpen(true);
    if (!fixtureGroupId) return;

    setLoadingGroupDetails(true);
    try {
      const res = await api.get<LeagueGroup[]>("/league-groups");
      if (Array.isArray(res)) {
        const found = res.find((g) => String(g.id) === String(fixtureGroupId));
        if (found) {
          setFetchedGroup(found);
        }
        useStore.setState((s) => ({
          leagueGroups: s.leagueGroups.map((lg) => {
            const m = res.find((rg) => String(rg.id) === String(lg.id));
            return m || lg;
          }),
        }));
      }
    } catch (err) {
      console.error("Failed to load latest group membership data:", err);
    } finally {
      setLoadingGroupDetails(false);
    }
  };

  const requestDelete = () => {
    if (!isAdmin) {
      toast.error("Members are not permitted to delete fixtures.");
      return;
    }
    setDeleteRequest({
      title: "Delete fixture",
      entityName: fixture.name,
      warning: "This fixture record will be permanently deleted.",
      onConfirm: async () => {
        try {
          await deleteFixture(fixture.id);
          toast.success("Fixture deleted successfully");
          navigate({ to: "/fixtures" });
        } catch (error: unknown) {
          toast.error(error instanceof Error ? error.message : "Failed to delete fixture.");
          throw error;
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      <ConfirmDeleteDialog
        request={deleteRequest}
        onOpenChange={(open) => !open && setDeleteRequest(null)}
      />

      {/* Group Details Modal */}
      <Dialog open={isGroupModalOpen} onOpenChange={setIsGroupModalOpen}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] w-[calc(100%-1.5rem)] max-w-lg max-h-[85dvh] flex flex-col gap-0 p-0 overflow-hidden shadow-2xl rounded-2xl">
          <DialogHeader className="p-5 sm:p-6 border-b border-white/[0.06] shrink-0 text-left">
            <div className="flex items-start justify-between gap-3 pr-6">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center text-[#38BDF8] shrink-0">
                  <Users className="size-5" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg font-bold text-[#F1F0EE] leading-tight truncate">
                    {groupName}
                  </DialogTitle>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span
                      className={cn(
                        "inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full border",
                        groupType.toLowerCase() === "junior"
                          ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
                          : "bg-amber-500/15 text-amber-400 border-amber-500/30",
                      )}
                    >
                      {groupType} Group
                    </span>
                    <span className="text-xs text-[#8A8A98]">
                      {groupMemberCount} {groupMemberCount === 1 ? "member" : "members"}
                    </span>
                  </div>
                </div>
              </div>

              {loadingGroupDetails && (
                <div className="flex items-center gap-1.5 text-[11px] text-[#34D399] bg-[#10B981]/10 border border-[#10B981]/20 px-2 py-0.5 rounded-md shrink-0">
                  <Loader2 className="size-3 animate-spin" />
                  <span className="hidden sm:inline">Syncing...</span>
                </div>
              )}
            </div>

            {activeGroup?.description ? (
              <DialogDescription className="text-xs text-[#8A8A98] mt-3 leading-relaxed">
                {activeGroup.description}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 space-y-2">
            <div className="flex items-center justify-between pb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#34D399]">
                Group Members ({groupMembers.length})
              </span>
              <button
                type="button"
                onClick={handleOpenGroupDetails}
                disabled={loadingGroupDetails}
                className="text-[11px] text-[#8A8A98] hover:text-[#34D399] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                title="Reload latest membership"
              >
                <RefreshCw className={cn("size-3", loadingGroupDetails && "animate-spin")} />
                <span>Refresh</span>
              </button>
            </div>

            {loadingGroupDetails && groupMembers.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-2.5">
                <Loader2 className="size-6 text-[#10B981] animate-spin" />
                <p className="text-xs text-[#8A8A98]">Loading group membership data...</p>
              </div>
            ) : groupMembers.length === 0 ? (
              <div className="py-10 text-center text-[#8A8A98] bg-[#0C0F0E]/40 rounded-xl border border-white/[0.04] p-6 space-y-2">
                <Users className="size-8 text-[#4A4A5A] mx-auto" />
                <p className="text-sm font-medium text-[#EEF2F0]">No members in this group</p>
                <p className="text-xs text-[#8A8A98]">
                  There are currently no members assigned to this group.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {groupMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 text-xs rounded-xl px-3.5 py-2.5 bg-[#0C0F0E]/60 border border-white/[0.04] hover:border-white/[0.08] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[#34D399] flex items-center justify-center text-xs font-semibold shrink-0">
                        {member.initials}
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate font-medium text-[#EEF2F0]">
                          {member.name}
                        </span>
                        {member.position ? (
                          <span className="text-[10px] text-[#38BDF8] flex items-center gap-1 font-medium">
                            <Shield className="size-2.5" />
                            {member.position}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {member.grade ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-[#10B981]/10 text-[#34D399] border border-[#10B981]/20">
                          <Award className="size-3" />
                          Grade {member.grade}
                        </span>
                      ) : (
                        <span className="text-[10px] text-[#4A4A5A] italic">No grade</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="px-5 py-3.5 border-t border-white/[0.06] bg-[#0C0F0E]/60 flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <span className="text-xs text-[#8A8A98] sm:hidden">
              {groupMembers.length} {groupMembers.length === 1 ? "member" : "members"}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsGroupModalOpen(false)}
              className="border-white/10 hover:bg-white/5 text-[#F1F0EE] h-8 text-xs px-4 cursor-pointer"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PageHeader
        title={fixture.name}
        description={`Fixture scheduled for ${fmtDateTime(fixture.date)}`}
        backTo="/fixtures"
        actions={
          <div className="flex items-center gap-2">
            {canEdit && (
              <Button asChild className="btn-premium-solid h-[38px] px-4 hover:cursor-pointer">
                <Link to="/fixtures/$id/edit" params={{ id: fixture.id }}>
                  <Pencil className="size-4 mr-1.5" /> Edit Fixture
                </Link>
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="size-9 text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg"
                onClick={requestDelete}
                title="Delete fixture"
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        }
      />

      {/* Match Clash Banner */}
      <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top overflow-hidden">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Our Team */}
            <div className="flex items-center gap-4 text-center md:text-left">
              <div className="size-14 rounded-2xl bg-[#10B981]/10 border border-[#10B981]/20 flex items-center justify-center text-[#10B981] shadow-lg">
                <Shield className="size-7" />
              </div>
              <div>
                <span className="text-[11px] font-semibold tracking-wider text-[#10B981] uppercase block">
                  Home / Host Team
                </span>
                <h2 className="text-xl font-bold text-[#F1F0EE] mt-0.5">
                  {fixture.teamName}
                </h2>
                <p className="text-xs text-[#8A8A98]">{groupName}</p>
              </div>
            </div>

            {/* VS Badge */}
            <div className="flex flex-col items-center">
              <div className="size-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-bold text-sm text-[#F1F0EE]">
                VS
              </div>
              <span className="text-[10px] text-[#8A8A98] mt-1 uppercase tracking-widest font-mono">
                {fixture.venueType}
              </span>
            </div>

            {/* Opposition Team */}
            <div className="flex items-center gap-4 text-center md:text-right flex-row-reverse md:flex-row">
              <div className="md:text-right">
                <span className="text-[11px] font-semibold tracking-wider text-[#F59E0B] uppercase block">
                  Opposition Club
                </span>
                <h2 className="text-xl font-bold text-[#F1F0EE] mt-0.5">
                  {fixture.oppositionClub}
                </h2>
                <p className="text-xs text-[#8A8A98]">Grade {fixture.grade}</p>
              </div>
              <div className="size-14 rounded-2xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center text-[#F59E0B] shadow-lg">
                <Swords className="size-7" />
              </div>
            </div>
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
              Official recorded score and statistics
            </p>
          </div>
          <div className="shrink-0">
            {fixture.result === "Win" && (
              <Badge
                variant="outline"
                className="bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30 font-semibold text-xs px-3 py-1 gap-1.5 capitalize shadow-sm"
              >
                <Trophy className="size-3.5" /> Win
              </Badge>
            )}
            {fixture.result === "Loss" && (
              <Badge
                variant="outline"
                className="bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30 font-semibold text-xs px-3 py-1 gap-1.5 capitalize shadow-sm"
              >
                <XCircle className="size-3.5" /> Loss
              </Badge>
            )}
            {!fixture.result && (
              <Badge
                variant="outline"
                className="bg-[#1A2120] text-[#8FA89F] border-[rgba(255,255,255,0.10)] font-medium text-xs px-3 py-1"
              >
                Not Recorded
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Home Team Row */}
          <div className="p-4 sm:p-5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1A2120]/40 hover:bg-[#1A2120]/60 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="size-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[#10B981] shrink-0 shadow-sm">
                <Shield className="size-5.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wider uppercase bg-emerald-500/10 text-[#10B981] border border-emerald-500/20">
                    <Shield className="size-3" /> Home Team
                  </span>
                  <span className="text-xs text-[#8FA89F]">Badminton Club</span>
                </div>
                <h4
                  className="font-bold text-base sm:text-lg text-[#EEF2F0] truncate mt-1"
                  title={fixture.homeTeamName || fixture.teamName}
                >
                  {fixture.homeTeamName || fixture.teamName}
                </h4>
              </div>
            </div>

            {/* Stat Cells */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 shrink-0 w-full md:w-auto">
              <div className="p-3 sm:px-4 sm:py-3 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center min-w-[95px] sm:min-w-[125px] shadow-sm transition-all hover:border-emerald-500/30">
                <span className="text-[10px] sm:text-[11px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                  Total Matches
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-[#EEF2F0] tabular-nums block mt-1 tracking-tight">
                  {fixture.homeTotalMatches ?? "—"}
                </span>
              </div>
              <div className="p-3 sm:px-4 sm:py-3 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center min-w-[95px] sm:min-w-[125px] shadow-sm transition-all hover:border-emerald-500/30">
                <span className="text-[10px] sm:text-[11px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                  Total Games
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-[#EEF2F0] tabular-nums block mt-1 tracking-tight">
                  {fixture.homeTotalGames ?? "—"}
                </span>
              </div>
              <div className="p-3 sm:px-4 sm:py-3 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center min-w-[95px] sm:min-w-[125px] shadow-sm transition-all hover:border-emerald-500/30">
                <span className="text-[10px] sm:text-[11px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                  Total Points
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-[#EEF2F0] tabular-nums block mt-1 tracking-tight">
                  {fixture.homeTotalPoints ?? "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Visiting Team Row */}
          <div className="p-4 sm:p-5 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#1A2120]/40 hover:bg-[#1A2120]/60 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="size-11 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#F59E0B] shrink-0 shadow-sm">
                <Swords className="size-5.5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold tracking-wider uppercase bg-amber-500/10 text-[#F59E0B] border border-amber-500/20">
                    <Swords className="size-3" /> Visiting Team
                  </span>
                  <span className="text-xs text-[#8FA89F]">Badminton Club</span>
                </div>
                <h4
                  className="font-bold text-base sm:text-lg text-[#EEF2F0] truncate mt-1"
                  title={fixture.visitingTeamName || fixture.oppositionClub}
                >
                  {fixture.visitingTeamName || fixture.oppositionClub}
                </h4>
              </div>
            </div>

            {/* Stat Cells */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5 shrink-0 w-full md:w-auto">
              <div className="p-3 sm:px-4 sm:py-3 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center min-w-[95px] sm:min-w-[125px] shadow-sm transition-all hover:border-amber-500/30">
                <span className="text-[10px] sm:text-[11px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                  Total Matches
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-[#EEF2F0] tabular-nums block mt-1 tracking-tight">
                  {fixture.visitingTotalMatches ?? "—"}
                </span>
              </div>
              <div className="p-3 sm:px-4 sm:py-3 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center min-w-[95px] sm:min-w-[125px] shadow-sm transition-all hover:border-amber-500/30">
                <span className="text-[10px] sm:text-[11px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                  Total Games
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-[#EEF2F0] tabular-nums block mt-1 tracking-tight">
                  {fixture.visitingTotalGames ?? "—"}
                </span>
              </div>
              <div className="p-3 sm:px-4 sm:py-3 rounded-xl border border-[rgba(255,255,255,0.10)] bg-[#131916] text-center min-w-[95px] sm:min-w-[125px] shadow-sm transition-all hover:border-amber-500/30">
                <span className="text-[10px] sm:text-[11px] font-bold tracking-wider text-[#8FA89F] uppercase block truncate">
                  Total Points
                </span>
                <span className="text-xl sm:text-2xl font-black font-mono text-[#EEF2F0] tabular-nums block mt-1 tracking-tight">
                  {fixture.visitingTotalPoints ?? "—"}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fixture Details */}
      <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top overflow-hidden">
        <CardHeader className="pb-3 border-b border-[rgba(255,255,255,0.06)] flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-[12px] font-bold tracking-[0.12em] text-[#34D399] uppercase">
              Fixture Details
            </CardTitle>
            <p className="text-xs text-[#8FA89F] mt-0.5">
              Match specifications and group allocation
            </p>
          </div>
          <div className="shrink-0">
            <StatusBadge status={fixture.status} />
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Specifications Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Match Type */}
            <div className="p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 hover:bg-[#1A2120]/60 transition-colors flex items-center gap-3.5">
              <div className="size-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-[#34D399] shrink-0 shadow-sm">
                <Swords className="size-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">
                  Match Type
                </span>
                <p className="text-sm sm:text-base font-bold text-[#EEF2F0] truncate mt-0.5">
                  {fixture.matchType || "—"}
                </p>
              </div>
            </div>

            {/* Venue Type */}
            <div className="p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 hover:bg-[#1A2120]/60 transition-colors flex items-center gap-3.5">
              <div className="size-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-[#38BDF8] shrink-0 shadow-sm">
                <MapPin className="size-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">
                  Venue Type
                </span>
                <p className="text-sm sm:text-base font-bold text-[#EEF2F0] truncate mt-0.5">
                  {fixture.venueType || "—"}
                </p>
              </div>
            </div>

            {/* Grade */}
            <div className="p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 hover:bg-[#1A2120]/60 transition-colors flex items-center gap-3.5">
              <div className="size-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-[#F59E0B] shrink-0 shadow-sm">
                <Award className="size-5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">
                  Grade
                </span>
                <p className="text-sm sm:text-base font-bold font-mono text-[#EEF2F0] truncate mt-0.5">
                  {fixture.grade || "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Assigned Group Banner */}
          <div className="p-4 sm:p-4.5 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[#1A2120]/40 hover:bg-[#1A2120]/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="size-11 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center text-[#38BDF8] shrink-0 shadow-sm">
                <Users className="size-5.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold tracking-wider text-[#8FA89F] uppercase block">
                  Assigned Group
                </span>
                <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                  <h4 className="font-bold text-base text-[#EEF2F0] truncate" title={groupName}>
                    {groupName}
                  </h4>
                  <span
                    className={cn(
                      "inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full border shrink-0",
                      groupType.toLowerCase() === "junior"
                        ? "bg-sky-500/15 text-sky-400 border-sky-500/30"
                        : "bg-amber-500/15 text-amber-400 border-amber-500/30",
                    )}
                  >
                    {groupType} Group
                  </span>
                  <span className="text-xs text-[#8FA89F] shrink-0 font-medium">
                    · {groupMemberCount} {groupMemberCount === 1 ? "member" : "members"}
                  </span>
                </div>
              </div>
            </div>

            {hasGroupAccess && Boolean(fixtureGroupId) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="btn-premium-outline text-xs h-9 px-4 cursor-pointer inline-flex items-center gap-1.5 font-medium shrink-0 self-start sm:self-center"
                onClick={handleOpenGroupDetails}
              >
                <span>View Group Details</span>
                <ChevronRight className="size-3.5 ml-1" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
