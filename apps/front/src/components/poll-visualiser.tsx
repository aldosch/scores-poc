"use client";

// apps/front/src/components/poll-visualiser.tsx
//
// "Under the hood" panel. Subscribes to the PollMonitor and renders a live view
// of what the poller is doing: a countdown to the next poll, the current
// interval and why it was chosen, total poll count, and a rolling activity log.
// This is observability only; it reads state and never drives polling.

import {
  Activity,
  EyeOff,
  Hand,
  MoonStar,
  Pause,
  Play,
  RefreshCw,
  Timer,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type ActivityEntry,
  type ActivityKind,
  type ForceMode,
  reasonLabel,
  usePollOverride,
  usePollState,
} from "@/components/poll-monitor";
import { RelativeTime } from "@/components/relative-time";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const KIND_ICON: Record<ActivityKind, typeof Activity> = {
  poll: RefreshCw,
  scheduled: Timer,
  "interval-change": Zap,
  paused: Pause,
  resumed: Play,
  interaction: Hand,
};

const KIND_COLOR: Record<ActivityKind, string> = {
  poll: "text-sky-600 dark:text-sky-400",
  scheduled: "text-muted-foreground",
  "interval-change": "text-amber-600 dark:text-amber-400",
  paused: "text-muted-foreground",
  resumed: "text-emerald-600 dark:text-emerald-400",
  interaction: "text-violet-600 dark:text-violet-400",
};

// The forceable modes shown as toggles. Order matters for display.
const FORCE_MODES: {
  mode: ForceMode;
  label: string;
  icon: typeof Activity;
  active: string;
}[] = [
  {
    mode: "live-and-active",
    label: "Fast",
    icon: Zap,
    active:
      "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  {
    mode: "no-live-games",
    label: "No live games",
    icon: MoonStar,
    active:
      "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  {
    mode: "user-idle",
    label: "User idle",
    icon: Hand,
    active:
      "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  {
    mode: "tab-hidden",
    label: "Tab hidden",
    icon: EyeOff,
    active: "border-border bg-muted text-foreground",
  },
];

export function PollVisualiser() {
  const state = usePollState();
  const { override, setOverride } = usePollOverride();
  const isPaused = state.status === "paused";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4 text-muted-foreground" />
              Under the hood
            </CardTitle>
            <CardDescription>
              Live view of the client polling loop. Nothing here drives
              behaviour, it just observes it.
            </CardDescription>
          </div>
          <StatusBadge paused={isPaused} phase={state.phase} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3">
          <Countdown
            nextPollAt={state.nextPollAt}
            intervalMs={state.intervalMs}
            paused={isPaused}
          />
          <Stat
            label="Interval"
            value={`${Math.round(state.intervalMs / 1000)}s`}
            hint={reasonLabel(state.reason)}
          />
          <Stat label="Polls fired" value={String(state.pollCount)} />
        </div>

        <ModeToggles
          activeReason={state.reason}
          override={override}
          onToggle={(mode) => setOverride(override === mode ? null : mode)}
        />

        <ActivityLog log={state.log} />
      </CardContent>
    </Card>
  );
}

// The mode row doubles as a live indicator and a demo control. The mode matching
// the current reason is shown as "active" (driven by the live signals); clicking
// any mode forces it until clicked again. A forced mode is outlined distinctly.
function ModeToggles({
  activeReason,
  override,
  onToggle,
}: {
  activeReason: ForceMode;
  override: ForceMode | null;
  onToggle: (mode: ForceMode) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          Mode
        </span>
        <span className="text-[11px] text-muted-foreground">
          {override ? "forced — click again to resume auto" : "tap to simulate"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {FORCE_MODES.map(({ mode, label, icon: Icon, active }) => {
          const isLive = !override && activeReason === mode;
          const isForced = override === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onToggle(mode)}
              aria-pressed={isForced}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left font-medium text-xs transition-colors",
                "hover:bg-muted/60",
                isForced
                  ? cn(active, "ring-1 ring-current/30")
                  : isLive
                    ? active
                    : "border-border bg-muted/20 text-muted-foreground",
              )}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StatusBadge({ paused, phase }: { paused: boolean; phase: string }) {
  if (paused) {
    return (
      <Badge
        variant="outline"
        className="gap-1.5 border-border bg-muted text-muted-foreground"
      >
        <Pause className="size-3" />
        Paused
      </Badge>
    );
  }
  const fast = phase === "fast";
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5",
        fast
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
    >
      <span className="relative flex size-1.5">
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            fast ? "bg-emerald-500" : "bg-amber-500",
          )}
        />
        <span
          className={cn(
            "relative inline-flex size-1.5 rounded-full",
            fast ? "bg-emerald-500" : "bg-amber-500",
          )}
        />
      </span>
      Polling
    </Badge>
  );
}

