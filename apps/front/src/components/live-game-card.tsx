// apps/front/src/components/live-game-card.tsx
//
// Server Component. Renders a single game with generic team labels. Fixed
// dimensions + tabular-nums keep the layout stable (no CLS) as values change.
// Score numbers animate via the client-side <RollingNumber>; everything else is
// server-rendered and reconciled in place on each router.refresh().

import { RelativeTime } from "@/components/relative-time";
import { RollingNumber } from "@/components/rolling-number";
import { Badge } from "@/components/ui/badge";
import type { Score } from "@/lib/scores";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  Score["status"],
  { label: string; className: string; live: boolean }
> = {
  scheduled: {
    label: "Scheduled",
    className: "border-border bg-muted text-muted-foreground",
    live: false,
  },
  live: {
    label: "Live",
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    live: true,
  },
  halftime: {
    label: "Half-time",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    live: false,
  },
  final: {
    label: "Final",
    className: "border-border bg-muted text-muted-foreground",
    live: false,
  },
};

function TeamRow({ name, score }: { name: string; score: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium text-base">{name}</span>
      <RollingNumber
        value={score}
        className="px-1 font-semibold text-3xl leading-none"
      />
    </div>
  );
}

export function LiveGameCard({ game }: { game: Score }) {
  const status = STATUS_META[game.status];
  const showClock = game.status === "live" || game.status === "halftime";

  return (
    <div className="flex flex-col gap-4" style={{ minHeight: "150px" }}>
      <div className="flex items-center justify-between">
        <Badge
          variant="outline"
          className={cn("gap-1.5 font-mono text-[11px]", status.className)}
        >
          {status.live && (
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
            </span>
          )}
          {status.label}
          {showClock ? ` · ${game.clock}` : ""}
        </Badge>
        <span className="text-muted-foreground text-xs">
          updated <RelativeTime iso={game.updatedAt} />
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <TeamRow name="Team A" score={game.homeScore} />
        <div className="h-px bg-border" />
        <TeamRow name="Team B" score={game.awayScore} />
      </div>
    </div>
  );
}
