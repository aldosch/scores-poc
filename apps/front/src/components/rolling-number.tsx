"use client";

// apps/front/src/components/rolling-number.tsx
//
// Displays a number that "rolls" when it changes: the old value animates up and
// out while the new value rolls up into place, plus a brief highlight flash.
// Purely presentational; respects prefers-reduced-motion (handled in CSS).

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function RollingNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const [prev, setPrev] = useState<number | null>(null);
  const animKey = useRef(0);

  useEffect(() => {
    if (value !== display) {
      setPrev(display);
      setDisplay(value);
      animKey.current += 1;
      const id = setTimeout(() => setPrev(null), 450);
      return () => clearTimeout(id);
    }
  }, [value, display]);

  const animating = prev !== null;

  return (
    <span
      className={cn(
        "rolling-digit relative inline-block overflow-hidden tabular-nums",
        animating && "animate-value-flash",
        className,
      )}
    >
      {/* Outgoing digit. */}
      {animating && (
        <span
          key={`out-${animKey.current}`}
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
          style={{ animation: "digit-out 0.45s ease-out forwards" }}
        >
          {prev}
        </span>
      )}
      {/* Incoming / current digit. */}
      <span
        key={`in-${animKey.current}`}
        className="block"
        style={
          animating
            ? { animation: "digit-in 0.45s ease-out forwards" }
            : undefined
        }
      >
        {display}
      </span>
    </span>
  );
}
