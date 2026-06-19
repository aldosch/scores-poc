// apps/front/src/lib/scores.ts
//
// Shared Score type + the server-only fetch helper used by the ISR page.
// `BACK_URL` and `BACK_API_SECRET` are server-only env vars (no NEXT_PUBLIC_
// prefix) so they never reach the browser. The secret is sent as a header so the
// back's Vercel Firewall rule lets the request through.

import "server-only";

export interface Score {
  gameId: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  status: "scheduled" | "live" | "halftime" | "final";
  clock: string;
  updatedAt: string;
}

export async function getScores(): Promise<Score[]> {
  const backUrl = process.env.BACK_URL;
  const secret = process.env.BACK_API_SECRET;

  if (!backUrl) throw new Error("BACK_URL is not set");
  if (!secret) throw new Error("BACK_API_SECRET is not set");

  const res = await fetch(`${backUrl}/api/scores`, {
    headers: { "x-api-secret": secret },
    // Match the page's ISR window (export const revalidate = 5). The page is
    // prerendered and re-generated at most once per 5s per region; this fetch
    // participates in that cadence rather than forcing the route to be dynamic.
    // (Do NOT use cache: "no-store" here — it would opt the route out of ISR.)
    next: { revalidate: 5 },
  });

  if (!res.ok) throw new Error(`back returned ${res.status}`);
  return res.json();
}

// Used by the page so a transient `back` outage (or `back` not running during a
// local build) degrades to an empty board instead of failing the whole render.
// ISR will re-attempt on the next revalidation window.
export async function getScoresSafe(): Promise<Score[]> {
  try {
    return await getScores();
  } catch (err) {
    console.error("[scores] failed to fetch from back:", err);
    return [];
  }
}
