import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Desktop: always renders `desktop` (typically a Table).
 * Mobile: if `mobile` is provided, shows it below `md` and hides the table;
 * otherwise wraps the table in overflow-x-auto for horizontal scroll.
 */
export function ResponsiveTable({
  desktop,
  mobile,
  className,
}: {
  desktop: ReactNode;
  mobile?: ReactNode;
  className?: string;
}) {
  if (mobile) {
    return (
      <div className={cn("w-full min-w-0", className)}>
        <div className="md:hidden space-y-3">{mobile}</div>
        <div className="hidden md:block overflow-x-auto">{desktop}</div>
      </div>
    );
  }

  return (
    <div className={cn("w-full min-w-0 overflow-x-auto", className)}>{desktop}</div>
  );
}
