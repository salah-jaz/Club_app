import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Wallet,
  CalendarDays,
  GraduationCap,
  Receipt,
  User as UserIcon,
  MoreHorizontal,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Inbox,
  Settings,
  UserCog,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrentUser, useStore } from "@/lib/store";
import { useCanModule } from "@/lib/permissions";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function MobileBottomNav() {
  const user = useCurrentUser();
  const logout = useStore((s) => s.logout);
  const appName = useStore((s) => s.appName);
  const appLogoText = useStore((s) => s.appLogoText);
  const appLogoBase64 = useStore((s) => s.appLogoBase64);
  const activeRole = useStore((s) => s.activeRole) || user?.role;
  const navigate = useNavigate();
  const syncData = useStore((s) => s.syncData);
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const [moreOpen, setMoreOpen] = useState(false);

  if (!user) return null;

  const isAdmin = activeRole === "admin";
  const isMember = activeRole === "member";
  const isVol = activeRole === "volunteer";

  const canDashboard = useCanModule("dashboard");
  const canMembers = useCanModule("members");
  const canCredits = useCanModule("credits");
  const canSchedules = useCanModule("schedules");
  const canLeagueGroups = useCanModule("league_groups");
  const canTrainings = useCanModule("trainings");
  const canTransactions = useCanModule("transactions");
  const canApprovals = useCanModule("approvals");
  const canEmailTemplates = useCanModule("email_templates");
  const canSettings = useCanModule("settings");
  const canAdminManagement = useCanModule("admin_management");

  /** Soft navigate; sync when staying in the same module */
  const goToModule = (to: string) => {
    setMoreOpen(false);
    const sameModule = pathname === to || pathname.startsWith(`${to}/`);
    void (async () => {
      await navigate({ to });
      if (sameModule) await syncData();
    })();
  };

  const allMainItems = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: !isAdmin || canDashboard },
    { to: "/training", label: "Training", icon: GraduationCap, show: isMember },
    { to: "/trainings", label: "Trainings", icon: GraduationCap, show: isVol || (isAdmin && canTrainings) },
    { to: "/credits", label: "Wallet", icon: Wallet, show: isMember || (isAdmin && canCredits) },
    { to: "/events", label: "Play Sessions", icon: CalendarDays, show: isMember },
    { to: "/schedules", label: "Play Schedules", icon: CalendarDays, show: isAdmin && canSchedules },
    { to: "/members", label: "Members", icon: Users, show: isMember || (isAdmin && canMembers) },
    { to: "/league-groups", label: "League Groups", icon: Users, show: isMember || (isAdmin && canLeagueGroups) },
    { to: "/transactions", label: "Transactions", icon: Receipt, show: isMember || isVol || (isAdmin && canTransactions) },
  ].filter((i) => i.show);

  // 4 Primary Footer Items on the bottom bar
  const directItems = allMainItems.slice(0, 4);

  // Remaining main items for the "More" sheet modal
  const remainingMainItems = allMainItems.slice(4);

  // Admin section items for Admin users
  const adminItems = [
    { to: "/approvals", label: "Approvals", icon: ShieldCheck, show: isAdmin && canApprovals },
    { to: "/email-templates", label: "Email Templates", icon: Inbox, show: isAdmin && canEmailTemplates },
    { to: "/settings", label: "Settings", icon: Settings, show: isAdmin && canSettings },
    { to: "/admin-management", label: "Club Admin", icon: UserCog, show: isAdmin && canAdminManagement },
  ].filter((i) => i.show);

  const moreItems = [...remainingMainItems, ...adminItems, { to: "/profile", label: "Profile", icon: UserIcon, show: true }];
  const isMoreActive = moreItems.some((i) => pathname.startsWith(i.to));

  return (
    <>
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-md border-t border-border/80 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl transition-all"
      >
        <div className="grid grid-cols-5 items-center justify-items-center max-w-md mx-auto">
          {directItems.map((item) => {
            const isActive = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={(e) => {
                  e.preventDefault();
                  goToModule(item.to);
                }}
                className="relative flex flex-col items-center justify-center w-full py-1 px-1 rounded-xl text-center group transition-colors"
              >
                {/* Active pill background */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      layoutId="mobile-nav-pill"
                      className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/25 pointer-events-none"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    />
                  )}
                </AnimatePresence>

                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className={`p-1 rounded-lg z-10 transition-colors ${
                    isActive ? "text-primary font-semibold" : "text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  <item.icon className="size-5" />
                </motion.div>

                <span
                  className={`text-[10px] font-medium tracking-tight truncate max-w-full z-10 transition-colors ${
                    isActive ? "text-primary font-semibold" : "text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* More Button */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="relative flex flex-col items-center justify-center w-full py-1 px-1 rounded-xl text-center group cursor-pointer transition-colors"
            aria-label="More navigation options"
          >
            <AnimatePresence>
              {isMoreActive && (
                <motion.div
                  layoutId="mobile-nav-pill"
                  className="absolute inset-0 rounded-xl bg-primary/10 border border-primary/25 pointer-events-none"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                />
              )}
            </AnimatePresence>

            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className={`p-1 rounded-lg z-10 transition-colors ${
                isMoreActive ? "text-primary font-semibold" : "text-muted-foreground group-hover:text-foreground"
              }`}
            >
              <MoreHorizontal className="size-5" />
            </motion.div>

            <span
              className={`text-[10px] font-medium tracking-tight truncate max-w-full z-10 transition-colors ${
                isMoreActive ? "text-primary font-semibold" : "text-muted-foreground group-hover:text-foreground"
              }`}
            >
              More
            </span>
          </button>
        </div>
      </nav>

      {/* "More" Sheet Modal */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl bg-background border-t border-border p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left pb-4 border-b border-border/60">
            <div className="flex items-center gap-3">
              {appLogoBase64 ? (
                <img src={appLogoBase64} alt={appName} className="size-10 rounded-lg object-contain bg-white/5" />
              ) : (
                <div className="size-10 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold text-lg">
                  {appLogoText}
                </div>
              )}
              <div className="flex flex-col">
                <SheetTitle className="text-base font-semibold">{appName}</SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground capitalize">
                  {user.firstName} {user.lastName} &bull; {activeRole}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <div className="py-4 space-y-4">
            {/* Main Modules (if any left over from direct items) */}
            {remainingMainItems.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Modules
                </div>
                <div className="grid gap-1">
                  {remainingMainItems.map((item) => {
                    const isActive = pathname.startsWith(item.to);
                    return (
                      <button
                        key={item.to}
                        type="button"
                        onClick={() => goToModule(item.to)}
                        className={`flex items-center justify-between w-full p-3 rounded-xl text-left cursor-pointer transition-all ${
                          isActive
                            ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                            : "hover:bg-accent/60 text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                            <item.icon className="size-5" />
                          </div>
                          <span className="text-sm font-medium">{item.label}</span>
                        </div>
                        <ChevronRight className={`size-4 opacity-60 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Admin Section for Admin Users */}
            {isAdmin && adminItems.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                  Admin
                </div>
                <div className="grid gap-1">
                  {adminItems.map((item) => {
                    const isActive = pathname.startsWith(item.to);
                    return (
                      <button
                        key={item.to}
                        type="button"
                        onClick={() => goToModule(item.to)}
                        className={`flex items-center justify-between w-full p-3 rounded-xl text-left cursor-pointer transition-all ${
                          isActive
                            ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                            : "hover:bg-accent/60 text-foreground"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                            <item.icon className="size-5" />
                          </div>
                          <span className="text-sm font-medium">{item.label}</span>
                        </div>
                        <ChevronRight className={`size-4 opacity-60 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Account Section */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                Account
              </div>
              <div className="grid gap-1">
                <button
                  type="button"
                  onClick={() => goToModule("/profile")}
                  className={`flex items-center justify-between w-full p-3 rounded-xl text-left cursor-pointer transition-all ${
                    pathname.startsWith("/profile")
                      ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                      : "hover:bg-accent/60 text-foreground"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${pathname.startsWith("/profile") ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <UserIcon className="size-5" />
                    </div>
                    <span className="text-sm font-medium">Profile</span>
                  </div>
                  <ChevronRight className={`size-4 opacity-60 ${pathname.startsWith("/profile") ? "text-primary" : "text-muted-foreground"}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                logout();
                navigate({ to: "/login" });
              }}
              className="flex items-center justify-between w-full p-3 rounded-xl text-destructive hover:bg-destructive/10 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-destructive/15 text-destructive">
                  <LogOut className="size-5" />
                </div>
                <span className="text-sm font-medium">Sign Out</span>
              </div>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
