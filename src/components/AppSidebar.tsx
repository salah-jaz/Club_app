import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Wallet, CalendarDays, GraduationCap,
  Inbox, Receipt, ShieldCheck, LogOut, User as UserIcon,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useCurrentUser, useStore } from "@/lib/store";

export function AppSidebar() {
  const user = useCurrentUser();
  const logout = useStore((s) => s.logout);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  if (!user) return null;
  const isAdmin = user.role === "admin";
  const isMember = user.role === "member";
  const isVol = user.role === "volunteer";

  const main = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/members", label: "Members", icon: Users, show: isMember || isAdmin },
    { to: "/credits", label: "Credits", icon: Wallet, show: isMember || isAdmin },
    { to: "/invitations", label: "My Invitations", icon: Inbox, show: isMember },
    { to: "/schedules", label: "Play Schedules", icon: CalendarDays, show: isAdmin },
    { to: "/trainings", label: "Trainings", icon: GraduationCap, show: isAdmin || isVol },
    { to: "/transactions", label: "Transactions", icon: Receipt, show: true },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold">C</div>
          <div className="flex flex-col leading-none">
            <span className="font-semibold">ClubApp</span>
            <span className="text-[11px] text-muted-foreground capitalize">{user.role}</span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.filter((i) => i.show).map((i) => (
                <SidebarMenuItem key={i.to}>
                  <SidebarMenuButton asChild isActive={pathname.startsWith(i.to)}>
                    <Link to={i.to}><i.icon /><span>{i.label}</span></Link>
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
                    <Link to="/approvals"><ShieldCheck /><span>Approvals</span></Link>
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
              <Link to="/profile"><UserIcon /><span>{user.firstName} {user.lastName}</span></Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => { logout(); navigate({ to: "/login" }); }}>
              <LogOut /><span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}