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
        return "FINANCE / WALLET";
      case "events":
      case "invitations":
      case "schedules":
        return "SESSIONS / PLAY";
      case "trainings":
        return "PROGRAMS / TRAINING";
      case "transactions":
        return "FINANCE / HISTORY";
      case "approvals":
        return "ADMIN / APPROVALS";
      case "admin-management":
        return "ADMIN / MANAGEMENT";
      default:
        return `${role} / PORTAL`;
    }
  };

  return (
    <div className="mb-6 w-full min-w-0">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 min-w-0">
        <div className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold tracking-[0.12em] text-[#10B981] uppercase block mb-1.5">
            {getEyebrow()}
          </span>
          <div className="flex items-center gap-3 min-w-0">
            {backTo && (
              <Link 
                to={backTo} 
                className="flex items-center justify-center size-8 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-[#1A2120] hover:border-border/80 transition-all cursor-pointer shrink-0"
                title="Go back"
              >
                <ArrowLeft className="size-4" />
              </Link>
            )}
            <h1 className="type-page-title min-w-0 truncate">
              {title}
            </h1>
          </div>
          {description && (
            <p className="text-[14px] font-normal text-[#C4D4CF] mt-1.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full md:w-auto md:max-w-[min(100%,28rem)] lg:max-w-none self-stretch md:self-start min-w-0 justify-start md:justify-end">
            {actions}
          </div>
        )}
      </div>
      <div className="signature-divider mt-5 mb-5" />
    </div>
  );
}