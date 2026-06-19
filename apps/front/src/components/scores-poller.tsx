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
//
// The `usePollEmitter()` calls are observability only — they feed the visualiser
// and do not influence polling behaviour. Strip them and the poller still works.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import {
  type PollPhase,
  type PollReason,
  usePollEmitter,
} from "@/components/poll-monitor";

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
  const emit = usePollEmitter();

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

    // Decide the next cadence from the two signals.
    const resolve = (): {
      reason: PollReason;
      phase: PollPhase;
      base: number;
    } => {
      if (!hasLiveGamesRef.current) {
        return {
          reason: "no-live-games",
          phase: "slow",
          base: SLOW_INTERVAL_MS,
        };
      }
      if (Date.now() - lastInteractionRef.current > IDLE_THRESHOLD_MS) {
        return { reason: "user-idle", phase: "slow", base: SLOW_INTERVAL_MS };
      }
      return {
        reason: "live-and-active",
        phase: "fast",
        base: FAST_INTERVAL_MS,
      };
    };

    const schedule = () => {
      const { reason, phase, base } = resolve();
      // Jitter prevents synchronized polling spikes across all clients.
      const delay = base + Math.random() * MAX_JITTER_MS;
      const nextPollAt = Date.now() + delay;
      emit({ type: "scheduled", intervalMs: base, nextPollAt, phase, reason });

      timeoutRef.current = setTimeout(() => {
        poll();
        emit({ type: "poll", nextPollAt: null });
        schedule();
      }, delay);
    };

    const clear = () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    // Record activity; the next scheduled delay picks this up automatically.
    // We deliberately do NOT log every raw event (they fire constantly and would
    // drown the log). We only surface an interaction when it actually changes
    // behaviour: snapping back to the fast cadence after an idle period.
    const handleInteraction = () => {
      const wasIdle =
        Date.now() - lastInteractionRef.current > IDLE_THRESHOLD_MS;
      lastInteractionRef.current = Date.now();
      if (wasIdle && hasLiveGamesRef.current) {
        emit({ type: "interaction" });
        clear();
        schedule();
      }
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
        emit({ type: "resumed" });
        poll();
        emit({ type: "poll", nextPollAt: null });
        schedule();
      } else {
        clear();
        emit({ type: "paused", reason: "tab-hidden" });
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
  }, [router, emit]);

  return <>{children}</>;
}
