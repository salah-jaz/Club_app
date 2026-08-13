import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  active: "bg-[#2DD4BF]/10 text-[#2DD4BF] border-[#2DD4BF]/20",
  approved: "bg-[#2DD4BF]/10 text-[#2DD4BF] border-[#2DD4BF]/20",
  accepted: "bg-[#2DD4BF]/10 text-[#2DD4BF] border-[#2DD4BF]/20",
  rotated: "bg-[#2DD4BF]/10 text-[#2DD4BF] border-[#2DD4BF]/20",
  published: "bg-[#818CF8]/10 text-[#A5B4FC] border-[#818CF8]/20",
  released: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
  open: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
  created: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
  pending: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
  waiting: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
  declined: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20",
  rejected: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20",
  cancelled: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20",
  disabled: "bg-white/5 text-[#8A8A9A] border-white/10",
  closed: "bg-white/5 text-[#8A8A9A] border-white/10",
  in_progress: "bg-[#F59E0B]/10 text-[#FBBF24] border-[#F59E0B]/20",
  finished: "bg-white/5 text-[#8A8A98] border-white/10",
};

type StatusKind = "default" | "invitation";

function labelFor(status: string, kind: StatusKind): string {
  if (status === "cancelled") return "Cancelled";
  if (status === "created") return "pending";
  if (status === "pending") return "Pending";
  if (status === "waiting") return "Waiting list";
  if (status === "in_progress") return "In Progress";
  if (status === "finished") return "Finished";
  // Invitation "open" = member has not responded yet.
  // Schedule/training "open" = created but not released.
  if (status === "open") return kind === "invitation" ? "Yet to accept" : "Open";
  return status;
}

export function StatusBadge({
  status,
  kind = "default",
}: {
  status: string;
  kind?: StatusKind;
}) {
  return (
    <Badge variant="outline" className={cn("capitalize font-medium", map[status] ?? "")}>
      {labelFor(status, kind)}
    </Badge>
  );
}
