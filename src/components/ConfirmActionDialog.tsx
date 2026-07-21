import { useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export type ConfirmActionRequest = {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use destructive styling for irreversible / closing actions */
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
};

type Props = {
  request: ConfirmActionRequest | null;
  onOpenChange: (open: boolean) => void;
};

export function ConfirmActionDialog({ request, onOpenChange }: Props) {
  const [busy, setBusy] = useState(false);

  return (
    <AlertDialog
      open={!!request}
      onOpenChange={(open) => {
        if (busy) return;
        onOpenChange(open);
      }}
    >
      <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[#F1F0EE]">
            {request?.title ?? "Confirm"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-[#C4D4CF] text-sm space-y-2 text-left">
              {request?.description}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="btn-premium-outline cursor-pointer mt-0" disabled={busy}>
            {request?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn(
              "cursor-pointer",
              request?.destructive
                ? "bg-[#EF4444] hover:bg-[#DC2626] text-white"
                : "btn-premium-solid",
            )}
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              if (!request) return;
              void (async () => {
                setBusy(true);
                try {
                  await request.onConfirm();
                  onOpenChange(false);
                } catch {
                  // Caller shows toast; keep dialog open
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {busy ? "Please wait…" : (request?.confirmLabel ?? "Confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
