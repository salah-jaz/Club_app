import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useResponsiveViewMode } from "@/hooks/use-responsive-view-mode";
import { useCurrentUser, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Users, Save, X, ShieldCheck, LayoutGrid, List, Search, Eye } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ConfirmDeleteDialog,
  type ConfirmDeleteRequest,
} from "@/components/ConfirmDeleteDialog";
import type { LeagueGroup } from "@/lib/types";

export const Route = createFileRoute("/_authenticated/league-groups")({
  component: LeagueGroupsPage,
});

function memberDisplayName(
  group: LeagueGroup,
  memberId: string,
  allMembers: { id: string; firstName: string; lastName: string; grade?: string }[],
) {
  const fromApi = group.members?.find((m) => m.id === memberId);
  if (fromApi) {
    return {
      name: `${fromApi.firstName} ${fromApi.lastName}`.trim(),
      grade: fromApi.grade ?? null,
      position: fromApi.position ?? group.memberPositions?.[memberId] ?? null,
    };
  }
  const m = allMembers.find((x) => x.id === memberId);
  return {
    name: m ? `${m.firstName} ${m.lastName}`.trim() : memberId,
    grade: m?.grade ?? null,
    position: group.memberPositions?.[memberId] ?? null,
  };
}

function LeagueGroupsPage() {
  const user = useCurrentUser()!;
  const activeRole = useStore((s) => s.activeRole) || user.role;
  const isAdmin = activeRole === "admin";

  if (!isAdmin) {
    return <MemberLeagueGroupsView />;
  }

  return <AdminLeagueGroupsView />;
}

