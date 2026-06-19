// apps/front/src/app/page.tsx
//
// ISR page (revalidate = 5). Runs at most once per 5s per edge region; all other
// requests in that window are served from the CDN cache. The poller's
// router.refresh() calls re-fetch this page's RSC payload from that same cache,
// not from `back`.
//
// Layout: the interactive demo (live game + "under the hood" visualiser) comes
// first, then a breakdown of how the whole solution is put together.

import { Architecture } from "@/components/architecture";
import { LiveGameCard } from "@/components/live-game-card";
import { PollMonitorProvider } from "@/components/poll-monitor";
import { PollVisualiser } from "@/components/poll-visualiser";
import { ScoresPoller } from "@/components/scores-poller";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getScoresSafe } from "@/lib/scores";

export const revalidate = 5;

export default async function Page() {
  const { scores, hasLiveGames } = await getScoresSafe();
  // The demo intentionally shows a single game with generic labels. `back` still
  // returns the full board; the front just picks the first game to display.
  const game = scores[0] ?? null;

  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-12 sm:py-16">
        <header className="flex flex-col gap-3">
          <Badge
            variant="outline"
            className="w-fit font-mono text-[11px] tracking-wider"
          >
            LIVE SCORES · POC
          </Badge>
          <h1 className="text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
            Near-realtime scores without realtime infrastructure.
          </h1>
          <p className="text-pretty text-muted-foreground leading-relaxed">
            One CDN-cached page, refreshed on the client with adaptive polling.
            No WebSockets, no public JSON endpoint, and the third-party API is
            hit at most once per revalidation window per region.
          </p>
        </header>

        {/* PollMonitorProvider scopes the demo: the poller publishes events and
            the visualiser reads them. Both live inside, the explainer outside. */}
        <PollMonitorProvider>
          <ScoresPoller hasLiveGames={hasLiveGames}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Live game</CardTitle>
                <CardDescription>
                  Scores and clock update in place via{" "}
                  <code className="font-mono text-[0.85em]">
                    router.refresh()
                  </code>
                  , no full reload.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {game ? (
                  <LiveGameCard game={game} />
                ) : (
                  <p className="py-6 text-center text-muted-foreground text-sm">
                    No scores available right now. Retrying on the next
                    revalidation window…
                  </p>
                )}
              </CardContent>
            </Card>
          </ScoresPoller>

          <PollVisualiser />
        </PollMonitorProvider>

        <Architecture />

        <footer className="flex items-center justify-between border-t pt-6 text-muted-foreground text-xs">
          <span>Live Scores POC</span>
          <a
            href="https://github.com"
            className="hover:text-foreground"
            target="_blank"
            rel="noreferrer"
          >
            two-app architecture
          </a>
        </footer>
      </main>
    </div>
  );
}
