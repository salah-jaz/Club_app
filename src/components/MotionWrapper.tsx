import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { Variants } from "framer-motion";

/**
 * Page-level fade + slide-up transition wrapper.
 * Used inside <AnimatePresence> in the layout route for route transitions.
 * Respects prefers-reduced-motion via Framer Motion's built-in reducedMotion.
 */
export function MotionWrapper({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: "easeOut", delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger container — wraps a list and staggers children animations.
 * Children should use `motion.div` with `variants={staggerItem}` (no explicit initial/animate).
 */
export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.05,
    },
  },
} satisfies Variants;

export const staggerItem = {
  hidden: { opacity: 0, y: 14, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: "easeOut" as const },
  },
} satisfies Variants;

export const staggerItemFast = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: "easeOut" as const },
  },
} satisfies Variants;
