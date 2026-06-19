"use client";

// apps/front/src/components/poll-monitor.tsx
//
// A small client-side event bus + context that the ScoresPoller publishes to
// and the PollVisualiser subscribes to. This keeps the polling component itself
// clean (it just emits events) while the "under the hood" UI lives entirely
// separately.
//
// It also holds an optional `override` (set from the visualiser's mode toggles)
// that forces the poller into a specific condition for demonstration. When the
// override is null the poller behaves normally.

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

// The conditions a user can force from the UI. Mirrors PollReason so a forced
// mode maps directly onto the reason the poller would otherwise derive.
export type ForceMode = PollReason;

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
  // Consecutive same-kind events (currently just interactions) coalesce into a
  // single row whose count increments, so rapid input doesn't flood the log.
  count: number;
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
  override: ForceMode | null;
  setOverride: (mode: ForceMode | null) => void;
}

const MAX_LOG = 40;
// Coalesced interaction rows older than this start a fresh row, so a burst of
// clicks reads as one row but activity minutes apart stays distinct.
const INTERACTION_COALESCE_MS = 4_000;

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
  const [override, setOverride] = useState<ForceMode | null>(null);
  const nextIdRef = useRef(1);

  const pushLog = useCallback(
    (prev: PollState, kind: ActivityKind, message: string): ActivityEntry[] => {
      const entry: ActivityEntry = {
        id: nextIdRef.current++,
        kind,
        message,
        at: Date.now(),
        count: 1,
      };
      return [entry, ...prev.log].slice(0, MAX_LOG);
    },
    [],
  );

  // Merge consecutive interactions into the newest row (bumping its count and
  // timestamp) instead of adding a new row each time.
  const coalesceInteraction = useCallback(
    (log: ActivityEntry[]): ActivityEntry[] => {
      const head = log[0];
      const now = Date.now();
      if (
        head &&
        head.kind === "interaction" &&
        now - head.at < INTERACTION_COALESCE_MS
      ) {
        const merged: ActivityEntry = {
          ...head,
          count: head.count + 1,
          at: now,
        };
        return [merged, ...log.slice(1)];
      }
      const entry: ActivityEntry = {
        id: nextIdRef.current++,
        kind: "interaction",
        message: "User interaction",
        at: now,
        count: 1,
      };
      return [entry, ...log].slice(0, MAX_LOG);
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
            return { ...prev, log: coalesceInteraction(prev.log) };
          default:
            return prev;
        }
      });
    },
    [pushLog, coalesceInteraction],
  );

  const value = useMemo(
    () => ({ state, emit, override, setOverride }),
    [state, emit, override],
  );

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

// Read/write the forced-mode override. Returns null override + no-op setter when
// no provider is present.
export function usePollOverride(): {
  override: ForceMode | null;
  setOverride: (mode: ForceMode | null) => void;
} {
  const ctx = useContext(PollMonitorContext);
  return {
    override: ctx?.override ?? null,
    setOverride: ctx?.setOverride ?? noopSet,
  };
}

function noop() {}
function noopSet(_mode: ForceMode | null) {}
