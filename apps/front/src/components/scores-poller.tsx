"use client";

// apps/front/src/components/scores-poller.tsx
//
// Calls router.refresh() on an adaptive interval. refresh() re-fetches the RSC
// payload from the (ISR-cached) page — it does NOT hit `back` or the third-party
// API. React reconciles the new payload against the live DOM, updating only
// changed values: no full reload, no scroll reset, no CLS. startTransition keeps
// the update non-urgent so slow networks show the previous scores rather than a
// loading state.
//
// Polling cadence adapts to two signals so we don't refresh aggressively when
// there's nothing worth refreshing:
//   1. `hasLiveGames` — when no game is live, poll slowly (60s).
//   2. User activity — if the user hasn't interacted for >2min, poll slowly even
//      while games are live. Any interaction snaps back to the fast cadence.
// A recursive setTimeout (rather than setInterval) lets the next delay be
// recomputed from the latest signals before each poll.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

const FAST_INTERVAL_MS = 5_000;
const SLOW_INTERVAL_MS = 60_000;
const IDLE_THRESHOLD_MS = 120_000;
const MAX_JITTER_MS = 2_000;

export function ScoresPoller({
  hasLiveGames,
  children,
}: {
  hasLiveGames: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Keep the latest `hasLiveGames` in a ref so the scheduling loop (set up once)
  // always reads the current value rather than the one captured at mount.
  const hasLiveGamesRef = useRef(hasLiveGames);
  hasLiveGamesRef.current = hasLiveGames;

  // Timestamp of the last user interaction. Drives the idle-degradation logic.
  const lastInteractionRef = useRef(Date.now());

  // Handle to the pending scheduled poll so we can cancel/reschedule it.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const poll = () => {
      startTransition(() => {
        router.refresh();
      });
    };

    const nextDelay = () => {
      let base: number;
      if (!hasLiveGamesRef.current) {
        base = SLOW_INTERVAL_MS;
      } else if (Date.now() - lastInteractionRef.current > IDLE_THRESHOLD_MS) {
        base = SLOW_INTERVAL_MS;
      } else {
        base = FAST_INTERVAL_MS;
      }
      // Jitter prevents synchronized polling spikes across all clients.
      return base + Math.random() * MAX_JITTER_MS;
    };

    const schedule = () => {
      timeoutRef.current = setTimeout(() => {
        poll();
        schedule();
      }, nextDelay());
    };

    const clear = () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    // Record activity; the next scheduled delay picks this up automatically.
    const handleInteraction = () => {
      lastInteractionRef.current = Date.now();
    };

    const interactionEvents = [
      "mousedown",
      "keydown",
      "touchstart",
      "scroll",
    ] as const;
    for (const event of interactionEvents) {
      document.addEventListener(event, handleInteraction, { passive: true });
    }

    // Pause while the tab is hidden; on becoming visible, reset the idle timer,
    // refresh immediately, and resume the scheduling loop at the fast cadence.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        lastInteractionRef.current = Date.now();
        clear();
        poll();
        schedule();
      } else {
        clear();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    schedule();

    return () => {
      clear();
      for (const event of interactionEvents) {
        document.removeEventListener(event, handleInteraction);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router]);

  return <>{children}</>;
}
