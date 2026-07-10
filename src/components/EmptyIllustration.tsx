import type { ReactElement } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";

/**
 * EmptyIllustration — a polished animated empty state with a mint-toned SVG,
 * friendly copy, and an optional CTA button with hover animation.
 *
 * Props:
 *  - icon: "shuttlecock" | "calendar" | "users" | "wallet" | "inbox" | "check" | "training"
 *  - title: primary heading
 *  - description: body text
 *  - ctaLabel: optional button label
 *  - ctaTo: optional router link destination
 *  - onCta: optional click handler (used when no link)
 */

type EmptyIcon = "shuttlecock" | "calendar" | "users" | "wallet" | "inbox" | "check" | "training";

const icons: Record<EmptyIcon, ReactElement> = {
  shuttlecock: (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="26" cy="18" r="8" />
      <line x1="26" y1="26" x2="26" y2="44" />
      <polyline points="20,38 26,46 32,38" />
      <path d="M20 27c0 3.3 2.7 6 6 6s6-2.7 6-6" />
      <line x1="18" y1="14" x2="34" y2="14" />
    </svg>
  ),
  calendar: (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="10" width="36" height="34" rx="5" />
      <line x1="8" y1="20" x2="44" y2="20" />
      <line x1="18" y1="6" x2="18" y2="14" />
      <line x1="34" y1="6" x2="34" y2="14" />
      <circle cx="26" cy="32" r="2" fill="currentColor" />
    </svg>
  ),
  users: (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="20" cy="18" r="7" />
      <path d="M6 42c0-7.7 6.3-14 14-14s14 6.3 14 14" />
      <circle cx="38" cy="16" r="5" />
      <path d="M44 42c0-6.6-4.5-12-10-12" />
    </svg>
  ),
  wallet: (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="14" width="40" height="28" rx="5" />
      <path d="M6 22h40" />
      <circle cx="36" cy="32" r="3" fill="currentColor" />
    </svg>
  ),
  inbox: (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="10" width="36" height="32" rx="5" />
      <path d="M8 30h10l4 6 4-6h10" />
      <line x1="18" y1="20" x2="34" y2="20" />
      <line x1="18" y1="26" x2="28" y2="26" />
    </svg>
  ),
  check: (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="26" cy="26" r="18" />
      <polyline points="16,26 22,32 36,20" />
    </svg>
  ),
  training: (
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="10" width="36" height="28" rx="5" />
      <circle cx="26" cy="24" r="6" />
      <path d="M6 38h40" />
      <line x1="26" y1="38" x2="26" y2="44" />
      <line x1="18" y1="44" x2="34" y2="44" />
    </svg>
  ),
};

export function EmptyIllustration({
  icon = "check",
  title,
  description,
  ctaLabel,
  ctaTo,
  onCta,
}: {
  icon?: EmptyIcon;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaTo?: string;
  onCta?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex flex-col items-center justify-center text-center py-14 px-6"
    >
      {/* Animated icon */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
        className="text-[#10B981] mb-5 opacity-80"
      >
        {icons[icon]}
      </motion.div>

      {/* Glow ring behind icon */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)",
          marginTop: -80,
        }}
      />

      <h3 className="text-[15px] font-semibold text-[#F1F0EE] mb-2">{title}</h3>
      <p className="text-[13px] font-light text-[#8A8A9A] max-w-[280px] mb-6 leading-relaxed">
        {description}
      </p>

      {ctaLabel && ctaTo && (
        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
          <Button asChild className="btn-premium-violet-outline h-[38px] px-5 font-medium text-[13px] cursor-pointer">
            <Link to={ctaTo}>{ctaLabel} →</Link>
          </Button>
        </motion.div>
      )}
      {ctaLabel && onCta && !ctaTo && (
        <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
          <Button
            className="btn-premium-violet-outline h-[38px] px-5 font-medium text-[13px] cursor-pointer"
            onClick={onCta}
          >
            {ctaLabel}
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
