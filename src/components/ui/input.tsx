import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Base layout & typography
          "flex w-full rounded-lg px-3 py-2 text-sm",
          // Colors — visible input well (theme tokens)
          "bg-[var(--input-bg,#0A0D0C)] text-[var(--input-text,#EEF2F0)]",
          // Border — clearly visible (not rgba near-zero)
          "border border-[var(--input-border,rgba(255,255,255,0.13))]",
          // Height
          "h-10",
          // Placeholder
          "placeholder:text-[var(--input-placeholder,#6B8580)] placeholder:font-normal",
          // Focus
          "focus-visible:outline-none focus-visible:border-[#10B981] focus-visible:ring-2 focus-visible:ring-[rgba(16,185,129,0.15)]",
          // File input
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          // Transitions
          "transition-colors duration-150",
          // Disabled
          "disabled:cursor-not-allowed disabled:opacity-40 disabled:bg-[var(--bg-elevated,#1A2120)]",
          // Shadow
          "shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)]",
          // Autofill-friendly marker (styles.css uses theme vars)
          "auth-input",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
