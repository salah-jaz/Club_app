import { useState, useMemo } from "react";
import type { LeagueGroup, Member } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Users, Check, Layers } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface LeagueGroupSelectorProps {
  selectedGroupIds: string[];
  onSelectionChange: (groupIds: string[]) => void;
  leagueGroups: LeagueGroup[];
  allMembers: Member[];
}

export function LeagueGroupSelector({
  selectedGroupIds,
  onSelectionChange,
  leagueGroups,
  allMembers,
}: LeagueGroupSelectorProps) {
  const [search, setSearch] = useState("");

  // Map memberId -> display name helper
  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of allMembers) {
      const full = `${m.firstName || ""} ${m.lastName || ""}`.trim();
      if (full) map.set(m.id, full);
    }
    for (const group of leagueGroups) {
      if (group.members) {
        for (const gm of group.members) {
          if (gm.id && !map.has(gm.id)) {
            const full = `${gm.firstName || ""} ${gm.lastName || ""}`.trim();
            if (full) map.set(gm.id, full);
          }
        }
      }
    }
    return map;
  }, [allMembers, leagueGroups]);

  const getMemberName = (id: string) => memberNameMap.get(id) || id;

  // Map memberId -> list of selected teams containing this member
  const memberSelectedTeamsMap = useMemo(() => {
    const map = new Map<string, LeagueGroup[]>();
    const selectedGroups = leagueGroups.filter((g) => selectedGroupIds.includes(g.id));
    for (const group of selectedGroups) {
      const ids = group.memberIds || group.members?.map((m) => m.id) || [];
      for (const mid of ids) {
        if (!mid) continue;
        const current = map.get(mid) || [];
        if (!current.some((g) => g.id === group.id)) {
          current.push(group);
          map.set(mid, current);
        }
      }
    }
    return map;
  }, [leagueGroups, selectedGroupIds]);

  // List of shared members across selected teams
  const sharedMembersInSelection = useMemo(() => {
    const result: { memberId: string; name: string; teamsStr: string }[] = [];
    memberSelectedTeamsMap.forEach((teams, mid) => {
      if (teams.length > 1) {
        result.push({
          memberId: mid,
          name: getMemberName(mid),
          teamsStr: teams.map((t) => t.name).join(" + "),
        });
      }
    });
    return result;
  }, [memberSelectedTeamsMap, memberNameMap]);

  // Total unique member count across selected teams
  const selectedUniqueCount = memberSelectedTeamsMap.size;

  // Filter groups by search query (team name or member name)
  const filteredGroups = useMemo(() => {
    if (!search.trim()) return leagueGroups;
    const q = search.toLowerCase();
    return leagueGroups.filter((g) => {
      if (g.name.toLowerCase().includes(q)) return true;
      const ids = g.memberIds || g.members?.map((m) => m.id) || [];
      return ids.some((mid) => getMemberName(mid).toLowerCase().includes(q));
    });
  }, [leagueGroups, search, memberNameMap]);

  const toggleSelectGroup = (groupId: string) => {
    if (selectedGroupIds.includes(groupId)) {
      onSelectionChange(selectedGroupIds.filter((id) => id !== groupId));
    } else {
      onSelectionChange([...selectedGroupIds, groupId]);
    }
  };

  const handleSelectAll = () => {
    onSelectionChange(leagueGroups.map((g) => g.id));
  };

  const handleDeselectAll = () => {
    onSelectionChange([]);
  };

  return (
    <div className="space-y-2.5">
      {/* Top Compact Bar: Search + Quick Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teams or members..."
            className="pl-8 h-8 bg-secondary border-border text-xs text-foreground focus:border-primary rounded-lg"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground">
            <strong className="text-primary font-mono">{selectedGroupIds.length}</strong> / {leagueGroups.length} selected
            {selectedGroupIds.length > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">({selectedUniqueCount} unique players)</span>
            )}
          </span>

          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSelectAll}
              className="h-7 text-[11px] text-primary hover:bg-primary/10 px-2 cursor-pointer"
            >
              Select All
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDeselectAll}
              className="h-7 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent px-2 cursor-pointer"
            >
              Deselect All
            </Button>
          </div>
        </div>
      </div>

      {/* Team Compact List Grid */}
      {leagueGroups.length === 0 ? (
        <div className="p-4 text-center rounded-lg bg-muted/50 border border-dashed border-border">
          <Users className="w-5 h-5 text-muted-foreground mx-auto mb-1 opacity-50" />
          <p className="text-xs text-muted-foreground">No league groups found.</p>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="p-4 text-center rounded-lg bg-muted/50 border border-dashed border-border">
          <p className="text-xs text-muted-foreground">No teams or members match "{search}".</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {filteredGroups.map((g) => {
            const isSelected = selectedGroupIds.includes(g.id);
            const memberIds = g.memberIds || g.members?.map((m) => m.id) || [];

            // Check if this group contains any member shared across selected teams
            const sharedCountInThisGroup = isSelected
              ? memberIds.filter((mid) => (memberSelectedTeamsMap.get(mid)?.length || 0) > 1).length
              : 0;

            return (
              <HoverCard key={g.id} openDelay={120} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <div
                    onClick={() => toggleSelectGroup(g.id)}
                    className={`flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                      isSelected
                        ? "bg-primary/10 border-primary/40 text-foreground shadow-[0_0_8px_color-mix(in_srgb,var(--primary)_12%,transparent)]"
                        : "bg-card border-border hover:bg-accent hover:border-primary/25 text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelectGroup(g.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="border-primary/40 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground w-4 h-4 cursor-pointer shrink-0"
                      />
                      <span className="font-semibold text-xs text-foreground truncate">
                        {g.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {sharedCountInThisGroup > 0 && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-primary"
                          title={`${sharedCountInThisGroup} shared player(s) in selection`}
                        />
                      )}
                      <Badge
                        variant="secondary"
                        className="bg-muted text-muted-foreground border-border text-[10px] px-1.5 py-0 font-mono"
                      >
                        {memberIds.length} {memberIds.length === 1 ? "member" : "members"}
                      </Badge>
                      {isSelected && <Check className="w-3.5 h-3.5 text-primary" />}
                    </div>
                  </div>
                </HoverCardTrigger>

                <HoverCardContent
                  align="start"
                  side="top"
                  className="z-50 w-72 bg-popover border border-border shadow-2xl rounded-xl p-3 text-xs text-popover-foreground"
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                    <span className="font-bold text-primary">{g.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {memberIds.length} member{memberIds.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {memberIds.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground italic">No members in this team</p>
                  ) : (
                    <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {memberIds.map((mid) => {
                        const name = getMemberName(mid);
                        const selectedTeams = memberSelectedTeamsMap.get(mid) || [];
                        const isShared = selectedTeams.length > 1 && selectedGroupIds.includes(g.id);
                        const sharedLabel = isShared
                          ? selectedTeams.map((t) => t.name).join(" + ")
                          : null;

                        return (
                          <li
                            key={mid}
                            className="flex items-center justify-between gap-2 text-[11px] py-1 border-b border-border last:border-0"
                          >
                            <span className="text-foreground font-medium truncate">{name}</span>
                            {isShared && (
                              <span className="text-[9px] font-semibold text-primary bg-primary/10 border border-primary/25 px-1.5 py-0.5 rounded shrink-0">
                                — {sharedLabel}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </HoverCardContent>
              </HoverCard>
            );
          })}
        </div>
      )}

      {/* Shared Members Compact Badge Indicator (when > 0 shared members exist in selection) */}
      {sharedMembersInSelection.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg bg-primary/10 border border-primary/25 text-xs">
          <div className="flex items-center gap-1 text-primary font-medium text-[11px] shrink-0">
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span>Shared:</span>
          </div>
          {sharedMembersInSelection.map((sm) => (
            <span
              key={sm.memberId}
              className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-background border border-primary/20 text-foreground"
            >
              <strong className="text-foreground mr-1">{sm.name}</strong> — {sm.teamsStr}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
