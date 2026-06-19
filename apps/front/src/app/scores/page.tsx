// apps/front/src/app/scores/page.tsx
//
// ISR page. Runs at most once per `revalidate` window per edge region; all other
// requests in that window are served from the CDN cache. The poller's
// router.refresh() calls hit this same cache, not `back`.

import { Scoreboard } from "@/components/scoreboard";
import { ScoresPoller } from "@/components/scores-poller";
import { getScoresSafe } from "@/lib/scores";

export const revalidate = 5;

export default async function ScoresPage() {
  const scores = await getScoresSafe();

  return (
    <ScoresPoller>
      {scores.length > 0 ? (
        <Scoreboard scores={scores} />
      ) : (
        <p className="text-sm opacity-60">
          No scores available right now. Retrying…
        </p>
      )}
    </ScoresPoller>
  );
}
