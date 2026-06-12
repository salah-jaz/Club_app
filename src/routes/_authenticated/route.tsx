import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useCurrentUser, useStore } from "@/lib/store";
import { Separator } from "@/components/ui/separator";
import { useState, useEffect } from "react";
import { Bell, Sun, Moon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/_authenticated")({ component: Layout });

function Layout() {
  const userId = useStore((s) => s.currentUserId);
  const user = useCurrentUser();
  const pendingUsers = useStore((s) => s.users.filter((u) => u.status === "created").length);
  const pendingCredits = useStore((s) => s.creditRequests.filter((cr) => cr.status === "created").length);
  const notifCount = pendingUsers + pendingCredits;

  const pathname = useRouterState({ select: (r) => r.location.pathname });

  // Clock state
  const [timeStr, setTimeStr] = useState("");
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, "0");
      const mins = String(now.getMinutes()).padStart(2, "0");
      const secs = String(now.getSeconds()).padStart(2, "0");
      setTimeStr(`${hrs}:${mins}:${secs}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const syncCurrentUser = useStore((s) => s.syncCurrentUser);
  const syncData = useStore((s) => s.syncData);
  const appName = useStore((s) => s.appName);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      if (userId) {
        const u = await syncCurrentUser();
        if (u) {
          await syncData();
        }
      }
      setLoading(false);
    }
    init();
  }, [userId, syncCurrentUser, syncData]);

  // Theme state
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const isLight = document.documentElement.classList.contains("light");
    setTheme(isLight ? "light" : "dark");
  }, []);

  const toggleTheme = () => {
    if (theme === "dark") {
      document.documentElement.classList.add("light");
      localStorage.setItem("clubapp-theme", "light");
      setTheme("light");
    } else {
      document.documentElement.classList.remove("light");
      localStorage.setItem("clubapp-theme", "dark");
      setTheme("dark");
    }
  };

  if (!userId) return <Navigate to="/login" />;
  if (loading) {
    return (
      <div className="min-h-screen bg-[#090D0A] flex flex-col items-center justify-center gap-3">
        <div className="animate-spin size-6 rounded-full border-2 border-[#10B981] border-t-transparent" />
        <div className="text-[#8A8A98] font-light text-xs tracking-widest uppercase">Syncing club records...</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;

  // Breadcrumb screen name resolution
  const pathPart = pathname.split("/").filter(Boolean)[0] || "dashboard";
  const screenName = pathPart.charAt(0).toUpperCase() + pathPart.slice(1);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background text-foreground">
        <AppSidebar />
        <SidebarInset className="bg-background relative overflow-hidden flex-1">
          <header className="h-12 flex items-center justify-between px-6 border-b border-border bg-background sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors" />
              <Separator orientation="vertical" className="h-4 bg-border" />
              <div className="breadcrumbs text-[13px] font-normal text-muted-foreground/60 flex items-center gap-2">
                <span>{appName}</span>
                <span className="breadcrumbs-separator opacity-40">/</span>
                <span className="breadcrumbs-current text-muted-foreground">{screenName}</span>
              </div>
            </div>

            <div className="flex items-center gap-5">
              {/* Theme Toggle Switcher */}
              <button
                onClick={toggleTheme}
                className="flex items-center justify-center size-8 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-accent hover:border-border/80 cursor-pointer transition-all"
                title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              >
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </button>

              {/* Live clock */}
              <div className="clock font-mono text-[13px] text-muted-foreground/60 tracking-tight">
                {timeStr}
              </div>

              {/* Notification Bell */}
              <div className="relative cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                <Bell className="size-[18px]" />
                {notifCount > 0 && (
                  <span className="absolute top-[1px] right-[1px] w-1.5 h-1.5 bg-[#F59E0B] rounded-full border border-background" />
                )}
              </div>
            </div>
          </header>
          <main className="p-8 px-6 w-full flex-1">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}