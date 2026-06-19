"use client";

// apps/front/src/components/poll-monitor.tsx
//
// A small client-side event bus + context that the ScoresPoller publishes to
// and the PollVisualiser subscribes to. This keeps the polling component itself
// clean (it just emits events) while the "under the hood" UI lives entirely
// separately. Nothing here affects the polling behaviour; it's purely for
// observability/demonstration.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type PollPhase = "fast" | "slow";
export type PollStatus = "polling" | "paused";

export type PollReason =
  | "live-and-active"
  | "no-live-games"
  | "user-idle"
  | "tab-hidden";

export type ActivityKind =
  | "poll"
  | "scheduled"
  | "interval-change"
  | "paused"
  | "resumed"
  | "interaction";

export interface ActivityEntry {
  id: number;
  kind: ActivityKind;
  message: string;
  at: number; // epoch ms
}

export interface PollState {
  status: PollStatus;
  phase: PollPhase;
  reason: PollReason;
  intervalMs: number;
  // Absolute time the next poll is scheduled to fire (epoch ms), or null when
  // paused / not yet scheduled.
  nextPollAt: number | null;
  pollCount: number;
  log: ActivityEntry[];
}

// Events the poller emits. Deliberately small and declarative.
export type PollEvent =
  | {
      type: "scheduled";
      intervalMs: number;
      nextPollAt: number;
      phase: PollPhase;
      reason: PollReason;
    }
  | { type: "poll"; nextPollAt: number | null }
  | { type: "paused"; reason: PollReason }
  | { type: "resumed" }
  | { type: "interaction" };

interface PollMonitorContextValue {
  state: PollState;
  emit: (event: PollEvent) => void;
}

const MAX_LOG = 40;

const PollMonitorContext = createContext<PollMonitorContextValue | null>(null);

const PHASE_LABEL: Record<PollPhase, string> = {
  fast: "fast",
  slow: "slow",
};

const REASON_LABEL: Record<PollReason, string> = {
  "live-and-active": "live game, user active",
  "no-live-games": "no live games",
  "user-idle": "user idle > 2m",
  "tab-hidden": "tab hidden",
};

export function reasonLabel(reason: PollReason): string {
  return REASON_LABEL[reason];
}

const INITIAL_STATE: PollState = {
  status: "polling",
  phase: "fast",
  reason: "live-and-active",
  intervalMs: 5_000,
  nextPollAt: null,
  pollCount: 0,
  log: [],
};

export function PollMonitorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<PollState>(INITIAL_STATE);
  const nextIdRef = useRef(1);

  const pushLog = useCallback(
    (prev: PollState, kind: ActivityKind, message: string): ActivityEntry[] => {
      const entry: ActivityEntry = {
        id: nextIdRef.current++,
        kind,
        message,
        at: Date.now(),
      };
      return [entry, ...prev.log].slice(0, MAX_LOG);
    },
    [],
  );

  const emit = useCallback(
    (event: PollEvent) => {
      setState((prev) => {
        switch (event.type) {
          case "scheduled": {
            const seconds = Math.round(event.intervalMs / 1000);
            const phaseChanged =
              prev.phase !== event.phase || prev.reason !== event.reason;
            const log = phaseChanged
              ? pushLog(
                  prev,
                  "interval-change",
                  `Interval set to ${seconds}s (${PHASE_LABEL[event.phase]}: ${REASON_LABEL[event.reason]})`,
                )
              : prev.log;
            return {
              ...prev,
              status: "polling",
              phase: event.phase,
              reason: event.reason,
              intervalMs: event.intervalMs,
              nextPollAt: event.nextPollAt,
              log,
            };
          }
          case "poll": {
            const count = prev.pollCount + 1;
            return {
              ...prev,
              pollCount: count,
              nextPollAt: event.nextPollAt,
              log: pushLog(prev, "poll", `router.refresh() #${count}`),
            };
          }
          case "paused":
            return {
              ...prev,
              status: "paused",
              nextPollAt: null,
              log: pushLog(prev, "paused", "Polling paused (tab hidden)"),
            };
          case "resumed":
            return {
              ...prev,
              status: "polling",
              log: pushLog(prev, "resumed", "Tab visible, immediate poll"),
            };
          case "interaction":
            return {
              ...prev,
              log: pushLog(prev, "interaction", "User interaction detected"),
            };
          default:
            return prev;
        }
      });
    },
    [pushLog],
  );

  const value = useMemo(() => ({ state, emit }), [state, emit]);

  return (
    <PollMonitorContext.Provider value={value}>
      {children}
    </PollMonitorContext.Provider>
  );
}

// Used by the poller to emit events. Returns a no-op emitter when no provider is
// present so the poller works standalone.
export function usePollEmitter(): (event: PollEvent) => void {
  const ctx = useContext(PollMonitorContext);
  return ctx?.emit ?? noop;
}

// Used by the visualiser to read state.
export function usePollState(): PollState {
  const ctx = useContext(PollMonitorContext);
  if (!ctx) {
    throw new Error("usePollState must be used within a PollMonitorProvider");
  }
  return ctx.state;
}

function noop() {}