// Animated SVG ring counting down to the next scheduled poll.
function Countdown({
  nextPollAt,
  intervalMs,
  paused,
}: {
  nextPollAt: number | null;
  intervalMs: number;
  paused: boolean;
}) {
  // Tick once per second rather than every animation frame: the visible
  // countdown label only changes at whole-second boundaries, and the ring
  // fill is animated by a CSS transition (see below), so a 60fps rAF loop
  // produced ~59 wasted renders per second.
  const [now, setNow] = useState(() => Date.now());
  const flashRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [paused]);

  const remainingMs =
    nextPollAt && !paused ? Math.max(0, nextPollAt - now) : paused ? 0 : 0;
  const remainingS = Math.ceil(remainingMs / 1000);
  const fraction =
    nextPollAt && !paused
      ? Math.min(1, Math.max(0, remainingMs / intervalMs))
      : 0;

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - fraction);

  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border bg-muted/30 p-3">
      <div ref={flashRef} className="relative size-14">
        <svg
          className="size-14 -rotate-90"
          viewBox="0 0 52 52"
          role="img"
          aria-label={`${remainingS} seconds until next poll`}
        >
          <circle
            cx="26"
            cy="26"
            r={radius}
            fill="none"
            strokeWidth="4"
            className="stroke-border"
          />
          <circle
            cx="26"
            cy="26"
            r={radius}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cn(
              "transition-[stroke-dashoffset] duration-300 ease-linear",
              paused ? "stroke-muted-foreground/40" : "stroke-emerald-500",
            )}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono font-semibold text-sm tabular-nums">
          {paused ? "–" : `${remainingS}s`}
        </span>
      </div>
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        next poll
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col justify-center gap-0.5 rounded-lg border bg-muted/30 p-3">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="font-mono font-semibold text-xl tabular-nums leading-none">
        {value}
      </span>
      {hint && (
        <span className="text-pretty text-[11px] text-muted-foreground leading-tight">
          {hint}
        </span>
      )}
    </div>
  );
}

function ActivityLog({ log }: { log: ActivityEntry[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
        Activity log
      </span>
      <div className="h-56 overflow-hidden rounded-lg border bg-muted/20">
        {log.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Waiting for the first poll…
          </div>
        ) : (
          <ul className="flex flex-col">
            {log.map((entry, i) => (
              <LogRow key={entry.id} entry={entry} isNewest={i === 0} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function LogRow({
  entry,
  isNewest,
}: {
  entry: ActivityEntry;
  isNewest: boolean;
}) {
  const Icon = KIND_ICON[entry.kind];
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 border-border/60 border-b px-3 py-1.5 text-sm last:border-b-0",
        isNewest && "animate-log-enter",
      )}
    >
      <Icon className={cn("size-3.5 shrink-0", KIND_COLOR[entry.kind])} />
      <span className="flex-1 truncate">{entry.message}</span>
      {entry.count > 1 && (
        <Badge
          variant="outline"
          className="shrink-0 border-violet-500/30 bg-violet-500/10 px-1.5 py-0 font-mono text-[10px] text-violet-700 tabular-nums dark:text-violet-300"
        >
          ×{entry.count}
        </Badge>
      )}
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        <RelativeTime iso={new Date(entry.at).toISOString()} />
      </span>
    </li>
  );
}
