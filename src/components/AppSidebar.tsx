import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Wallet, CalendarDays, GraduationCap,
  Inbox, Receipt, ShieldCheck, LogOut, User as UserIcon, Settings,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useCurrentUser, useStore } from "@/lib/store";
import { toast } from "sonner";

export function AppSidebar() {
  const user = useCurrentUser();
  const logout = useStore((s) => s.logout);
  const appName = useStore((s) => s.appName);
  const appLogoText = useStore((s) => s.appLogoText);
  const appLogoBase64 = useStore((s) => s.appLogoBase64);
  const activeRole = useStore((s) => s.activeRole) || user?.role;
  const setActiveRole = useStore((s) => s.setActiveRole);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { setOpenMobile, isMobile } = useSidebar();

  if (!user) return null;
  const isAdmin = activeRole === "admin";
  const isMember = activeRole === "member";
  const isVol = activeRole === "volunteer";

  const closeSidebarMobile = () => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const main = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/members", label: "Members", icon: Users, show: isMember || isAdmin },
    { to: "/credits", label: "Credits", icon: Wallet, show: isMember || isAdmin },
    { to: "/invitations", label: "My Invitations", icon: Inbox, show: isMember },
    { to: "/schedules", label: "Play Schedules", icon: CalendarDays, show: isAdmin },
    { to: "/league-groups", label: "League Groups", icon: Users, show: isAdmin },
    { to: "/trainings", label: "Trainings", icon: GraduationCap, show: isAdmin || isVol },
    { to: "/transactions", label: "Transactions", icon: Receipt, show: true },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-3 px-2 py-2">
          {appLogoBase64 ? (
            <img src={appLogoBase64} alt={appName} className="size-16 group-data-[collapsible=icon]:size-10 rounded-lg object-contain bg-white/5 transition-all duration-200" />
          ) : (
            <div className="size-16 group-data-[collapsible=icon]:size-10 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold text-xl transition-all duration-200">{appLogoText}</div>
          )}
          <div className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
            <span className="font-semibold">{appName}</span>
            <span className="text-[11px] text-muted-foreground capitalize">{activeRole}</span>
          </div>
        </div>
        {user.role === "admin" && (
          <div className="px-4 py-2 border-t border-b border-white/[0.03] group-data-[collapsible=icon]:hidden flex items-center justify-between text-xs">
            <span className="text-[#8A8A98]">Mode: <strong className="text-[#34D399] uppercase">{activeRole}</strong></span>
            <button
              onClick={() => {
                const nextRole = activeRole === "admin" ? "member" : "admin";
                setActiveRole(nextRole);
                toast.success(`Switched view to ${nextRole}`);
              }}
              className="px-2 py-1 bg-white/5 rounded border border-white/10 text-[10px] uppercase font-semibold text-[#10B981] hover:bg-white/10 cursor-pointer shrink-0"
            >
              Switch
            </button>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.filter((i) => i.show).map((i) => (
                <SidebarMenuItem key={i.to}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(i.to)}>
                    <Link to={i.to} onClick={closeSidebarMobile}><i.icon /><span>{i.label}</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/approvals")}>
                    <Link to="/approvals" onClick={closeSidebarMobile}><ShieldCheck /><span>Approvals</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/email-templates")}>
                    <Link to="/email-templates" onClick={closeSidebarMobile}><Inbox /><span>Email Templates</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/settings")}>
                    <Link to="/settings" onClick={closeSidebarMobile}><Settings /><span>Settings</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/profile" onClick={closeSidebarMobile}><UserIcon /><span>{user.firstName} {user.lastName}</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => { logout(); navigate({ to: "/login" }); closeSidebarMobile(); }}>
              <LogOut /><span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}