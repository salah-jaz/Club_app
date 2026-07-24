import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useCurrentUser, useStore } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Shield, Key, Eye, EyeOff, RotateCcw } from "lucide-react";
import { EmptyIllustration } from "@/components/EmptyIllustration";
import type { AdminRole, Permission, User } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin-management")({
  component: AdminManagement,
});

function BtnSpinner() {
  return (
    <svg className="animate-spin size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

/* ──────────────────── Permission Matrix ──────────────────── */

function PermissionMatrix({
  allPermissions,
  selected,
  onChange,
  disabled,
}: {
  allPermissions: Permission[];
  selected: Set<string>;
  onChange: (ids: Set<string>) => void;
  disabled?: boolean;
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of allPermissions) {
      const moduleKey = p.module ?? "other";
      const arr = map.get(moduleKey) || [];
      arr.push(p);
      map.set(moduleKey, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [allPermissions]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const toggleModule = (perms: Permission[]) => {
    const allSelected = perms.every((p) => selected.has(p.id));
    const next = new Set(selected);
    for (const p of perms) {
      if (allSelected) next.delete(p.id);
      else next.add(p.id);
    }
    onChange(next);
  };

  const toggleAll = () => {
    if (selected.size === allPermissions.length) {
      onChange(new Set());
    } else {
      onChange(new Set(allPermissions.map((p) => p.id)));
    }
  };

  const moduleLabel = (m: string) =>
    m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#8A8A98]">
          {selected.size} of {allPermissions.length} permissions
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-[11px] text-[#34D399] hover:bg-white/5 cursor-pointer"
          onClick={toggleAll}
          disabled={disabled}
        >
          {selected.size === allPermissions.length ? "Deselect all" : "Select all"}
        </Button>
      </div>
      <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
        {grouped.map(([module, perms]) => {
          const allChecked = perms.every((p) => selected.has(p.id));
          const someChecked = perms.some((p) => selected.has(p.id));
          return (
            <Card key={module} className="bg-[#0C0F0E] border-[rgba(255,255,255,0.06)]">
              <div className="flex items-center gap-2.5 px-3 py-2 border-b border-white/[0.04]">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={() => toggleModule(perms)}
                  disabled={disabled}
                  className="border-[rgba(255,255,255,0.2)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981]"
                />
                <span className="text-[12px] font-semibold text-[#F1F0EE] tracking-wide">
                  {moduleLabel(module)}
                </span>
                <Badge variant="secondary" className="ml-auto text-[10px] h-5 bg-white/5 text-[#8A8A98]">
                  {perms.filter((p) => selected.has(p.id)).length}/{perms.length}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 px-3 py-2">
                {perms.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer group py-0.5">
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggle(p.id)}
                      disabled={disabled}
                      className="border-[rgba(255,255,255,0.15)] data-[state=checked]:bg-[#10B981] data-[state=checked]:border-[#10B981]"
                    />
                    <span className="text-[11px] text-[#C4D4CF] group-hover:text-[#F1F0EE] transition-colors capitalize">
                      {(p.action ?? p.label ?? p.id).replace(/_/g, " ")}
                    </span>
                  </label>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ──────────────────── Role Form Dialog ──────────────────── */

function RoleFormDialog({
  open,
  onOpenChange,
  role,
  allPermissions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  role: AdminRole | null;
  allPermissions: Permission[];
}) {
  const s = useStore();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const isEdit = !!role;
  const isSuperRole = role?.isSuper ?? false;

  useEffect(() => {
    if (open) {
      setName(role?.name ?? "");
      setDesc(role?.description ?? "");
      setPerms(new Set(role?.permissionIds ?? []));
    }
  }, [open, role]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Role name is required"); return; }
    setSaving(true);
    try {
      if (isEdit) {
        await s.updateAdminRole(role!.id, { name: name.trim(), description: desc.trim() || undefined, permissionIds: [...perms] });
        toast.success("Role updated");
      } else {
        await s.createAdminRole({ name: name.trim(), description: desc.trim() || undefined, permissionIds: [...perms] });
        toast.success("Role created");
      }
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#F1F0EE]">{isEdit ? "Edit role" : "Create role"}</DialogTitle>
          <DialogDescription className="text-[#8A8A98]">
            {isEdit ? "Update role name and permissions." : "Define a new admin role with specific permissions."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Role Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Schedule Coordinator"
                disabled={isSuperRole}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Description</Label>
              <Input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Optional description"
                disabled={isSuperRole}
                className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg"
              />
            </div>
          </div>
          {isSuperRole ? (
            <div className="text-xs text-[#F59E0B] bg-[#F59E0B]/10 border border-[#F59E0B]/20 px-3 py-2 rounded-lg">
              Super Admin role has all permissions and cannot be modified.
            </div>
          ) : (
            <div>
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase mb-2 block">
                Permissions
              </Label>
              <PermissionMatrix allPermissions={allPermissions} selected={perms} onChange={setPerms} />
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="btn-premium-outline cursor-pointer" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          {!isSuperRole && (
            <Button className="btn-premium-solid cursor-pointer" onClick={handleSave} disabled={saving}>
              {saving ? <BtnSpinner /> : null}
              {isEdit ? "Save changes" : "Create role"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────── Admin User Form Dialog ──────────────────── */

function AdminUserFormDialog({
  open,
  onOpenChange,
  adminUser,
  roles,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  adminUser: User | null;
  roles: AdminRole[];
}) {
  const s = useStore();
  const currentUser = useCurrentUser();
  const isEdit = !!adminUser;

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [roleId, setRoleId] = useState("");
  const [saving, setSaving] = useState(false);

  const assignableRoles = useMemo(() => {
    if (currentUser?.isSuperAdmin) return roles;
    return roles.filter((r) => !r.isSuper);
  }, [roles, currentUser]);

  useEffect(() => {
    if (open) {
      setFirstName(adminUser?.firstName ?? "");
      setLastName(adminUser?.lastName ?? "");
      setEmail(adminUser?.email ?? "");
      setMobile(adminUser?.mobile ?? "");
      setPassword("");
      setShowPw(false);
      setRoleId(adminUser?.adminRoleId ?? roles.find((r) => !r.isSuper)?.id ?? "");
    }
  }, [open, adminUser, roles]);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    if (!isEdit && !password) {
      toast.error("Password is required for new admin");
      return;
    }
    if (!roleId) {
      toast.error("Please select a role");
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await s.updateAdminUser(adminUser!.id, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          mobile: mobile.trim() || undefined,
          adminRoleId: roleId,
        });
        toast.success("Admin user updated");
      } else {
        await s.createAdminUser({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          password,
          mobile: mobile.trim() || undefined,
          adminRoleId: roleId,
        });
        toast.success("Admin user created");
      }
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[#F1F0EE]">{isEdit ? "Edit admin" : "Create admin"}</DialogTitle>
          <DialogDescription className="text-[#8A8A98]">
            {isEdit ? "Update this admin account." : "Create a new admin with a specific role."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">First Name</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Last Name</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Mobile (optional)</Label>
            <Input value={mobile} onChange={(e) => setMobile(e.target.value)} className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg" />
          </div>
          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Password</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg pr-9"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-[#F1F0EE] cursor-pointer"
                  onClick={() => setShowPw(!showPw)}
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">Admin Role</Label>
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] text-[#F1F0EE] rounded-lg cursor-pointer">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent className="bg-[#1A2120] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
                {assignableRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id} className="cursor-pointer hover:bg-white/5">
                    {r.name}
                    {r.isSuper && " ⚡"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="btn-premium-outline cursor-pointer" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="btn-premium-solid cursor-pointer" onClick={handleSave} disabled={saving}>
            {saving ? <BtnSpinner /> : null}
            {isEdit ? "Save changes" : "Create admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────── Reset Password Dialog ──────────────────── */

function ResetPasswordDialog({
  open,
  onOpenChange,
  adminUser,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  adminUser: User | null;
}) {
  const s = useStore();
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setPw(""); setShowPw(false); }
  }, [open]);

  const handleSave = async () => {
    if (pw.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setSaving(true);
    try {
      await s.resetAdminPassword(adminUser!.id, pw);
      toast.success("Password reset successfully");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to reset password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[#F1F0EE]">Reset password</DialogTitle>
          <DialogDescription className="text-[#8A8A98]">
            Set a new password for {adminUser?.firstName} {adminUser?.lastName}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <Label className="text-[10px] font-medium tracking-[0.1em] text-[#8A8A98] uppercase">New Password</Label>
          <div className="relative">
            <Input
              type={showPw ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              className="bg-[#1A2120] border-[rgba(255,255,255,0.06)] focus:border-[#10B981] text-[#F1F0EE] rounded-lg pr-9"
            />
            <button
              type="button"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8A98] hover:text-[#F1F0EE] cursor-pointer"
              onClick={() => setShowPw(!showPw)}
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="btn-premium-outline cursor-pointer" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button className="btn-premium-solid cursor-pointer" onClick={handleSave} disabled={saving}>
            {saving ? <BtnSpinner /> : null}
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────────── Main Page ──────────────────── */

function AdminManagement() {
  const user = useCurrentUser()!;
  const s = useStore();
  const { adminRoles, allPermissions, adminUsers } = s;

  useEffect(() => {
    s.fetchAdminRoles();
    s.fetchAllPermissions();
    s.fetchAdminUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Role dialogs
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [editRole, setEditRole] = useState<AdminRole | null>(null);
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<AdminRole | null>(null);
  const [deletingRole, setDeletingRole] = useState(false);

  // User dialogs
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [resetPwTarget, setResetPwTarget] = useState<User | null>(null);

  const openCreateRole = () => { setEditRole(null); setRoleDialogOpen(true); };
  const openEditRole = (r: AdminRole) => { setEditRole(r); setRoleDialogOpen(true); };
  const openCreateUser = () => { setEditUser(null); setUserDialogOpen(true); };
  const openEditUser = (u: User) => { setEditUser(u); setUserDialogOpen(true); };

  const handleDeleteRole = async () => {
    if (!deleteRoleTarget) return;
    setDeletingRole(true);
    try {
      await s.deleteAdminRole(deleteRoleTarget.id);
      toast.success("Role deleted");
      setDeleteRoleTarget(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete role");
    } finally {
      setDeletingRole(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserTarget) return;
    setDeletingUser(true);
    try {
      await s.deleteAdminUser(deleteUserTarget.id);
      toast.success("Admin deleted");
      setDeleteUserTarget(null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete admin");
    } finally {
      setDeletingUser(false);
    }
  };

  const roleById = useMemo(() => {
    const m = new Map<string, AdminRole>();
    for (const r of adminRoles) m.set(r.id, r);
    return m;
  }, [adminRoles]);

  if (user.role !== "admin") return <Navigate to="/dashboard" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Club Admin"
        description="Manage admin accounts and roles with granular permissions."
      />

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="bg-[#131916] border border-[rgba(255,255,255,0.06)] p-1 rounded-lg inline-flex mb-6 h-auto min-h-10 max-w-full overflow-x-auto flex-wrap sm:flex-nowrap gap-1">
          <TabsTrigger
            value="users"
            className="text-[13px] font-medium px-3 sm:px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all whitespace-nowrap"
          >
            Admin Users ({adminUsers.length})
          </TabsTrigger>
          <TabsTrigger
            value="roles"
            className="text-[13px] font-medium px-3 sm:px-4 py-1.5 rounded-md cursor-pointer text-[#8A8A98] data-[state=active]:bg-[#1A2120] data-[state=active]:text-[#F1F0EE] transition-all whitespace-nowrap"
          >
            Roles ({adminRoles.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Admin Users Tab ── */}
        <TabsContent value="users" className="focus-visible:outline-none">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-semibold text-[#F1F0EE]">Admin Accounts</h2>
            <Button size="sm" className="btn-premium-solid h-8 px-3 text-xs cursor-pointer" onClick={openCreateUser}>
              <Plus className="size-3.5 mr-1.5" /> Add admin
            </Button>
          </div>
          {adminUsers.length === 0 ? (
            <EmptyIllustration title="No admin users found" description="Create an admin user to get started." />
          ) : (
            <Card className="bg-[#131916] border-[rgba(255,255,255,0.06)] overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-white/[0.04] hover:bg-transparent">
                      <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase px-5 py-3">Name</TableHead>
                      <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase px-5 py-3">Email</TableHead>
                      <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase px-5 py-3">Role</TableHead>
                      <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase px-5 py-3">Status</TableHead>
                      <TableHead className="text-[10px] font-medium tracking-[0.12em] text-[#8A8A98] uppercase px-5 py-3 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adminUsers.map((au) => {
                      const role = au.adminRoleId ? roleById.get(au.adminRoleId) : null;
                      const isSelf = au.id === user.id;
                      return (
                        <TableRow key={au.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <TableCell className="px-5 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="size-8 rounded-full bg-[#10B981]/15 text-[#34D399] grid place-items-center text-[11px] font-bold shrink-0">
                                {au.firstName?.[0]}{au.lastName?.[0]}
                              </div>
                              <div>
                                <div className="text-[13px] font-semibold text-[#F1F0EE]">
                                  {au.firstName} {au.lastName}
                                  {isSelf && <span className="text-[10px] text-[#8A8A98] ml-1.5">(you)</span>}
                                </div>
                                {au.isSuperAdmin && (
                                  <span className="text-[10px] text-[#F59E0B] font-medium">Super Admin</span>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-5 py-3 text-[12px] text-[#C4D4CF]">{au.email}</TableCell>
                          <TableCell className="px-5 py-3">
                            <Badge variant="secondary" className="text-[10px] bg-[#10B981]/10 text-[#34D399] border-[#10B981]/20">
                              {au.adminRoleName ?? role?.name ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-5 py-3">
                            <Badge variant="secondary" className={cn(
                              "text-[10px]",
                              au.status === "active" ? "bg-[#10B981]/10 text-[#34D399]" : "bg-[#EF4444]/10 text-[#EF4444]"
                            )}>
                              {au.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-5 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-[#8A8A98] hover:text-[#F1F0EE] hover:bg-white/5 cursor-pointer"
                                onClick={() => openEditUser(au)}
                                title="Edit"
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-[#8A8A98] hover:text-[#F1F0EE] hover:bg-white/5 cursor-pointer"
                                onClick={() => setResetPwTarget(au)}
                                title="Reset password"
                              >
                                <RotateCcw className="size-3.5" />
                              </Button>
                              {!isSelf && !au.isSuperAdmin && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10 cursor-pointer"
                                  onClick={() => setDeleteUserTarget(au)}
                                  title="Delete"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ── Roles Tab ── */}
        <TabsContent value="roles" className="focus-visible:outline-none">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-semibold text-[#F1F0EE]">Admin Roles</h2>
            <Button size="sm" className="btn-premium-solid h-8 px-3 text-xs cursor-pointer" onClick={openCreateRole}>
              <Plus className="size-3.5 mr-1.5" /> Add role
            </Button>
          </div>
          {adminRoles.length === 0 ? (
            <EmptyIllustration title="No roles found" description="Create an admin role to get started." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {adminRoles.map((r) => (
                <Card key={r.id} className="bg-[#131916] border-[rgba(255,255,255,0.06)] hover:border-[#10B981]/20 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={cn(
                          "size-9 rounded-lg grid place-items-center shrink-0",
                          r.isSuper ? "bg-[#F59E0B]/15 text-[#F59E0B]" : "bg-[#10B981]/15 text-[#34D399]"
                        )}>
                          {r.isSuper ? <Shield className="size-4" /> : <Key className="size-4" />}
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-[14px] font-semibold text-[#F1F0EE] truncate">{r.name}</CardTitle>
                          {r.description && (
                            <p className="text-[11px] text-[#8A8A98] mt-0.5 line-clamp-1">{r.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!r.isSuper && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[#8A8A98] hover:text-[#F1F0EE] hover:bg-white/5 cursor-pointer"
                            onClick={() => openEditRole(r)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        )}
                        {!r.isSystem && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-[#EF4444] hover:text-[#EF4444] hover:bg-[#EF4444]/10 cursor-pointer"
                            onClick={() => setDeleteRoleTarget(r)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-2">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="text-[10px] bg-white/5 text-[#8A8A98]">
                        {r.isSuper ? "All" : r.permissionIds.length} permissions
                      </Badge>
                      {r.isSystem && (
                        <Badge variant="secondary" className="text-[10px] bg-[#3B82F6]/10 text-[#60A5FA]">
                          System
                        </Badge>
                      )}
                      {r.userCount !== undefined && r.userCount > 0 && (
                        <span className="text-[10px] text-[#8A8A98]">
                          {r.userCount} user{r.userCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <RoleFormDialog
        open={roleDialogOpen}
        onOpenChange={setRoleDialogOpen}
        role={editRole}
        allPermissions={allPermissions}
      />

      <AdminUserFormDialog
        open={userDialogOpen}
        onOpenChange={setUserDialogOpen}
        adminUser={editUser}
        roles={adminRoles}
      />

      <ResetPasswordDialog
        open={!!resetPwTarget}
        onOpenChange={(o) => !o && setResetPwTarget(null)}
        adminUser={resetPwTarget}
      />

      {/* Delete Role Confirm */}
      <AlertDialog open={!!deleteRoleTarget} onOpenChange={(o) => !o && setDeleteRoleTarget(null)}>
        <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#F1F0EE]">Delete role?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#C4D4CF]">
              Delete <strong className="text-[#F1F0EE]">{deleteRoleTarget?.name}</strong>? Admin users assigned to this role will need a new role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="btn-premium-outline cursor-pointer" disabled={deletingRole}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white cursor-pointer"
              disabled={deletingRole}
              onClick={(e) => { e.preventDefault(); void handleDeleteRole(); }}
            >
              {deletingRole ? "Deleting…" : "Delete role"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete User Confirm */}
      <AlertDialog open={!!deleteUserTarget} onOpenChange={(o) => !o && setDeleteUserTarget(null)}>
        <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#F1F0EE]">Delete admin?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#C4D4CF]">
              Remove admin access for <strong className="text-[#F1F0EE]">{deleteUserTarget?.firstName} {deleteUserTarget?.lastName}</strong>?
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="btn-premium-outline cursor-pointer" disabled={deletingUser}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#EF4444] hover:bg-[#DC2626] text-white cursor-pointer"
              disabled={deletingUser}
              onClick={(e) => { e.preventDefault(); void handleDeleteUser(); }}
            >
              {deletingUser ? "Deleting…" : "Delete admin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
