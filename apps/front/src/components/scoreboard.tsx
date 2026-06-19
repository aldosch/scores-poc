// apps/front/src/components/scoreboard.tsx
//
// Server Component. Renders the score cards. Fixed card height + tabular-nums
// keep the layout stable (no CLS) as numbers and statuses change.

import type { Score } from "@/lib/scores";

const STATUS_LABEL: Record<Score["status"], string> = {
  scheduled: "Scheduled",
  live: "Live",
  halftime: "Half-time",
  final: "Final",
};

// Format deterministically in UTC. This is a Server Component that is both
// prerendered (ISR, on the server) and re-rendered on the client during
// router.refresh(); using a fixed timezone keeps the output identical in both
// environments and avoids a hydration mismatch (toLocaleTimeString() would vary
// by the runtime's timezone/locale).
const TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
});

export function Scoreboard({ scores }: { scores: Score[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {scores.map((game) => (
        <div
          key={game.gameId}
          className="flex flex-col justify-between rounded-lg border border-black/10 p-4 dark:border-white/15"
          style={{ minHeight: "140px" }} // fixed dimensions prevent CLS
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{game.home}</span>
              <span className="text-2xl font-bold tabular-nums">
                {game.homeScore}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{game.away}</span>
              <span className="text-2xl font-bold tabular-nums">
                {game.awayScore}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs opacity-60">
            <span>
              {STATUS_LABEL[game.status]}
              {game.status === "live" || game.status === "halftime"
                ? ` · ${game.clock}`
                : ""}
            </span>
            <span className="tabular-nums">
              updated {TIME_FORMATTER.format(new Date(game.updatedAt))} UTC
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
