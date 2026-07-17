import { useCallback, useEffect, useState } from "react";

export type ListViewMode = "grid" | "list";

/**
 * Force card/grid layout when the viewport is too narrow for wide tables.
 * Independent of the sidebar mobile breakpoint (768px).
 *
 * At ~937–1200px with an open sidebar, tables still overflow — so we switch
 * below 1280px (Tailwind xl), not only on phones.
 */
const FORCE_GRID_BREAKPOINT = 1280;

function useForceGridLayout() {
  const [forceGrid, setForceGrid] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${FORCE_GRID_BREAKPOINT - 1}px)`);
    const onChange = () => setForceGrid(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return forceGrid;
}

/**
 * Remembers the user's preferred view in localStorage.
 * Below 1280px, list tables overflow — force grid automatically.
 * Wider desktops keep the stored preference.
 */
export function useResponsiveViewMode(
  storageKey: string,
  defaultMode: ListViewMode = "list",
): {
  preferredMode: ListViewMode;
  viewMode: ListViewMode;
  setViewMode: (mode: ListViewMode) => void;
  /** True when viewport forces grid (list toggle disabled) */
  forceGrid: boolean;
  /** @deprecated alias of forceGrid — kept for existing call sites */
  isMobile: boolean;
} {
  const forceGrid = useForceGridLayout();
  const [preferredMode, setPreferredMode] = useState<ListViewMode>(() => {
    if (typeof window === "undefined") return defaultMode;
    const stored = localStorage.getItem(storageKey) as ListViewMode | null;
    return stored === "grid" || stored === "list" ? stored : defaultMode;
  });

  const setViewMode = useCallback(
    (mode: ListViewMode) => {
      setPreferredMode(mode);
      localStorage.setItem(storageKey, mode);
    },
    [storageKey],
  );

  return {
    preferredMode,
    viewMode: forceGrid ? "grid" : preferredMode,
    setViewMode,
    forceGrid,
    isMobile: forceGrid,
  };
}
