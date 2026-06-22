"use client";

// apps/front/src/components/relative-time.tsx
//
// Renders a timestamp as compact relative time ("2s ago", "1m ago") that ticks
// on its own, with the absolute UTC time available on hover via a tooltip.
// Client-only because relative time depends on the viewer's clock; the server
// renders the ISO string and the client hydrates the relative label.

import { useNow } from "@/components/clock-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const UTC_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "UTC",
});

function formatRelative(fromMs: number, nowMs: number): string {
  const diff = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}s ago`;
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export function RelativeTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const target = new Date(iso).getTime();
  const now = useNow();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "cursor-help tabular-nums underline decoration-muted-foreground/30 decoration-dotted underline-offset-2",
              className,
            )}
          />
        }
      >
        {formatRelative(target, now)}
      </TooltipTrigger>
      <TooltipContent className="font-mono text-xs">
        {UTC_FORMATTER.format(new Date(iso))} UTC
      </TooltipContent>
    </Tooltip>
  );
}
