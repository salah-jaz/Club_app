import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const appName = useStore((s) => s.appName);
  const appLogoBase64 = useStore((s) => s.appLogoBase64);
  const fetchSettings = useStore((s) => s.fetchSettings);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  return (
    <div className="min-h-dvh min-h-screen flex flex-col lg:grid lg:grid-cols-2 bg-background">

      {/* ── LEFT PANEL: desktop full branding column (hidden on mobile) ── */}
      <div className="hidden lg:flex flex-col justify-start gap-16 p-12 bg-[#0D1210] border-r border-[rgba(255,255,255,0.06)] relative overflow-hidden">
        {/* Background Image of Shuttlecock Banner */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.15] mix-blend-luminosity pointer-events-none"
          style={{ backgroundImage: "url('/shuttlecock_banner.png')" }}
        />
        {/* Subtle glowing brand orbs */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-[var(--violet-dim)] rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[var(--gold-dim)] rounded-full blur-[100px] pointer-events-none" />

        <Link to="/" className="flex items-center gap-4 text-xl font-medium tracking-[0.12em] text-[var(--gold)] uppercase z-10">
          {appLogoBase64 || "/logo.png" ? (
            <img src={appLogoBase64 || "/logo.png"} alt={appName} className="size-24 rounded-xl object-contain bg-white/5 p-1" />
          ) : null}
          <span>{appName}</span>
        </Link>
        <div className="space-y-6 z-10 max-w-lg">
          <span className="text-[11px] font-medium tracking-[0.14em] text-[#8A8A98] uppercase block">
            PRIVATE MEMBER PORTAL
          </span>
          <h2 className="text-4xl font-playfair font-normal leading-tight text-[#F1F0EE]">
            Run your badminton club without the spreadsheet chaos.
          </h2>
          <div className="signature-divider !w-24 my-4" />
          <p className="text-[15px] font-light text-[#8A8A9A] leading-relaxed">
            Manage memberships, credits, court rotations, and training schedules in one premium, unified interface.
          </p>
        </div>
      </div>

      {/* ── MOBILE HERO HEADER: banner + branding (visible only below lg) ── */}
      <div className="relative flex flex-col items-center justify-end overflow-hidden bg-[#0D1210] lg:hidden" style={{ minHeight: "240px" }}>
        {/* Shuttlecock banner background */}
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none"
          style={{ backgroundImage: "url('/shuttlecock_banner.png')" }}
        />
        {/* Gradient overlay: transparent at top, solid page-bg at bottom so form panel merges cleanly */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0D1210]/50 via-[#0D1210]/65 to-[#0C0F0E] pointer-events-none" />
        {/* Ambient glow orbs */}
        <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] bg-[var(--violet-dim)] rounded-full blur-[90px] pointer-events-none" />
        <div className="absolute bottom-0 right-[-10%] w-[50%] h-[50%] bg-[var(--gold-dim)] rounded-full blur-[80px] pointer-events-none" />

        {/* Centered branding content */}
        <div className="relative z-10 flex flex-col items-center gap-3 pb-8 px-6 text-center w-full">
          <Link to="/" className="flex flex-col items-center gap-2.5">
            {appLogoBase64 || "/logo.png" ? (
              <img
                src={appLogoBase64 || "/logo.png"}
                alt={appName}
                className="w-[72px] h-[72px] rounded-2xl object-contain bg-white/5 p-1 shadow-2xl shadow-black/50 border border-white/10"
              />
            ) : null}
            <span className="text-[15px] font-semibold tracking-[0.14em] text-[var(--gold)] uppercase">
              {appName}
            </span>
          </Link>
          <span className="text-[10px] font-medium tracking-[0.14em] text-[#8A8A98] uppercase mt-0.5">
            Private Member Portal
          </span>
        </div>
      </div>

      {/* ── FORM PANEL (right on desktop, below hero on mobile) ── */}
      <div className="flex items-center justify-center p-5 pt-8 sm:p-12 flex-1">
        <div className="w-full max-w-md">
          <div className="mb-7">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-muted-foreground mt-1.5 text-sm sm:text-base">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>

    </div>
  );
}