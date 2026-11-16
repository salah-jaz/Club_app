import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCurrentUser, useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Loader2, ShieldCheck, UserCheck } from "lucide-react";

export function ImpersonationBanner() {
  const isImpersonating = useStore((s) => s.isImpersonating);
  const impersonationAdmin = useStore((s) => s.impersonationAdmin);
  const currentUser = useCurrentUser();
  const exitLoginAs = useStore((s) => s.exitLoginAs);
  const navigate = useNavigate();
  const [isExiting, setIsExiting] = useState(false);

  if (!isImpersonating || !currentUser) {
    return null;
  }

  const memberName = `${currentUser.firstName} ${currentUser.lastName}`.trim();
  const adminLabel = impersonationAdmin?.adminName
    ? `by ${impersonationAdmin.adminName}`
    : "by Club Admin";

  const handleExit = async () => {
    if (isExiting) return;
    setIsExiting(true);
    try {
      const { returnPath } = await exitLoginAs();
      toast.success("Returned to Admin account");
      try {
        await navigate({ href: returnPath, replace: true } as never);
      } catch {
        await navigate({ to: "/members", replace: true });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to exit impersonation mode.";
      toast.error(message);
      setIsExiting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.aside
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        role="region"
        aria-label="Admin impersonation session active"
        className="relative z-30 w-full bg-primary text-primary-foreground border-b border-primary-foreground/15 shadow-sm"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-4">
          {/* Status info */}
          <div className="flex items-center gap-3 min-w-0 text-center sm:text-left">
            <div className="size-8 rounded-full bg-primary-foreground/15 border border-primary-foreground/20 flex items-center justify-center text-primary-foreground shrink-0">
              <UserCheck className="size-4.5" aria-hidden="true" />
            </div>
            <div className="min-w-0 text-xs sm:text-sm text-primary-foreground/90 leading-tight">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="font-semibold tracking-wider uppercase text-[10px] sm:text-[11px] bg-primary-foreground/20 border border-primary-foreground/25 px-2 py-0.5 rounded-full text-primary-foreground">
                  Impersonation Mode
                </span>
                <span className="text-primary-foreground">
                  Logged in as <strong className="font-bold underline decoration-primary-foreground/40">{memberName}</strong>
                </span>
                <span className="text-primary-foreground/75 text-[11px] sm:text-xs">
                  ({adminLabel})
                </span>
              </div>
            </div>
          </div>

          {/* Action button */}
          <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-center sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isExiting}
              onClick={handleExit}
              className="w-full sm:w-auto h-8 px-4 text-xs font-semibold bg-white text-primary hover:bg-white/90 active:bg-white/80 shadow-xs border border-white/40 cursor-pointer transition-all flex items-center justify-center gap-1.5 rounded-lg"
              aria-label="Exit Login As session and return to Admin portal"
            >
              {isExiting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  <span>Exiting...</span>
                </>
              ) : (
                <>
                  <LogOut className="size-3.5" aria-hidden="true" />
                  <span>Exit Login As</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
