import { useStore } from "./store";

const CRUD_ACTIONS = ["view", "create", "edit", "delete"] as const;

export const ADMIN_MODULE_BY_PATH: Record<string, string> = {
  dashboard: "dashboard",
  members: "members",
  credits: "credits",
  schedules: "schedules",
  trainings: "trainings",
  "league-groups": "league_groups",
  transactions: "transactions",
  approvals: "approvals",
  settings: "settings",
  "email-templates": "email_templates",
  "admin-management": "admin_management",
};

const ADMIN_HOME_ORDER = [
  "/dashboard",
  "/members",
  "/credits",
  "/schedules",
  "/league-groups",
  "/trainings",
  "/transactions",
  "/approvals",
  "/email-templates",
  "/settings",
  "/admin-management",
] as const;

function currentAdminUser() {
  const user = useStore.getState().currentUser;
  if (!user || user.role !== "admin") return null;
  return user;
}

export function can(permission: string): boolean {
  const user = currentAdminUser();
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return user.permissions?.includes(permission) ?? false;
}

export function canAny(...permissions: string[]): boolean {
  return permissions.some(can);
}

export function canModule(module: string): boolean {
  const user = currentAdminUser();
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const perms = user.permissions ?? [];
  return CRUD_ACTIONS.some((action) => perms.includes(`${module}.${action}`))
    || perms.some((p) => p.startsWith(`${module}.`));
}

export function useCan(permission: string): boolean {
  const user = useStore((s) => s.currentUser);
  if (!user || user.role !== "admin") return false;
  if (user.isSuperAdmin) return true;
  return user.permissions?.includes(permission) ?? false;
}

export function useCanAny(...permissions: string[]): boolean {
  const user = useStore((s) => s.currentUser);
  if (!user || user.role !== "admin") return false;
  if (user.isSuperAdmin) return true;
  return permissions.some((p) => user.permissions?.includes(p) ?? false);
}

export function useCanModule(module: string): boolean {
  const user = useStore((s) => s.currentUser);
  if (!user || user.role !== "admin") return false;
  if (user.isSuperAdmin) return true;
  const perms = user.permissions ?? [];
  return CRUD_ACTIONS.some((action) => perms.includes(`${module}.${action}`))
    || perms.some((p) => p.startsWith(`${module}.`));
}

export function moduleForPath(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean)[0] ?? "";
  return ADMIN_MODULE_BY_PATH[seg] ?? null;
}

export function firstAllowedAdminPath(): string {
  for (const path of ADMIN_HOME_ORDER) {
    const mod = moduleForPath(path);
    if (mod && canModule(mod)) return path;
  }
  return "/profile";
}

export function permissionActionLabel(action: string): string {
  if (action === "create") return "Add";
  return action.replace(/_/g, " ");
}
