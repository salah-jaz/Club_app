import { motion } from "framer-motion";

export function ModuleLoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[380px] sm:min-h-[480px] w-full gap-5 py-16 text-center">
      <div className="relative flex items-center justify-center">
        <div
          className="pulse-ring absolute rounded-full border-2 border-primary/30"
          style={{ width: 64, height: 64 }}
        />
        <div
          className="pulse-ring absolute rounded-full border border-primary/15"
          style={{ width: 88, height: 88, animationDelay: "0.5s" }}
        />
        <div className="animate-spin size-8 rounded-full border-2 border-primary border-t-transparent shadow-sm" />
      </div>

      <div className="flex flex-col items-center gap-1">
        <div className="text-foreground/90 font-medium text-sm">Loading...</div>
        <div className="text-muted-foreground/60 font-light text-xs tracking-widest uppercase">
          Preparing page content
        </div>
      </div>
    </div>
  );
}
