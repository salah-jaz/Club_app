import { useEffect, useRef, useState } from "react";
import { useMotionValue, useTransform, animate } from "framer-motion";

/**
 * AnimatedCounter — count-up animation for numeric stat values.
 * Starts from 0 and animates to `value` over `duration` ms.
 * `format` is applied ONLY to the final displayed string (e.g. currency formatting).
 */
export function AnimatedCounter({
  value,
  format,
  duration = 1.2,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(format ? format(0) : "0");
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) {
      // If value changes after initial render, snap immediately
      setDisplay(format ? format(value) : String(value));
      return;
    }
    hasAnimated.current = true;

    const controls = animate(motionValue, value, {
      duration,
      ease: "easeOut",
      onUpdate: (latest) => {
        const rounded = Math.round(latest);
        setDisplay(format ? format(rounded) : String(rounded));
      },
      onComplete: () => {
        // Ensure we always display the exact final value
        setDisplay(format ? format(value) : String(value));
      },
    });

    return () => controls.stop();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return <span className={className}>{display}</span>;
}
