"use client";

// apps/front/src/components/scores-poller.tsx
//
// Calls router.refresh() on an interval. refresh() re-fetches the RSC payload
// from the (ISR-cached) page — it does NOT hit `back` or the third-party API.
// React reconciles the new payload against the live DOM, updating only changed
// values: no full reload, no scroll reset, no CLS. startTransition keeps the
// update non-urgent so slow networks show the previous scores rather than a
// loading state.

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useTransition } from "react";

const POLL_INTERVAL_MS = 5_000;

export function ScoresPoller({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const poll = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    // Jitter prevents synchronized polling spikes across all clients.
    const jitter = Math.random() * 2_000;
    const interval = setInterval(poll, POLL_INTERVAL_MS + jitter);

    // Pause while the tab is hidden; refresh immediately when it's visible again.
    const handleVisibility = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [poll]);

  return <>{children}</>;
}