/** Members: same list/grid UI as admin, view-only (no create/edit/delete). */
function MemberLeagueGroupsView() {
  const user = useCurrentUser()!;
  const allMembers = useStore((s) => s.members);
  const leagueGroups = useStore((s) => s.leagueGroups) || [];
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name_asc");
  const [viewingGroup, setViewingGroup] = useState<LeagueGroup | null>(null);
  const { viewMode, setViewMode, isMobile } = useResponsiveViewMode(
    "clubapp-view-mode-league-groups-member",
    "grid",
  );

  const myMemberIds = useMemo(
    () => new Set(allMembers.filter((m) => m.userId === user.id).map((m) => m.id)),
    [allMembers, user.id],
  );

  const filteredGroups = useMemo(() => {
    let result = leagueGroups.filter((g) =>
      (g.memberIds || []).some((id) => myMemberIds.has(id)),
    );
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((g) => {
        if (g.name.toLowerCase().includes(term)) return true;
        if (g.description?.toLowerCase().includes(term)) return true;
        return (g.memberIds || []).some((id) => {
          const info = memberDisplayName(g, id, allMembers);
          return info.name.toLowerCase().includes(term);
        });
      });
    }

    return result.sort((a, b) => {
      if (sortBy === "name_asc") return a.name.localeCompare(b.name);
      if (sortBy === "name_desc") return b.name.localeCompare(a.name);
      if (sortBy === "members_desc") {
        return (b.memberIds?.length || 0) - (a.memberIds?.length || 0);
      }
      if (sortBy === "members_asc") {
        return (a.memberIds?.length || 0) - (b.memberIds?.length || 0);
      }
      return 0;
    });
  }, [leagueGroups, myMemberIds, searchTerm, sortBy, allMembers]);

  const myPositionLabel = (g: LeagueGroup) => {
    const mine = (g.memberIds || []).filter((id) => myMemberIds.has(id));
    const labels = mine
      .map((id) => memberDisplayName(g, id, allMembers).position)
      .filter(Boolean) as string[];
    if (labels.length === 0) return null;
    return [...new Set(labels)].join(", ");
  };

  return (
    <div className="space-y-6">
      <Dialog open={!!viewingGroup} onOpenChange={(open) => !open && setViewingGroup(null)}>
        <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#F1F0EE]">{viewingGroup?.name ?? "Group members"}</DialogTitle>
            <DialogDescription className="text-[#8A8A98]">
              {viewingGroup?.description?.trim()
                ? viewingGroup.description
                : `${viewingGroup?.memberIds?.length ?? 0} members in this league group`}
            </DialogDescription>
          </DialogHeader>
          {viewingGroup && (
            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1 mt-2">
              {(viewingGroup.memberIds || []).map((id) => {
                const info = memberDisplayName(viewingGroup, id, allMembers);
                const isMe = myMemberIds.has(id);
                return (
                  <div
                    key={id}
                    className={cn(
                      "flex items-center justify-between gap-2 text-[12px] rounded-lg px-3 py-2",
                      isMe
                        ? "bg-[#10B981]/10 border border-[#10B981]/20"
                        : "bg-[#0C0F0E]/60 border border-white/[0.04]",
                    )}
                  >
                    <div className="min-w-0">
                      <span
                        className={cn(
                          "block truncate",
                          isMe ? "text-[#34D399] font-semibold" : "text-[#EEF2F0]",
                        )}
                      >
                        {info.name}
                        {isMe ? " (you)" : ""}
                      </span>
                      {info.grade && (
                        <span className="text-[10px] text-[#8A8A98]">{info.grade}</span>
                      )}
                    </div>
                    {info.position ? (
                      <span className="shrink-0 inline-flex items-center gap-1 bg-[#10B981]/10 text-[#10B981] px-1.5 py-0.5 rounded text-[10px] font-medium">
                        <ShieldCheck className="size-2.5" />
                        {info.position}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-[#4A4A5A] italic">no position</span>
                    )}
                  </div>
                );
              })}
              {(viewingGroup.memberIds || []).length === 0 && (
                <p className="text-[12px] text-[#8A8A98] text-center py-6">No members in this group.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <PageHeader
        title="League Groups"
        description="View your league groups, positions, and teammates."
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-[#131916] border border-[rgba(255,255,255,0.06)] p-3.5 rounded-xl">
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative w-full sm:max-w-[320px] min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#8A8A98] pointer-events-none" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search groups or members..."
              className="pl-10 pr-9 bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 rounded-lg text-xs focus-visible:ring-1 focus-visible:ring-[#10B981]"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-white cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 w-full sm:w-[180px] rounded-lg cursor-pointer text-xs">
              <SelectValue placeholder="Sort By" />
            </SelectTrigger>
            <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
              <SelectItem value="name_asc" className="text-xs">Name (A-Z)</SelectItem>
              <SelectItem value="name_desc" className="text-xs">Name (Z-A)</SelectItem>
              <SelectItem value="members_desc" className="text-xs">Members Count (High-Low)</SelectItem>
              <SelectItem value="members_asc" className="text-xs">Members Count (Low-High)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1 bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)] p-0.5 rounded-lg shrink-0 h-10">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={cn(
              "px-2.5 h-full rounded-md transition-all cursor-pointer flex items-center",
              viewMode === "grid" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
            )}
            title="Grid view"
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            disabled={isMobile}
            className={cn(
              "px-2.5 h-full rounded-md transition-all flex items-center",
              viewMode === "list" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
              isMobile ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
            )}
            title={isMobile ? "List view available on larger screens" : "List view"}
          >
            <List className="size-4" />
          </button>
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916] sm:col-span-2 lg:col-span-3">
            <CardContent className="p-10 text-center text-[#8A8A98]">
              <div className="flex flex-col items-center justify-center gap-3">
                <Users className="size-12 text-[#4A4A5A]" />
                <h3 className="text-[14px] font-normal text-[#8A8A98]">
                  {searchTerm ? "No matching league groups found." : "You are not in any league groups yet."}
                </h3>
                <p className="text-[12px] font-light text-[#4A4A5A] max-w-[280px]">
                  {searchTerm
                    ? "Try adjusting your search terms."
                    : "When an admin adds you to a league group, it will appear here."}
                </p>
                {searchTerm && (
                  <Button
                    variant="outline"
                    onClick={() => setSearchTerm("")}
                    className="border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] hover:bg-white/5 text-[#F1F0EE] h-9 text-xs rounded-lg mt-2 px-4 cursor-pointer"
                  >
                    Reset Search
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredGroups.map((g) => {
            const groupMembers = (g.memberIds || []).map((id) => {
              const info = memberDisplayName(g, id, allMembers);
              return { id, ...info, isMe: myMemberIds.has(id) };
            });

            return (
              <Card
                key={g.id}
                className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-all duration-200"
              >
                <CardContent className="p-5 flex flex-col justify-between h-full">
                  <div>
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-semibold text-[15px] text-[#F1F0EE] truncate">{g.name}</h3>
                      <div className="text-[11px] bg-[#10B981]/10 text-[#10B981] px-2 py-0.5 rounded-full font-mono font-medium flex items-center gap-1 shrink-0">
                        <Users className="size-3" /> {g.memberIds?.length || 0}
                      </div>
                    </div>
                    {g.description ? (
                      <p className="text-xs text-[#8A8A98] mt-2 font-light line-clamp-2 leading-relaxed">
                        {g.description}
                      </p>
                    ) : null}

                    {groupMembers.length > 0 && (
                      <div className="mt-3 space-y-1">
                        {groupMembers.map((row) => (
                          <div key={row.id} className="flex items-center justify-between gap-2 text-[11px]">
                            <span
                              className={cn(
                                "truncate",
                                row.isMe ? "text-[#EEF2F0] font-semibold" : "text-[#C1C1C8]",
                              )}
                            >
                              {row.name}
                              {row.isMe ? " (you)" : ""}
                            </span>
                            {row.position ? (
                              <span className="shrink-0 flex items-center gap-1 bg-[#10B981]/10 text-[#10B981] px-1.5 py-0.5 rounded text-[10px] font-medium">
                                <ShieldCheck className="size-2.5" />
                                {row.position}
                              </span>
                            ) : (
                              <span className="shrink-0 text-[10px] text-[#4A4A5A] italic">no position</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#131916] border border-[rgba(255,255,255,0.06)] rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-[#0C0F0E]/60">
              <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                <TableHead className="type-table-head h-11 px-5">Group Name</TableHead>
                <TableHead className="type-table-head h-11">Description</TableHead>
                <TableHead className="type-table-head h-11">Members Count</TableHead>
                <TableHead className="type-table-head h-11">Your Position</TableHead>
                <TableHead className="type-table-head h-11 text-right px-5">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((g) => {
                const myPos = myPositionLabel(g);
                return (
                  <TableRow
                    key={g.id}
                    className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors"
                  >
                    <TableCell className="px-5 py-3.5 font-bold text-[14.5px] text-[#EEF2F0]">
                      {g.name}
                    </TableCell>
                    <TableCell className="type-table-body">
                      {g.description || <span className="text-[#4A4A5A] italic">No description</span>}
                    </TableCell>
                    <TableCell className="type-mono-value">
                      <span className="flex items-center gap-1.5">
                        <Users className="size-3.5 text-[#10B981] mr-1.5" />
                        {g.memberIds?.length || 0} members
                      </span>
                    </TableCell>
                    <TableCell className="py-3.5">
                      {myPos ? (
                        <span className="inline-flex items-center gap-1 bg-[#10B981]/10 text-[#10B981] px-2 py-1 rounded text-[11px] font-medium">
                          <ShieldCheck className="size-3" />
                          {myPos}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[#4A4A5A] italic">No position</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right px-5 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="btn-premium-outline h-8 text-xs hover:cursor-pointer"
                        onClick={() => setViewingGroup(g)}
                      >
                        <Eye className="size-3 mr-1" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function AdminLeagueGroupsView() {
  const store = useStore();
  const allMembers = useStore((s) => s.members);
  const members = allMembers.filter(
    (m) => m.membership && m.status === "active" && m.memberType.toLowerCase() === "adult",
  );
  const leagueGroups = useStore((s) => s.leagueGroups) || [];
  const playerPositions = useStore((s) => s.playerPositions) || [];
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("name_asc");
  const [deleteRequest, setDeleteRequest] = useState<ConfirmDeleteRequest | null>(null);

  const filteredGroups = useMemo(() => {
    let result = [...leagueGroups];
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter((g) => {
        if (g.name.toLowerCase().includes(term)) return true;
        if (g.description?.toLowerCase().includes(term)) return true;
        const hasMember = (g.memberIds || []).some((id) => {
          const m = allMembers.find((x) => x.id === id);
          if (!m) return false;
          return `${m.firstName} ${m.lastName}`.toLowerCase().includes(term);
        });
        return hasMember;
      });
    }

    return result.sort((a, b) => {
      if (sortBy === "name_asc") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name_desc") {
        return b.name.localeCompare(a.name);
      }
      if (sortBy === "members_desc") {
        return (b.memberIds?.length || 0) - (a.memberIds?.length || 0);
      }
      if (sortBy === "members_asc") {
        return (a.memberIds?.length || 0) - (b.memberIds?.length || 0);
      }
      return 0;
    });
  }, [leagueGroups, allMembers, searchTerm, sortBy]);
  const { viewMode, setViewMode, isMobile } = useResponsiveViewMode("clubapp-view-mode-league-groups", "grid");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [memberPositions, setMemberPositions] = useState<Record<string, string>>({});

  const handleStartCreate = () => {
    setName("");
    setDescription("");
    setSelectedMembers([]);
    setMemberPositions({});
    setIsCreating(true);
    setEditingId(null);
  };

  const handleStartEdit = (group: LeagueGroup) => {
    setEditingId(group.id);
    setName(group.name);
    setDescription(group.description);
    setSelectedMembers(group.memberIds || []);
    const positions: Record<string, string> = {};
    if (group.memberPositions) {
      for (const [id, pos] of Object.entries(group.memberPositions)) {
        if (pos) positions[id] = pos as string;
      }
    }
    setMemberPositions(positions);
    setIsCreating(false);
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingId(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Group name is required");
      return;
    }

    const positionsForSelected: Record<string, string | null> = {};
    selectedMembers.forEach((id) => {
      positionsForSelected[id] = memberPositions[id] || null;
    });

    try {
      if (isCreating) {
        await store.createLeagueGroup({
          name,
          description,
          memberIds: selectedMembers,
          memberPositions: positionsForSelected,
        });
        toast.success("League group created successfully");
      } else if (editingId) {
        await store.updateLeagueGroup(editingId, {
          name,
          description,
          memberIds: selectedMembers,
          memberPositions: positionsForSelected,
        });
        toast.success("League group updated successfully");
      }
      setIsCreating(false);
      setEditingId(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to save league group");
    }
  };

  const handleDelete = (id: string) => {
    const group = leagueGroups.find((g) => g.id === id);
    if (!group) return;
    const memberCount = group.memberIds?.length ?? 0;
    const scheduleCount = (store.schedules ?? []).filter((sch) =>
      sch.leagueGroupIds?.includes(id),
    ).length;
    setDeleteRequest({
      title: "Delete league group",
      entityName: group.name,
      related: [
        { label: memberCount === 1 ? "member" : "members", count: memberCount },
        { label: scheduleCount === 1 ? "linked schedule" : "linked schedules", count: scheduleCount },
      ],
      warning:
        memberCount > 0 || scheduleCount > 0
          ? "Group membership links will be removed. Schedules that reference this group will keep their other settings."
          : undefined,
      onConfirm: async () => {
        try {
          await store.deleteLeagueGroup(id);
          toast.success("League group deleted");
        } catch (error: unknown) {
          toast.error(error instanceof Error ? error.message : "Failed to delete group");
          throw error;
        }
      },
    });
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) => {
      if (prev.includes(memberId)) {
        setMemberPositions((pos) => {
          const next = { ...pos };
          delete next[memberId];
          return next;
        });
        return prev.filter((id) => id !== memberId);
      }
      return [...prev, memberId];
    });
  };

  const setPosition = (memberId: string, position: string) => {
    setMemberPositions((prev) => ({ ...prev, [memberId]: position }));
  };

  return (
    <div className="space-y-6">
      <ConfirmDeleteDialog
        request={deleteRequest}
        onOpenChange={(open) => !open && setDeleteRequest(null)}
      />
      <PageHeader
        title="League Groups"
        description="Organize league participants into groups to filter play invitations."
        actions={
          !isCreating && !editingId && (
            <Button onClick={handleStartCreate} className="btn-premium-solid h-[38px] px-4 hover:cursor-pointer">
              <Plus className="size-4 mr-1.5" /> Create Group
            </Button>
          )
        }
      />

      {(isCreating || editingId) ? (
        <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] signature-card-top">
          <CardHeader>
            <CardTitle className="text-[12px] font-medium tracking-[0.12em] text-[#34D399] uppercase">
              {isCreating ? "Create New League Group" : "Edit League Group"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Group Name</Label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Division A, Weekend League"
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Description</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Group description or notes..."
                    className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] min-h-[60px] rounded-lg"
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">
                      Select Group Members
                    </Label>
                    {playerPositions.length === 0 && (
                      <span className="text-[9px] text-amber-400/70 font-light italic">
                        No positions defined — configure in Settings
                      </span>
                    )}
                  </div>
                  {members.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground italic">No eligible league participants found in members.</p>
                  ) : (
                    <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                      {members.map((m) => {
                        const isSelected = selectedMembers.includes(m.id);
                        return (
                          <div
                            key={m.id}
                            className={`flex flex-col sm:flex-row sm:items-center gap-3 p-2.5 bg-[#1A2120] border rounded-lg transition-all ${
                              isSelected
                                ? "border-[#10B981] bg-[#1A2120]/80"
                                : "border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleMember(m.id)}
                                className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981] shrink-0"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-[#F1F0EE] text-[13px] truncate">
                                  {m.firstName} {m.lastName}
                                </div>
                                <div className="text-[10px] text-muted-foreground">{m.grade}</div>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-full sm:w-[160px] sm:shrink-0 pl-8 sm:pl-0">
                                {playerPositions.length > 0 ? (
                                  <Select
                                    value={memberPositions[m.id] || ""}
                                    onValueChange={(val) => setPosition(m.id, val)}
                                  >
                                    <SelectTrigger className="h-8 text-[11px] bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] rounded-md cursor-pointer w-full">
                                      <SelectValue placeholder="Assign position…" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                                      {playerPositions.map((pos) => (
                                        <SelectItem key={pos} value={pos} className="text-[11px] cursor-pointer hover:bg-white/5">
                                          {pos}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    value={memberPositions[m.id] || ""}
                                    onChange={(e) => setPosition(m.id, e.target.value)}
                                    placeholder="Enter position…"
                                    className="h-8 text-[11px] bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] rounded-md"
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
                <Button type="button" variant="outline" onClick={handleCancel} className="btn-premium-outline h-10 px-4 cursor-pointer w-full sm:w-auto">
                  <X className="size-4 mr-1.5" /> Cancel
                </Button>
                <Button type="submit" className="btn-premium-solid h-10 px-6 font-semibold cursor-pointer w-full sm:w-auto">
                  <Save className="size-4 mr-1.5" /> Save Group
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 bg-[#131916] border border-[rgba(255,255,255,0.06)] p-3.5 rounded-xl">
            <div className="flex items-center gap-3 flex-1 flex-wrap">
              <div className="relative w-full sm:max-w-[320px] min-w-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#8A8A98]" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search groups or members..."
                  className="pl-9 pr-9 bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 rounded-lg text-xs focus-visible:ring-1 focus-visible:ring-[#10B981]"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-white cursor-pointer"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="bg-[#0C0F0E] border-[rgba(255,255,255,0.08)] text-[#F1F0EE] h-10 w-full sm:w-[180px] rounded-lg cursor-pointer text-xs">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                  <SelectItem value="name_asc" className="text-xs">Name (A-Z)</SelectItem>
                  <SelectItem value="name_desc" className="text-xs">Name (Z-A)</SelectItem>
                  <SelectItem value="members_desc" className="text-xs">Members Count (High-Low)</SelectItem>
                  <SelectItem value="members_asc" className="text-xs">Members Count (Low-High)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-1 bg-[#0C0F0E] border border-[rgba(255,255,255,0.06)] p-0.5 rounded-lg shrink-0 h-10">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "px-2.5 h-full rounded-md transition-all cursor-pointer flex items-center",
                  viewMode === "grid" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
                )}
                title="Grid view"
              >
                <LayoutGrid className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                disabled={isMobile}
                className={cn(
                  "px-2.5 h-full rounded-md transition-all flex items-center",
                  viewMode === "list" ? "bg-[#1A2120] text-[#2FD9A0]" : "text-[#8FA89F] hover:text-[#EEF2F0]",
                  isMobile ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                )}
                title={isMobile ? "List view available on larger screens" : "List view"}
              >
                <List className="size-4" />
              </button>
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916] sm:col-span-2 lg:col-span-3">
                <CardContent className="p-10 text-center text-[#8A8A98]">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <Users className="size-12 text-[#4A4A5A]" />
                    <h3 className="text-[14px] font-normal text-[#8A8A98]">
                      {searchTerm ? "No matching league groups found." : "No league groups created yet."}
                    </h3>
                    <p className="text-[12px] font-light text-[#4A4A5A] max-w-[280px]">
                      {searchTerm ? "Try adjusting your search terms." : "Create groups to target specific match invitations to a subset of players."}
                    </p>
                    {searchTerm && (
                      <Button
                        variant="outline"
                        onClick={() => setSearchTerm("")}
                        className="border-[rgba(255,255,255,0.08)] bg-[#0C0F0E] hover:bg-white/5 text-[#F1F0EE] h-9 text-xs rounded-lg mt-2 px-4 cursor-pointer"
                      >
                        Reset Search
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredGroups.map((g) => {
                const groupMembers = (g.memberIds || [])
                  .map((id) => {
                    const member = allMembers.find((m) => m.id === id);
                    const position = g.memberPositions?.[id] || null;
                    return { member, position };
                  })
                  .filter((x) => x.member);

                return (
                  <Card key={g.id} className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.10)] hover:bg-[#1A2120] transition-all duration-200">
                    <CardContent className="p-5 flex flex-col justify-between h-full">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-semibold text-[15px] text-[#F1F0EE] truncate">{g.name}</h3>
                          <div className="text-[11px] bg-[#10B981]/10 text-[#10B981] px-2 py-0.5 rounded-full font-mono font-medium flex items-center gap-1 shrink-0">
                            <Users className="size-3" /> {g.memberIds?.length || 0}
                          </div>
                        </div>
                        {g.description && (
                          <p className="text-xs text-[#8A8A98] mt-2 font-light line-clamp-2 leading-relaxed">{g.description}</p>
                        )}

                        {groupMembers.length > 0 && (
                          <div className="mt-3 space-y-1">
                            {groupMembers.map(({ member, position }) => (
                              <div key={member!.id} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="text-[#C1C1C8] truncate">
                                  {member!.firstName} {member!.lastName}
                                </span>
                                {position ? (
                                  <span className="shrink-0 flex items-center gap-1 bg-[#10B981]/10 text-[#10B981] px-1.5 py-0.5 rounded text-[10px] font-medium">
                                    <ShieldCheck className="size-2.5" />
                                    {position}
                                  </span>
                                ) : (
                                  <span className="shrink-0 text-[10px] text-[#4A4A5A] italic">no position</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-6 flex gap-2 w-full pt-3 border-t border-white/[0.03]">
                        <Button
                          variant="outline"
                          className="flex-1 btn-premium-outline h-9 text-[12px] hover:cursor-pointer"
                          onClick={() => handleStartEdit(g)}
                        >
                          <Pencil className="size-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="destructive"
                          className="flex-1 btn-premium-danger h-9 text-[12px] hover:cursor-pointer"
                          onClick={() => handleDelete(g.id)}
                        >
                          <Trash2 className="size-3.5 mr-1" /> Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#131916] border border-[rgba(255,255,255,0.06)] rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-[#0C0F0E]/60">
                  <TableRow className="border-b border-[rgba(255,255,255,0.06)] hover:bg-transparent">
                    <TableHead className="type-table-head h-11 px-5">Group Name</TableHead>
                    <TableHead className="type-table-head h-11">Description</TableHead>
                    <TableHead className="type-table-head h-11">Members Count</TableHead>
                    <TableHead className="type-table-head h-11 text-right px-5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map((g) => (
                    <TableRow key={g.id} className="border-b border-[rgba(255,255,255,0.04)] hover:bg-white/[0.02] transition-colors">
                      <TableCell className="px-5 py-3.5 font-bold text-[14.5px] text-[#EEF2F0]">{g.name}</TableCell>
                      <TableCell className="type-table-body">{g.description || <span className="text-[#4A4A5A] italic">No description</span>}</TableCell>
                      <TableCell className="type-mono-value">
                        <span className="flex items-center gap-1.5">
                          <Users className="size-3.5 text-[#10B981] mr-1.5" />
                          {g.memberIds?.length || 0} members
                        </span>
                      </TableCell>
                      <TableCell className="text-right px-5 py-3 space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="btn-premium-outline h-8 text-xs hover:cursor-pointer"
                          onClick={() => handleStartEdit(g)}
                        >
                          <Pencil className="size-3 mr-1" /> Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="btn-premium-danger h-8 text-xs hover:cursor-pointer"
                          onClick={() => handleDelete(g.id)}
                        >
                          <Trash2 className="size-3 mr-1" /> Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
