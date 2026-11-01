"use client";

import { animate, useMotionValue } from "motion/react";
import { useEffect, useState } from "react";

export function AnimatedNumber({ value, className = "" }: { value: number; className?: string }) {
  const motionValue = useMotionValue(value);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.36,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, motionValue]);

  return <span className={`tabular-nums ${className}`}>{display}</span>;
}
