// apps/front/src/components/architecture.tsx
//
// The "how it's built" breakdown that sits below the live demo. Each part of the
// solution is a card: a short description up top, with collapsible Why / Code /
// Prompt / Docs sections underneath. Styled after the customer-notes template.

import {
  CircleHelp,
  Code2,
  Layers,
  Network,
  RefreshCw,
  Shield,
  SquareTerminal,
  Timer,
} from "lucide-react";
import type * as React from "react";
import { CodeBlock, InlineCode } from "@/components/code-block";
import { CopyButton } from "@/components/copy-button";
import { DocLink } from "@/components/doc-link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

type Skill = { name: string; href: string };

type Part = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: React.ReactNode;
  tag: string;
  what: React.ReactNode;
  why?: React.ReactNode;
  code?: { filename: string; language: string; source: string };
  prompt?: string;
  docs?: { href: string; label: string }[];
  skills?: Skill[];
};

const SKILL_NEXT: Skill = {
  name: "next-best-practices",
  href: "https://skills.sh/vercel-labs/next-skills/next-best-practices",
};
const SKILL_TURBO: Skill = {
  name: "turborepo",
  href: "https://skills.sh/vercel-labs/turborepo-skills/turborepo",
};

const parts: Part[] = [
  {
    id: "two-apps",
    icon: Layers,
    tag: "Architecture",
    title: <>Two apps, one cache boundary</>,
    what: (
      <p>
        A public <InlineCode>front</InlineCode> and an internal{" "}
        <InlineCode>back</InlineCode>, deployed as independent projects in a
        pnpm + Turborepo monorepo. <InlineCode>back</InlineCode> fetches from
        the third-party scores API and serves JSON. It has no users of its own.{" "}
        <InlineCode>front</InlineCode> is the only thing the public sees, and
        all caching lives there.
      </p>
    ),
    why: (
      <p>
        Keeping caching entirely in <InlineCode>front</InlineCode> means{" "}
        <InlineCode>back</InlineCode> stays fully dynamic with no caching to
        reason about. Its only job is to talk to the provider and return JSON.
        Separating the two also lets the public app and the data source scale
        and deploy independently.
      </p>
    ),
    docs: [
      {
        href: "https://vercel.com/docs/monorepos/turborepo",
        label: "Turborepo on Vercel",
      },
    ],
    skills: [SKILL_TURBO],
  },
  {
    id: "isr",
    icon: Timer,
    tag: "Caching",
    title: (
      <>
        ISR caches the page with <InlineCode>revalidate = 5</InlineCode>
      </>
    ),
    what: (
      <>
        <p>
          The scores page is statically generated and re-generated at most once
          every 5 seconds per edge region. Every request in that window is
          served from the CDN, so the third-party API is hit on the order of
          once per region per 5s, never per user.
        </p>
        <CodeBlock
          language="tsx"
          filename="apps/front/src/app/page.tsx"
        >{`export const revalidate = 5;

export default async function Page() {
  const { scores, hasLiveGames } = await getScoresSafe();
  // ...render the board + poller
}`}</CodeBlock>
      </>
    ),
    why: (
      <p>
        ISR uses stale-while-revalidate: after the window expires the next
        request serves slightly stale content while a background regeneration
        runs, so worst-case staleness is roughly 6 to 7 seconds. For scores a
        few seconds of delay is fine, and the infrastructure cost scales with
        revalidation frequency rather than with the number of viewers.
      </p>
    ),
    docs: [
      {
        href: "https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration",
        label: "Incremental Static Regeneration",
      },
    ],
    skills: [SKILL_NEXT],
  },
  {
    id: "refresh",
    icon: RefreshCw,
    tag: "Client",
    title: (
      <>
        Client polls with <InlineCode>router.refresh()</InlineCode>
      </>
    ),
    what: (
      <p>
        A client component calls <InlineCode>router.refresh()</InlineCode> on a
        timer. That re-fetches the React Server Component payload for the
        ISR-cached page, not a full document and not{" "}
        <InlineCode>back</InlineCode>. React reconciles the new payload against
        the live DOM and updates only the values that changed: no full reload,
        no scroll reset, no layout shift.
      </p>
    ),
    why: (
      <p>
        Wrapping the refresh in <InlineCode>startTransition</InlineCode> keeps
        it non-urgent, so on a slow network the previous scores stay on screen
        instead of flashing a loading state. The RSC payload is React&apos;s
        internal streaming format: undocumented, opaque, and version-specific,
        which also makes it a poor target for scrapers.
      </p>
    ),
    code: {
      filename: "apps/front/src/components/scores-poller.tsx",
      language: "tsx",
      source: `const poll = () => {
  startTransition(() => {
    router.refresh();
  });
};`,
    },
    docs: [
      {
        href: "https://nextjs.org/docs/app/api-reference/functions/use-router",
        label: "useRouter().refresh()",
      },
    ],
    skills: [SKILL_NEXT],
  },
  {
    id: "adaptive",
    icon: Timer,
    tag: "Client",
    title: <>Adaptive polling on two signals</>,
    what: (
      <>
        <p>
          Not every viewer needs a 5 second cadence at all times. The interval
          is recomputed before each poll from two signals:
        </p>
        <ul className="ml-4 flex list-disc flex-col gap-1">
          <li>
            <InlineCode>hasLiveGames</InlineCode> from the server. When no game
            is live, every client drops to 60s. This covers pre-game, post-game,
            and half-time.
          </li>
          <li>
            User activity. If there is no interaction for 2 minutes, polling
            drops to 60s even on a visible tab. Any interaction snaps it back to
            5s.
          </li>
        </ul>
        <p>
          When the tab is hidden, polling stops entirely. When it becomes
          visible again, an immediate poll fires and fast polling resumes.
        </p>
      </>
    ),
    why: (
      <p>
        A recursive <InlineCode>setTimeout</InlineCode> (rather than{" "}
        <InlineCode>setInterval</InlineCode>) lets the next delay adapt between
        polls. Jitter of up to 2 seconds is added to each delay so clients
        don&apos;t synchronise into request spikes. Together these signals cut
        average edge request volume substantially versus a fixed 5s interval,
        with no change for active viewers of a live game.
      </p>
    ),
    code: {
      filename: "apps/front/src/components/scores-poller.tsx",
      language: "tsx",
      source: `const resolve = () => {
  if (!hasLiveGamesRef.current)
    return { phase: "slow", base: SLOW_INTERVAL_MS };  // 60s
  if (Date.now() - lastInteractionRef.current > IDLE_THRESHOLD_MS)
    return { phase: "slow", base: SLOW_INTERVAL_MS };  // 60s
  return { phase: "fast", base: FAST_INTERVAL_MS };    // 5s
};

const delay = base + Math.random() * MAX_JITTER_MS;    // jitter`,
    },
    prompt: `In apps/front/src/components/scores-poller.tsx, make the client poll adapt its interval. Accept a hasLiveGames boolean prop. Use a recursive setTimeout (not setInterval) so the delay can change between polls, and add jitter of up to 2000ms to each scheduled delay. Use 5000ms when a game is live and the user has interacted within the last 120000ms; otherwise use 60000ms. Track last interaction via a ref, listening to mousedown/keydown/touchstart/scroll on document with { passive: true }. On visibilitychange: when visible, reset the interaction time and fire an immediate poll; when hidden, clear the pending timeout. Clean up all listeners and timeouts on unmount. Do not add any dependencies or persistent connections.`,
    skills: [SKILL_NEXT],
  },
  {
    id: "shielding",
    icon: Shield,
    tag: "Security",
    title: <>API shielding with a Firewall secret</>,
    what: (
      <p>
        <InlineCode>back</InlineCode> is protected by a Vercel Firewall rule
        that rejects any request missing a shared{" "}
        <InlineCode>x-api-secret</InlineCode> header, blocking unauthorised
        requests at the edge before a function runs.{" "}
        <InlineCode>front</InlineCode> sends that secret from its server-side
        fetch only, as a server-only environment variable that never reaches the
        browser.
      </p>
    ),
    why: (
      <p>
        <InlineCode>front</InlineCode> exposes no public JSON endpoint. Score
        data only exists in server-rendered HTML and the opaque RSC wire format,
        so a scraper would need a real headless browser that also clears bot
        protection, rather than a simple API call.
      </p>
    ),
    code: {
      filename: "apps/front/src/lib/scores.ts",
      language: "ts",
      source: `const res = await fetch(\`\${backUrl}/api/scores\`, {
  headers: { "x-api-secret": secret }, // server-only env var
  next: { revalidate: 5 },             // participate in ISR, do not opt out
});`,
    },
    docs: [
      {
        href: "https://vercel.com/docs/vercel-firewall",
        label: "Vercel Firewall",
      },
      {
        href: "https://nextjs.org/docs/app/building-your-application/configuring/environment-variables",
        label: "Environment variables",
      },
    ],
  },
  {
    id: "no-realtime",
    icon: Network,
    tag: "Trade-off",
    title: <>Why not SSE or WebSockets</>,
    what: (
      <p>
        At very high concurrency, persistent connections are expensive to hold
        open and scale. Scores tolerate a few seconds of delay, so polling
        against a CDN-cached response is effectively free per viewer: cost
        scales with revalidation frequency, not with the number of connections.
      </p>
    ),
    why: (
      <p>
        Sub-second delivery would justify a persistent transport. This use case
        does not need it, so the simpler model wins on both cost and operational
        complexity.
      </p>
    ),
  },
];

