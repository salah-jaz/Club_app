import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, Wallet, CalendarDays, GraduationCap,
  Inbox, Receipt, ShieldCheck, LogOut, User as UserIcon, Settings, UserCog,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useCurrentUser, useStore } from "@/lib/store";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

export function AppSidebar() {
  const user = useCurrentUser();
  const logout = useStore((s) => s.logout);
  const appName = useStore((s) => s.appName);
  const appLogoText = useStore((s) => s.appLogoText);
  const appLogoBase64 = useStore((s) => s.appLogoBase64);
  const activeRole = useStore((s) => s.activeRole) || user?.role;
  const setActiveRole = useStore((s) => s.setActiveRole);
  const navigate = useNavigate();
  const syncData = useStore((s) => s.syncData);
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

  /** Soft navigate; sync when staying in the same module (e.g. /members/add → /members).
   *  Cross-module switches are synced by the authenticated layout. */
  const goToModule = (to: string) => {
    closeSidebarMobile();
    const sameModule = pathname === to || pathname.startsWith(`${to}/`);
    void (async () => {
      await navigate({ to });
      if (sameModule) await syncData();
    })();
  };

  const main = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: true },
    { to: "/members", label: "Members", icon: Users, show: isMember || isAdmin },
    { to: "/credits", label: "Credit / Debit", icon: Wallet, show: isMember || isAdmin },
    { to: "/invitations", label: "My Invitations", icon: Inbox, show: isMember },
    { to: "/schedules", label: "Play Schedules", icon: CalendarDays, show: isAdmin },
    { to: "/league-groups", label: "League Groups", icon: Users, show: isAdmin || isMember },
    { to: "/trainings", label: "Trainings", icon: GraduationCap, show: isAdmin || isVol },
    { to: "/transactions", label: "Transactions", icon: Receipt, show: true },
  ];

  const adminItems = [
    { to: "/approvals", label: "Approvals", icon: ShieldCheck },
    { to: "/email-templates", label: "Email Templates", icon: Inbox },
    { to: "/settings", label: "Settings", icon: Settings },
    { to: "/admin-management", label: "Club Admin", icon: UserCog },
  ];

  // Find the active item key for the layout animation
  const activeMainItem = main.filter((i) => i.show).find((i) => pathname.startsWith(i.to));
  const activeAdminItem = adminItems.find((i) => pathname.startsWith(i.to));

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
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {main.filter((i) => i.show).map((i) => {
                const isActive = pathname.startsWith(i.to);
                return (
                  <SidebarMenuItem key={i.to} className="relative">
                    {/* Sliding active pill — Framer Motion layout animation */}
                    <AnimatePresence>
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-main-pill"
                          className="absolute inset-0 rounded-[10px] bg-[rgba(16,185,129,0.10)] border border-[rgba(16,185,129,0.30)] pointer-events-none"
                          style={{ margin: "2px 10px" }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                        />
                      )}
                    </AnimatePresence>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link
                        to={i.to}
                        onClick={(e) => {
                          e.preventDefault();
                          goToModule(i.to);
                        }}
                      >
                        <motion.span
                          whileHover={{ scale: 1.15, rotate: 5 }}
                          whileTap={{ scale: 0.9 }}
                          transition={{ duration: 0.15 }}
                          className="inline-flex"
                        >
                          <i.icon />
                        </motion.span>
                        <span>{i.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((i) => {
                  const isActive = pathname.startsWith(i.to);
                  return (
                    <SidebarMenuItem key={i.to} className="relative">
                      <AnimatePresence>
                        {isActive && (
                          <motion.div
                            layoutId="sidebar-admin-pill"
                            className="absolute inset-0 rounded-[10px] bg-[rgba(16,185,129,0.10)] border border-[rgba(16,185,129,0.30)] pointer-events-none"
                            style={{ margin: "2px 10px" }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                          />
                        )}
                      </AnimatePresence>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link
                          to={i.to}
                          onClick={(e) => {
                            e.preventDefault();
                            goToModule(i.to);
                          }}
                        >
                          <motion.span
                            whileHover={{ scale: 1.15, rotate: 5 }}
                            whileTap={{ scale: 0.9 }}
                            transition={{ duration: 0.15 }}
                            className="inline-flex"
                          >
                            <i.icon />
                          </motion.span>
                          <span>{i.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/profile" onClick={closeSidebarMobile}>
                <motion.span whileHover={{ scale: 1.15 }} transition={{ duration: 0.15 }} className="inline-flex">
                  <UserIcon />
                </motion.span>
                <span>{user.firstName} {user.lastName}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => { logout(); navigate({ to: "/login" }); closeSidebarMobile(); }}
            >
              <motion.span whileHover={{ scale: 1.15, x: -2 }} transition={{ duration: 0.15 }} className="inline-flex">
                <LogOut />
              </motion.span>
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}