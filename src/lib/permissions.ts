import { useStore } from "./store";

export function can(permission: string): boolean {
  const user = useStore.getState().currentUser;
  if (!user || user.role !== "admin") return false;
  if (user.isSuperAdmin) return true;
  return user.permissions?.includes(permission) ?? false;
}

export function canAny(...permissions: string[]): boolean {
  return permissions.some(can);
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