export function Architecture() {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Code2 className="size-4 text-muted-foreground" />
        <h2 className="font-semibold text-lg tracking-tight">
          How it&apos;s built
        </h2>
      </div>

      <ol className="flex flex-col gap-3">
        {parts.map((part) => {
          const Icon = part.icon;
          return (
            <li
              key={part.id}
              id={part.id}
              className="scroll-mt-8 rounded-xl border bg-card p-5"
            >
              <div className="mb-3 flex items-start gap-3">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/50">
                  <Icon className="size-4 text-muted-foreground" />
                </span>
                <h3 className="flex-1 font-medium text-base leading-snug">
                  {part.title}
                </h3>
                <span className="shrink-0 rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
                  {part.tag}
                </span>
              </div>

              <div className="flex flex-col gap-3 text-sm leading-relaxed">
                {part.what}
              </div>

              <Accordion multiple className="mt-3 border-t pt-1">
                {part.why && (
                  <Section
                    value={`${part.id}-why`}
                    icon={CircleHelp}
                    label="Why?"
                  >
                    <div className="pt-1 text-muted-foreground leading-relaxed">
                      {part.why}
                    </div>
                  </Section>
                )}

                {part.code && (
                  <Section value={`${part.id}-code`} icon={Code2} label="Code">
                    <CodeBlock
                      language={part.code.language}
                      filename={part.code.filename}
                      className="mt-1"
                    >
                      {part.code.source}
                    </CodeBlock>
                  </Section>
                )}

                {part.prompt && (
                  <Section
                    value={`${part.id}-prompt`}
                    icon={SquareTerminal}
                    label="Prompt"
                  >
                    <div className="flex flex-col gap-3 pt-1">
                      <PromptBlock text={part.prompt} />
                      {part.skills && part.skills.length > 0 && (
                        <RefRow label="Skills">
                          {part.skills.map((s) => (
                            <DocLink key={s.href} href={s.href}>
                              {s.name}
                            </DocLink>
                          ))}
                        </RefRow>
                      )}
                    </div>
                  </Section>
                )}

                {part.docs && part.docs.length > 0 && (
                  <Section
                    value={`${part.id}-docs`}
                    icon={CircleHelp}
                    label="Docs"
                  >
                    <RefRow label="Docs">
                      {part.docs.map((d) => (
                        <DocLink key={d.href} href={d.href}>
                          {d.label}
                        </DocLink>
                      ))}
                    </RefRow>
                  </Section>
                )}
              </Accordion>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Section({
  value,
  icon: Icon,
  label,
  children,
}: {
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem value={value} className="border-b-0!">
      <AccordionTrigger className="cursor-pointer py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider hover:text-foreground hover:no-underline">
        <span className="flex items-center gap-2">
          <Icon className="size-3.5" />
          {label}
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="text-sm">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

function RefRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
      <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
        {label}
      </span>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{children}</div>
    </div>
  );
}

function PromptBlock({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const reveal =
    "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";
  return (
    <figure
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted/40 text-card-foreground",
        className,
      )}
    >
      <CopyButton
        text={text}
        className={cn("absolute top-1.5 right-1.5 z-10", reveal)}
      />
      <pre className="overflow-x-auto whitespace-pre-wrap px-4 py-3 pr-10 font-mono text-[13px] text-foreground leading-relaxed">
        {text}
      </pre>
    </figure>
  );
}
