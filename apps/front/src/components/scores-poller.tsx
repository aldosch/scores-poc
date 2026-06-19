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
// `override` is a demo-only escape hatch: when set, it forces a specific
// condition instead of deriving one from the live signals, so the different
// behaviours can be observed on demand. It is null in normal operation.
//
// The `usePollEmitter()` calls are observability only — they feed the visualiser
// and do not influence polling behaviour.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import {
  type ForceMode,
  type PollPhase,
  type PollReason,
  usePollEmitter,
  usePollOverride,
} from "@/components/poll-monitor";

const FAST_INTERVAL_MS = 5_000;
const SLOW_INTERVAL_MS = 60_000;
const IDLE_THRESHOLD_MS = 120_000;
const MAX_JITTER_MS = 2_000;

type Cadence = { reason: PollReason; phase: PollPhase; base: number };

const CADENCE: Record<ForceMode, Cadence> = {
  "live-and-active": {
    reason: "live-and-active",
    phase: "fast",
    base: FAST_INTERVAL_MS,
  },
  "no-live-games": {
    reason: "no-live-games",
    phase: "slow",
    base: SLOW_INTERVAL_MS,
  },
  "user-idle": { reason: "user-idle", phase: "slow", base: SLOW_INTERVAL_MS },
  "tab-hidden": { reason: "tab-hidden", phase: "slow", base: SLOW_INTERVAL_MS },
};

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
  const { override } = usePollOverride();

  // Keep the latest signals in refs so the scheduling loop reads current values.
  const hasLiveGamesRef = useRef(hasLiveGames);
  hasLiveGamesRef.current = hasLiveGames;
  const overrideRef = useRef(override);

  // Timestamp of the last user interaction. Drives the idle-degradation logic.
  const lastInteractionRef = useRef(Date.now());

  // Handle to the pending scheduled poll so we can cancel/reschedule it.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Sync the override into the ref so the loop reads the current forced mode.
    // Changing `override` re-runs this effect, restarting the loop cleanly.
    overrideRef.current = override;

    const poll = () => {
      startTransition(() => {
        router.refresh();
      });
    };

    // Decide the next cadence. A forced override wins; otherwise derive it from
    // the two live signals.
    const resolve = (): Cadence => {
      if (overrideRef.current) return CADENCE[overrideRef.current];
      if (!hasLiveGamesRef.current) return CADENCE["no-live-games"];
      if (Date.now() - lastInteractionRef.current > IDLE_THRESHOLD_MS) {
        return CADENCE["user-idle"];
      }
      return CADENCE["live-and-active"];
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

    // Whether polling should currently be paused (real hidden tab or forced).
    const isHidden = () =>
      overrideRef.current === "tab-hidden" ||
      document.visibilityState === "hidden";

    const handleInteraction = () => {
      const wasIdle =
        Date.now() - lastInteractionRef.current > IDLE_THRESHOLD_MS;
      lastInteractionRef.current = Date.now();
      emit({ type: "interaction" });
      // If idleness had degraded us to slow, snap back immediately rather than
      // waiting out the current slow timeout. (No effect when overridden.)
      if (wasIdle && !overrideRef.current && hasLiveGamesRef.current) {
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
    // refresh immediately, and resume the scheduling loop.
    const handleVisibility = () => {
      if (overrideRef.current === "tab-hidden") return; // forced, ignore real tab
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

    // Start (or, on override change, restart) the loop. If we're meant to be
    // paused, emit the paused state instead of scheduling.
    if (isHidden()) {
      emit({ type: "paused", reason: "tab-hidden" });
    } else {
      schedule();
    }

    return () => {
      clear();
      for (const event of interactionEvents) {
        document.removeEventListener(event, handleInteraction);
      }
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [router, emit, override]);

  return <>{children}</>;
}
