// apps/front/src/app/page.tsx
//
// ISR page (revalidate = 5). Runs at most once per 5s per edge region; all other
// requests in that window are served from the CDN cache. The poller's
// router.refresh() calls re-fetch this page's RSC payload from that same cache,
// not from `back`.
//
// Layout:
//   - On small screens it's a single column: header, live demo, then the
//     "how it's built" breakdown.
//   - On large screens the live demo (game + visualiser) sits in a sticky left
//     column while the header and breakdown scroll on the right, so the live
//     components stay visible while reading.

import { Architecture } from "@/components/architecture";
import { FlowDiagram } from "@/components/flow-diagram";
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
import { REPO_URL } from "@/lib/repo";
import { getScoresSafe } from "@/lib/scores";

export const revalidate = 5;

export default async function Page() {
  const { scores, hasLiveGames } = await getScoresSafe();
  // The demo intentionally shows a single game with generic labels. `back` still
  // returns the full board; the front just picks the first game to display.
  const game = scores[0] ?? null;

  // The interactive demo: live game + the under-the-hood visualiser.
  const demo = (
    <div className="flex flex-col gap-6">
      <ScoresPoller hasLiveGames={hasLiveGames}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Live game</CardTitle>
            <CardDescription>
              Scores and clock update in place via{" "}
              <code className="font-mono text-[0.85em]">router.refresh()</code>,
              no full reload.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {game ? (
              <LiveGameCard game={game} />
            ) : (
              <p className="py-6 text-center text-muted-foreground text-sm">
                No scores available right now. Retrying on the next revalidation
                window…
              </p>
            )}
          </CardContent>
        </Card>
      </ScoresPoller>

      <PollVisualiser />
    </div>
  );

  return (
    <div className="min-h-svh bg-background text-foreground">
      {/* PollMonitorProvider scopes the whole demo: the poller publishes events
          and both the visualiser and the bottom flow diagram read them. */}
      <PollMonitorProvider>
        <main className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-12 sm:py-16">
          <header className="flex max-w-2xl flex-col gap-3">
            <Badge
              variant="outline"
              className="w-fit font-mono text-[11px] tracking-wider"
            >
              LIVE SCORES · POC
            </Badge>
            <h1 className="text-balance font-semibold text-3xl tracking-tight sm:text-4xl">
              Efficient near-realtime scores.
            </h1>
            <p className="text-pretty text-muted-foreground leading-relaxed">
              One CDN-cached page, refreshed on the client with adaptive
              polling. No WebSockets, no public JSON endpoint, and the
              third-party API is hit at most once per revalidation window per
              region.
            </p>
          </header>

          <div className="flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start lg:gap-12">
            {/* Live demo: appears first on mobile; sticky left column on desktop. */}
            <div className="lg:sticky lg:top-12">{demo}</div>

            {/* Explainer: the scrolling reading column on desktop. */}
            <Architecture />
          </div>

          {/* Full-width live data-flow diagram at the very bottom. */}
          <FlowDiagram />

          <footer className="flex items-center justify-between border-t pt-6 text-muted-foreground text-xs">
            <span>Live Scores POC</span>
            <a
              href={REPO_URL}
              className="hover:text-foreground"
              target="_blank"
              rel="noreferrer"
            >
              aldosch/scores-poc
            </a>
          </footer>
        </main>
      </PollMonitorProvider>
    </div>
  );
}
