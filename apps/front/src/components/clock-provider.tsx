"use client";

// apps/front/src/components/clock-provider.tsx
//
// A single shared "now" clock. Previously every <RelativeTime> mounted its own
// setInterval(1000), so a screen with the live card plus up to 40 activity-log
// rows ran ~41 uncoordinated 1s intervals, each triggering its own render.
// This collapses them into one interval whose value is read via context, so all
// consumers re-render together (and React batches them) once per second.
//
// The interval also pauses while the tab is hidden, avoiding background work.

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

const ClockContext = createContext<number | null>(null);

export function ClockProvider({
  children,
  intervalMs = 1000,
}: {
  children: ReactNode;
  intervalMs?: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return;
      setNow(Date.now());
      id = setInterval(() => setNow(Date.now()), intervalMs);
    };
    const stop = () => {
      if (id === null) return;
      clearInterval(id);
      id = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);

  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>;
}

// Returns the shared "now" (epoch ms). Falls back to a self-managed interval if
// no provider is mounted, so the hook is safe to use anywhere.
export function useNow(): number {
  const shared = useContext(ClockContext);
  const [fallback, setFallback] = useState(() => Date.now());

  useEffect(() => {
    if (shared !== null) return;
    const id = setInterval(() => setFallback(Date.now()), 1000);
    return () => clearInterval(id);
  }, [shared]);

  return shared ?? fallback;
}
