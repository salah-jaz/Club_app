import type { ReactNode } from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/store";
import { ArrowLeft } from "lucide-react";

export function PageHeader({
  title, description, actions, eyebrow: customEyebrow, backTo,
}: { title: string; description?: string; actions?: ReactNode; eyebrow?: string; backTo?: string }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const user = useCurrentUser();

  // Resolve dynamic eyebrow based on route
  const getEyebrow = () => {
    if (customEyebrow) return customEyebrow;
    const path = pathname.split("/").filter(Boolean)[0] || "dashboard";
    const role = user?.role?.toUpperCase() || "ADMIN";

    switch (path) {
      case "dashboard":
        return `${role} / OVERVIEW`;
      case "members":
        return "CLUB / ROSTER";
      case "credits":
        return "FINANCE / CREDITS";
      case "invitations":
      case "schedules":
        return "SESSIONS / PLAY";
      case "trainings":
        return "PROGRAMS / TRAINING";
      case "transactions":
        return "FINANCE / HISTORY";
      case "approvals":
        return "ADMIN / APPROVALS";
      default:
        return `${role} / PORTAL`;
    }
  };

  return (
    <div className="mb-6 w-full">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[10px] font-medium tracking-[0.14em] text-[#10B981] uppercase block mb-2">
            {getEyebrow()}
          </span>
          <div className="flex items-center gap-3">
            {backTo && (
              <Link 
                to={backTo} 
                className="flex items-center justify-center size-8 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-[#1A2120] hover:border-border/80 transition-all cursor-pointer shrink-0"
                title="Go back"
              >
                <ArrowLeft className="size-4" />
              </Link>
            )}
            <h1 className="text-28 font-playfair font-normal leading-normal text-[#F1F0EE]">
              {title}
            </h1>
          </div>
          {description && (
            <p className="text-[14px] font-light text-[#8A8A9A] mt-1">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3 self-start md:self-end">{actions}</div>}
      </div>
      <div className="signature-divider mt-5 mb-5" />
    </div>
  );
}