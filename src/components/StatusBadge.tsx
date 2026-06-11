import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const map: Record<string, string> = {
  active: "bg-[#2DD4BF]/10 text-[#2DD4BF] border-[#2DD4BF]/20",
  approved: "bg-[#2DD4BF]/10 text-[#2DD4BF] border-[#2DD4BF]/20",
  accepted: "bg-[#2DD4BF]/10 text-[#2DD4BF] border-[#2DD4BF]/20",
  rotated: "bg-[#2DD4BF]/10 text-[#2DD4BF] border-[#2DD4BF]/20",
  released: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
  open: "bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20",
  created: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
  waiting: "bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20",
  declined: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20",
  rejected: "bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]/20",
  disabled: "bg-white/5 text-[#8A8A9A] border-white/10",
  closed: "bg-white/5 text-[#8A8A9A] border-white/10",
};

export function StatusBadge({ status }: { status: string }) {
  const displayText = status === "created" ? "pending" : status;
  return (
    <Badge variant="outline" className={cn("capitalize font-medium", map[status] ?? "")}>
      {displayText}
    </Badge>
  );
}