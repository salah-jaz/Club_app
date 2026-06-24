import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

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
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-[#0D1210] border-r border-[rgba(255,255,255,0.06)] relative overflow-hidden">
        {/* Background Image of Shuttlecock Banner */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-[0.15] mix-blend-luminosity pointer-events-none" 
          style={{ backgroundImage: "url('/shuttlecock_banner.png')" }} 
        />
        {/* Subtle glowing dark-emerald orb in background */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-[#10B981]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#34D399]/5 rounded-full blur-[100px] pointer-events-none" />

        <Link to="/" className="text-xl font-medium tracking-[0.12em] text-[#34D399] uppercase z-10">
          ClubApp<span className="text-[#10B981]">.</span>
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
        <div className="text-xs font-mono text-[#4A4A5A] tracking-wider uppercase z-10">
          ESTABLISHED MMXXVI
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
          </div>
          {children}
          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}