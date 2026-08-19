import { useState } from "react";
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
import { AlertTriangle } from "lucide-react";

export type DeleteRelatedInfo = {
  label: string;
  count: number;
};

export type ConfirmDeleteRequest = {
  title: string;
  /** Entity name shown in the dialog body */
  entityName: string;
  /** Optional custom description message */
  description?: string;
  /** Related FK records that will cascade-delete */
  related?: DeleteRelatedInfo[];
  /** Named play schedules / trainings this member is linked to */
  scheduleNames?: string[];
  trainingNames?: string[];
  /** Optional extra warning line */
  warning?: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
};

type Props = {
  request: ConfirmDeleteRequest | null;
  onOpenChange: (open: boolean) => void;
};

function buildDescription(request: ConfirmDeleteRequest): string {
  if (request.description) {
    return request.description;
  }

  const related = (request.related ?? []).filter((r) => r.count > 0);
  if (related.length === 0) {
    return `Are you sure you want to delete “${request.entityName}”? This cannot be undone.`;
  }

  const parts = related.map((r) => `${r.count} ${r.label}`);
  const relatedText =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;

  return `You have ${relatedText} linked to “${request.entityName}”. Do you want to delete this? Related records will also be removed.`;
}

function NameList({ title, names }: { title: string; names: string[] }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, 6);
  const extra = names.length - shown.length;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-[#FBBF24]">
        {title} ({names.length})
      </p>
      <ul className="space-y-1">
        {shown.map((name) => (
          <li key={name} className="text-[12px] text-[#F1F0EE] truncate">
            · {name}
          </li>
        ))}
        {extra > 0 && (
          <li className="text-[11px] text-[#8A8A98]">· and {extra} more…</li>
        )}
      </ul>
    </div>
  );
}

export function ConfirmDeleteDialog({ request, onOpenChange }: Props) {
  const [busy, setBusy] = useState(false);
  const scheduleNames = request?.scheduleNames ?? [];
  const trainingNames = request?.trainingNames ?? [];
  const hasActivityLinks = scheduleNames.length > 0 || trainingNames.length > 0;

  return (
    <AlertDialog
      open={!!request}
      onOpenChange={(open) => {
        if (busy) return;
        onOpenChange(open);
      }}
    >
      <AlertDialogContent className="bg-[#131916] border-[rgba(255,255,255,0.10)] text-[#F1F0EE] max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-[#F1F0EE]">
            <AlertTriangle className="size-5 text-[#F59E0B]" />
            {request?.title ?? "Delete"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="text-[#8A8A98] text-left space-y-3">
              {request && <p className="text-[13px] leading-relaxed">{buildDescription(request)}</p>}

              {hasActivityLinks && (
                <div className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.10)] p-3 space-y-3">
                  <p className="text-[12px] font-medium text-[#FBBF24]">
                    This member is linked to active play schedules and/or trainings.
                    Deleting will remove their invitations and enrollments.
                  </p>
                  <NameList title="Play schedules" names={scheduleNames} />
                  <NameList title="Trainings" names={trainingNames} />
                </div>
              )}

              {request?.warning && (
                <p className="text-[12px] text-[#FBBF24]/90">{request.warning}</p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel
            disabled={busy}
            className="btn-premium-outline cursor-pointer mt-0"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="btn-premium-danger cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (e) => {
              e.preventDefault();
              if (!request) return;
              setBusy(true);
              try {
                await request.onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Deleting…" : request?.confirmLabel ?? "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
