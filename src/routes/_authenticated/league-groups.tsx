import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Users, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/league-groups")({
  component: LeagueGroupsPage,
});

function LeagueGroupsPage() {
  const store = useStore();
  const allMembers = useStore((s) => s.members);
  const members = allMembers.filter((m) => m.league && m.status === "active");
  const leagueGroups = useStore((s) => s.leagueGroups) || [];
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const handleStartCreate = () => {
    setName("");
    setDescription("");
    setSelectedMembers([]);
    setIsCreating(true);
    setEditingId(null);
  };

  const handleStartEdit = (group: any) => {
    setEditingId(group.id);
    setName(group.name);
    setDescription(group.description);
    setSelectedMembers(group.memberIds || []);
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

    try {
      if (isCreating) {
        await store.createLeagueGroup({ name, description, memberIds: selectedMembers });
        toast.success("League group created successfully");
      } else if (editingId) {
        await store.updateLeagueGroup(editingId, { name, description, memberIds: selectedMembers });
        toast.success("League group updated successfully");
      }
      setIsCreating(false);
      setEditingId(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to save league group");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this league group?")) {
      try {
        await store.deleteLeagueGroup(id);
        toast.success("League group deleted");
      } catch (error: any) {
        toast.error(error.message || "Failed to delete group");
      }
    }
  };

  const toggleMember = (memberId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    );
  };

  return (
    <div className="space-y-6">
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
                  <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase block mb-1">
                    Select Group Members
                  </Label>
                  {members.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground italic">No eligible league participants found in members.</p>
                  ) : (
                    <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-1">
                      {members.map((m) => (
                        <label
                          key={m.id}
                          className={`flex items-center gap-2.5 p-2 bg-[#1A2120] border rounded-lg cursor-pointer transition-all ${
                            selectedMembers.includes(m.id)
                              ? "border-[#10B981] bg-[#1A2120]/80"
                              : "border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]"
                          }`}
                        >
                          <Checkbox
                            checked={selectedMembers.includes(m.id)}
                            onCheckedChange={() => toggleMember(m.id)}
                            className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981]"
                          />
                          <div className="min-w-0">
                            <div className="font-medium text-[#F1F0EE] text-[13px] truncate">
                              {m.firstName} {m.lastName}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{m.grade}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={handleCancel} className="btn-premium-outline h-10 px-4 cursor-pointer">
                  <X className="size-4 mr-1.5" /> Cancel
                </Button>
                <Button type="submit" className="btn-premium-solid h-10 px-6 font-semibold cursor-pointer">
                  <Save className="size-4 mr-1.5" /> Save Group
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {leagueGroups.length === 0 ? (
            <Card className="border-[rgba(255,255,255,0.06)] bg-[#131916] sm:col-span-2 lg:col-span-3">
              <CardContent className="p-10 text-center text-[#8A8A98]">
                <div className="flex flex-col items-center justify-center gap-3">
                  <Users className="size-12 text-[#4A4A5A]" />
                  <h3 className="text-[14px] font-normal text-[#8A8A98]">No league groups created yet.</h3>
                  <p className="text-[12px] font-light text-[#4A4A5A] max-w-[280px]">
                    Create groups to target specific match invitations to a subset of players.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            leagueGroups.map((g) => (
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
                      className="flex-1 h-9 text-[12px] hover:cursor-pointer bg-red-950/40 border border-red-900/40 text-red-400 hover:bg-red-900/60 hover:text-red-200"
                      onClick={() => handleDelete(g.id)}
                    >
                      <Trash2 className="size-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
