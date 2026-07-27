import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";
import { applyCustomTheme } from "@/lib/utils";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useCurrentUser, useStore } from "@/lib/store";
import { Separator } from "@/components/ui/separator";
import { useState, useEffect, useRef } from "react";
import { Bell, Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MotionWrapper } from "@/components/MotionWrapper";
import { formatClockTime } from "@/lib/timezones";

export const Route = createFileRoute("/_authenticated")({ component: Layout });

function Layout() {
  const userId = useStore((s) => s.currentUserId);
  const user = useCurrentUser();
  const timezone = useStore((s) => s.timezone);
  const pendingUsers = useStore((s) => s.users.filter((u) => u.status === "created").length);
  const pendingCredits = useStore((s) => s.creditRequests.filter((cr) => (cr.type || "credit") === "credit" && cr.status === "created").length);
  const notifCount = pendingUsers + pendingCredits;

  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const moduleKey = pathname.split("/").filter(Boolean)[0] || "dashboard";

  const [timeStr, setTimeStr] = useState("");
  useEffect(() => {
    const updateTime = () => setTimeStr(formatClockTime(new Date(), timezone));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  const syncCurrentUser = useStore((s) => s.syncCurrentUser);
  const syncData = useStore((s) => s.syncData);
  const [loading, setLoading] = useState(true);
  const skipNextModuleSync = useRef(true);

  useEffect(() => {
    async function init() {
      if (userId) {
        let u = useStore.getState().currentUser;
        if (!u) {
          u = await syncCurrentUser();
        }
        if (u) {
          await syncData();
        }
      }
      setLoading(false);
    }
    init();
  }, [userId, syncCurrentUser, syncData]);

  // Soft-refresh shared data when switching modules (Members → Schedules, etc.)
  useEffect(() => {
    if (loading || !userId) return;
    if (skipNextModuleSync.current) {
      skipNextModuleSync.current = false;
      return;
    }
    void syncData();
  }, [moduleKey, loading, userId, syncData]);

  // Move focus to main on route change (WCAG SPA pattern)
  useEffect(() => {
    if (loading) return;
    const main = document.getElementById("main-content");
    main?.focus({ preventScroll: true });
  }, [pathname, loading]);

  // Theme state
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const updateActiveThemeClass = (colorTheme: string, isLight: boolean) => {
    document.documentElement.classList.forEach((cls) => {
      if (cls.startsWith("theme-")) {
        document.documentElement.classList.remove(cls);
      }
    });
    if (colorTheme === "custom") {
      document.documentElement.classList.add("theme-custom");
      const hex = localStorage.getItem("clubapp-custom-hex") || "#10B981";
      const secHex = localStorage.getItem("clubapp-custom-sec-hex") || "#2DD4BF";
      applyCustomTheme(hex, secHex, isLight);
    } else {
      const root = document.documentElement;
      root.style.removeProperty('--primary');
      root.style.removeProperty('--ring');
      root.style.removeProperty('--sidebar-primary');
      root.style.removeProperty('--sidebar-ring');
      root.style.removeProperty('--violet');
      root.style.removeProperty('--input-border-focus');
      root.style.removeProperty('--accent-foreground');
      root.style.removeProperty('--success-text');
      root.style.removeProperty('--success-color');
      root.style.removeProperty('--border-accent');
      root.style.removeProperty('--violet-dim');
      root.style.removeProperty('--bg-glass');
      root.style.removeProperty('--gold');
      root.style.removeProperty('--gold-dim');
      root.style.removeProperty('--success-bg');
      root.style.removeProperty('--success-border');
      
      if (colorTheme !== "sapphire") {
        document.documentElement.classList.add(`theme-${colorTheme}`);
      }
    }
  };

  useEffect(() => {
    const isLight = document.documentElement.classList.contains("light");
    setTheme(isLight ? "light" : "dark");
    const colorTheme = localStorage.getItem("clubapp-color-theme") || "sapphire";
    updateActiveThemeClass(colorTheme, isLight);
  }, []);

  useEffect(() => {
    const handleThemeChange = () => {
      const isLight = document.documentElement.classList.contains("light");
      setTheme(isLight ? "light" : "dark");
      const colorTheme = localStorage.getItem("clubapp-color-theme") || "sapphire";
      updateActiveThemeClass(colorTheme, isLight);
    };
    window.addEventListener("clubapp-theme-changed", handleThemeChange);
    return () => window.removeEventListener("clubapp-theme-changed", handleThemeChange);
  }, []);

  const toggleTheme = () => {
    const nextLight = theme === "dark";
    if (nextLight) {
      document.documentElement.classList.add("light");
      localStorage.setItem("clubapp-theme", "light");
      document.documentElement.style.colorScheme = "light";
      setTheme("light");
    } else {
      document.documentElement.classList.remove("light");
      localStorage.setItem("clubapp-theme", "dark");
      document.documentElement.style.colorScheme = "dark";
      setTheme("dark");
    }
    const colorTheme = localStorage.getItem("clubapp-color-theme") || "sapphire";
    updateActiveThemeClass(colorTheme, nextLight);
  };

  if (!userId) return <Navigate to="/login" />;
  if (loading) {
    return (
      <div className="min-h-dvh min-h-screen bg-[#090D0A] flex flex-col items-center justify-center gap-6">
        {/* Pulse ring */}
        <div className="relative flex items-center justify-center">
          <div
            className="pulse-ring absolute rounded-full border-2 border-[#10B981]/30"
            style={{ width: 72, height: 72 }}
          />
          <div
            className="pulse-ring absolute rounded-full border border-[#10B981]/15"
            style={{ width: 96, height: 96, animationDelay: "0.5s" }}
          />
          {/* Spinner */}
          <div className="animate-spin size-8 rounded-full border-2 border-[#10B981] border-t-transparent" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="text-[#E8F0EE] font-medium text-sm">Connect App</div>
          <div className="text-[#8A8A98] font-light text-xs tracking-widest uppercase">
            Syncing club records...
          </div>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;

  // Breadcrumb screen name resolution
  const pathPart = pathname.split("/").filter(Boolean)[0] || "dashboard";
  const routeNames: Record<string, string> = {
    events: "Play Sessions",
    invitations: "Play Sessions",
  };
  const screenName = routeNames[pathPart] || (pathPart.charAt(0).toUpperCase() + pathPart.slice(1));

  return (
    <SidebarProvider>
      <div className="min-h-dvh min-h-screen flex w-full bg-background text-foreground">
        <AppSidebar />
        <SidebarInset className="bg-background relative overflow-hidden flex-1">

          {/* Route-level top progress bar — slim 2px bar at absolute top */}
          <AnimatePresence>
            {loading && (
              <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden z-50">
                <div className="progress-bar-indeterminate" />
              </div>
            )}
          </AnimatePresence>

          <header className="h-12 flex items-center justify-between px-3 sm:px-6 border-b border-border bg-background sticky top-0 z-10 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0" />
              <Separator orientation="vertical" className="h-4 bg-border hidden sm:block" />
              <div className="breadcrumbs text-[13px] font-normal text-muted-foreground/60 flex items-center gap-2 min-w-0 truncate">
                <span className="hidden xs:inline sm:inline">Connect App</span>
                <span className="breadcrumbs-separator opacity-40 hidden sm:inline">/</span>
                <span className="breadcrumbs-current text-muted-foreground truncate">{screenName}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-5 shrink-0">
              {/* Theme Toggle — animated rotation on hover */}
              <motion.button
                onClick={toggleTheme}
                whileHover={{ rotate: 20, scale: 1.1 }}
                whileTap={{ scale: 0.88 }}
                className="flex items-center justify-center size-9 sm:size-8 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent hover:border-border/80 cursor-pointer transition-colors"
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
                aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={theme}
                    initial={{ opacity: 0, rotate: -30 }}
                    animate={{ opacity: 1, rotate: 0 }}
                    exit={{ opacity: 0, rotate: 30 }}
                    transition={{ duration: 0.15 }}
                  >
                    {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>

              {/* Live clock — hidden on very small screens to reduce chrome crowding */}
              <div className="clock font-mono text-[13px] text-muted-foreground/60 tracking-tight hidden sm:block" aria-hidden="true">
                {timeStr}
              </div>

              {/* Notification Bell — animated */}
              <motion.div
                whileHover={{ scale: 1.12 }}
                whileTap={{ scale: 0.9 }}
                className="relative cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
              >
                <Bell className="size-[18px]" />
                {notifCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="badge-pulse absolute top-[1px] right-[1px] w-1.5 h-1.5 bg-[#F59E0B] rounded-full border border-background"
                  />
                )}
              </motion.div>
            </div>
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8 outline-none"
          >
            <AnimatePresence mode="wait">
              <MotionWrapper key={pathname}>
                <Outlet />
              </MotionWrapper>
            </AnimatePresence>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}