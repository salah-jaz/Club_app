import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useStore } from "@/lib/store";

function toTitleCase(str: string): string {
  if (!str) return "";
  if (str === str.toUpperCase()) {
    return str.replace(/\b([a-zA-Z])([a-zA-Z]*)/g, (_, first, rest) => first.toUpperCase() + rest.toLowerCase());
  }
  return str.replace(/\b([a-zA-Z])/g, (c) => c.toUpperCase());
}

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
  const portalEyebrow = useStore((s) => s.portalEyebrow) || "Private Member Portal";
  const portalTitle = useStore((s) => s.portalTitle) || "Run your badminton club without the spreadsheet chaos.";
  const portalDescription = useStore((s) => s.portalDescription) || "Manage memberships, credits, court rotations, and training schedules in one premium, unified interface.";
  const fetchSettings = useStore((s) => s.fetchSettings);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const logoSrc = appLogoBase64 || "/logo.png";
  const displayAppName = toTitleCase(appName);
  const displayEyebrow = toTitleCase(portalEyebrow);

  return (
    <div className="min-h-dvh min-h-screen flex flex-col lg:grid lg:grid-cols-2 bg-background">

      {/* ── LEFT PANEL: desktop full branding column (hidden on mobile) ── */}
      <div className="auth-brand hidden lg:flex flex-col justify-start gap-8 xl:gap-10 p-10 xl:p-12 relative overflow-hidden border-r border-white/[0.06]">
        {/* Background image */}
        <div
          className="auth-brand-bg absolute inset-0 bg-cover bg-center pointer-events-none"
          style={{ backgroundImage: "url('/shuttlecock_banner.png')" }}
          aria-hidden="true"
        />
        {/* Readability overlay — keeps image visible while locking text contrast */}
        <div className="auth-brand-overlay absolute inset-0 pointer-events-none" aria-hidden="true" />
        {/* Ambient glow orbs */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-[var(--violet-dim)] rounded-full blur-[120px] pointer-events-none" aria-hidden="true" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[var(--gold-dim)] rounded-full blur-[100px] pointer-events-none" aria-hidden="true" />

        <Link to="/" className="auth-brand-logo-link relative z-10 flex items-center gap-3.5 xl:gap-4 shrink-0">
          <img
            src={logoSrc}
            alt={displayAppName}
            className="auth-brand-logo size-20 xl:size-24 rounded-xl object-contain p-1"
          />
          <span className="auth-brand-name text-lg xl:text-xl font-medium tracking-[0.12em] uppercase">
            {displayAppName}
          </span>
        </Link>

        <div className="relative z-10 flex flex-col gap-3.5 xl:gap-4 max-w-lg">
          <span className="auth-brand-eyebrow text-[10px] xl:text-[11px] font-medium tracking-[0.14em] uppercase block">
            {displayEyebrow}
          </span>
          <h2 className="auth-brand-heading font-playfair font-normal leading-[1.25] text-3xl xl:text-4xl">
            {portalTitle}
          </h2>
          <div className="signature-divider !w-20 xl:!w-24 shrink-0" />
          <p className="auth-brand-body text-sm xl:text-[15px] font-light leading-relaxed max-w-md">
            {portalDescription}
          </p>
        </div>
      </div>

      {/* ── MOBILE HERO HEADER: banner + branding (visible only below lg) ── */}
      <div className="auth-brand auth-brand--mobile relative flex flex-col items-center justify-center overflow-hidden lg:hidden">
        {/* Shuttlecock banner background */}
        <div
          className="auth-brand-bg absolute inset-0 bg-cover bg-center pointer-events-none"
          style={{ backgroundImage: "url('/shuttlecock_banner.png')" }}
          aria-hidden="true"
        />
        {/* Stronger gradient for mobile readability + clean merge into form panel */}
        <div className="auth-brand-overlay auth-brand-overlay--mobile absolute inset-0 pointer-events-none" aria-hidden="true" />
        {/* Ambient glow orbs */}
        <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] bg-[var(--violet-dim)] rounded-full blur-[90px] pointer-events-none" aria-hidden="true" />
        <div className="absolute bottom-0 right-[-10%] w-[50%] h-[50%] bg-[var(--gold-dim)] rounded-full blur-[80px] pointer-events-none" aria-hidden="true" />

        {/* Centered branding content — compact stacked layout */}
        <div className="relative z-10 flex flex-col items-center gap-2 sm:gap-2.5 px-5 sm:px-8 py-8 sm:py-9 text-center w-full max-w-md mx-auto">
          <Link to="/" className="auth-brand-logo-link flex flex-col items-center gap-2">
            <img
              src={logoSrc}
              alt={displayAppName}
              className="auth-brand-logo w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-contain p-1"
            />
            <span className="auth-brand-name text-sm sm:text-[15px] font-semibold tracking-[0.14em] uppercase">
              {displayAppName}
            </span>
          </Link>
          <span className="auth-brand-eyebrow text-[9px] sm:text-[10px] font-medium tracking-[0.14em] uppercase">
            {displayEyebrow}
          </span>
          <h2 className="auth-brand-heading font-playfair font-normal leading-snug text-[1.25rem] sm:text-2xl max-w-[18rem] sm:max-w-xs">
            {portalTitle}
          </h2>
          <p className="auth-brand-body text-[12px] sm:text-[13px] font-light leading-relaxed max-w-[17rem] sm:max-w-sm">
            {portalDescription}
          </p>
        </div>
      </div>

      {/* ── FORM PANEL (right on desktop, below hero on mobile) ── */}
      <div className="flex items-center justify-center px-5 py-8 sm:p-10 md:p-12 flex-1 bg-background">
        <div className="w-full max-w-md">
          <div className="mb-6 sm:mb-7">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
            {subtitle && (
              <p className="text-muted-foreground mt-1.5 text-sm sm:text-base leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
          {children}
          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>

    </div>
  );
}
