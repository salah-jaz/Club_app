import { createFileRoute, useNavigate, Link, Navigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
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
} from "lucide-react";
import { ConfirmDeleteDialog, type ConfirmDeleteRequest } from "@/components/ConfirmDeleteDialog";

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

  const [deleteRequest, setDeleteRequest] = useState<ConfirmDeleteRequest | null>(null);

  const memberGroupIds = useMemo(
    () => new Set(leagueGroups.map((g) => g.id)),
    [leagueGroups],
  );

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

  // Member authorization check
  if (!isAdmin && !memberGroupIds.has(fixture.leagueGroupId)) {
    toast.error("You are not authorized to view this fixture.");
    return <Navigate to="/fixtures" />;
  }

  const group = leagueGroups.find((g) => g.id === fixture.leagueGroupId);
  const groupName = group?.name || fixture.leagueGroupName || "Unassigned Group";
  const groupType = group?.groupType || fixture.leagueGroupType || "Adult";
  const groupMemberCount =
    group?.memberIds?.length || group?.members?.length || 0;

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

      <PageHeader
        title={fixture.name}
        description={`Fixture scheduled for ${fmtDateTime(fixture.date)}`}
        backTo="/fixtures"
        actions={
          <div className="flex items-center gap-2">
            <Button asChild className="btn-premium-solid h-[38px] px-4 hover:cursor-pointer">
              <Link to="/fixtures/$id/edit" params={{ id: fixture.id }}>
                <Pencil className="size-4 mr-1.5" /> Edit Fixture
              </Link>
            </Button>
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

      {/* Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Match Specification */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top md:col-span-2">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Match Specifications
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.04)] bg-[#0C0F0E]/50">
                <p className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                  Status
                </p>
                <div className="mt-1">
                  <StatusBadge status={fixture.status} />
                </div>
              </div>

              <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.04)] bg-[#0C0F0E]/50">
                <p className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                  Match Type
                </p>
                <p className="text-sm font-semibold text-[#F1F0EE] mt-1">
                  {fixture.matchType}
                </p>
              </div>

              <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.04)] bg-[#0C0F0E]/50">
                <p className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                  Venue Type
                </p>
                <p className="text-sm font-semibold text-[#F1F0EE] mt-1">
                  {fixture.venueType}
                </p>
              </div>

              <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.04)] bg-[#0C0F0E]/50">
                <p className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                  Grade
                </p>
                <p className="text-sm font-semibold text-[#F1F0EE] mt-1 font-mono">
                  {fixture.grade}
                </p>
              </div>

              <div className="p-3 rounded-lg border border-[rgba(255,255,255,0.04)] bg-[#0C0F0E]/50 sm:col-span-2">
                <p className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                  Date & Time
                </p>
                <p className="text-sm font-semibold text-[#F1F0EE] mt-1 flex items-center gap-1.5">
                  <Calendar className="size-4 text-[#10B981]" />
                  {fmtDateTime(fixture.date)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Group Information */}
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader className="pb-3 border-b border-white/[0.03]">
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              Assigned Group
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-[#38BDF8]/10 border border-[#38BDF8]/20 flex items-center justify-center text-[#38BDF8]">
                <Users className="size-5" />
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-sm text-[#F1F0EE] truncate">
                  {groupName}
                </h4>
                <p className="text-xs text-[#8A8A98]">
                  {groupType} Group · {groupMemberCount} Member{groupMemberCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-white/[0.04]">
              <Button
                asChild
                variant="outline"
                className="w-full text-xs border-white/10 hover:bg-white/5"
              >
                <Link to="/league-groups">
                  View Group Details <ChevronRight className="size-3.5 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
