"use client";

// apps/front/src/components/flow-diagram.tsx
//
// A live architecture diagram that animates from the REAL poll state, plus a
// couple of simulated peers, to show how the design behaves at scale.
//
//   • Three browser clients poll independently. The highlighted one ("You") is
//     the real session and fires on actual polls; the other two are illustrative
//     peers on their own staggered timers. All three hit the CDN.
//   • The CDN serves the cached page WITHOUT running the ISR function — this is
//     the common case, and it's why cost doesn't scale with viewers.
//   • Only when the cache is stale does the CDN run the ISR function, which then
//     calls back, which calls the third-party provider. That regenerated page is
//     cached and shared by every subsequent client.
//
// The revalidation cadence is illustrative: a browser can't observe an edge
// regeneration directly, so we model "roughly one per revalidate window" to show
// where the ISR function (and the third-party cost) actually lands.

import { AnimatePresence, motion } from "framer-motion";
import {
  DatabaseZap,
  Globe,
  MonitorSmartphone,
  Server,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePollState } from "@/components/poll-monitor";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Geometry. Smaller nodes; CDN + ISR + back share one "VERCEL" boundary (back
// is the same platform, just a separate project), with the provider outside it.
// ---------------------------------------------------------------------------
const VB = { w: 940, h: 322 };

type NodeId = "you" | "peer1" | "peer2" | "cdn" | "isr" | "back" | "api";

interface NodeDef {
  id: NodeId;
  label: string;
  sublabel: string;
  icon: typeof Globe;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** The real session — rendered with a "You" marker and stronger presence. */
  primary?: boolean;
}

// Browser column (left). Three stacked clients.
const BROWSER_W = 132;
const BROWSER_H = 62;
const BROWSER_X = 8;
const BROWSER_YS = [36, 128, 220];

// Backend row (right), vertically centred against the browser stack.
const ROW_Y = 120;
const NODE_H = 78;
const NODE_W = 142;

const NODES: NodeDef[] = [
  // Browsers
  {
    id: "you",
    label: "You",
    sublabel: "this tab",
    icon: MonitorSmartphone,
    color: "var(--flow-browser)",
    x: BROWSER_X,
    y: BROWSER_YS[0],
    w: BROWSER_W,
    h: BROWSER_H,
    primary: true,
  },
  {
    id: "peer1",
    label: "Client",
    sublabel: "another viewer",
    icon: MonitorSmartphone,
    color: "var(--flow-peer)",
    x: BROWSER_X,
    y: BROWSER_YS[1],
    w: BROWSER_W,
    h: BROWSER_H,
  },
  {
    id: "peer2",
    label: "Client",
    sublabel: "another viewer",
    icon: MonitorSmartphone,
    color: "var(--flow-peer)",
    x: BROWSER_X,
    y: BROWSER_YS[2],
    w: BROWSER_W,
    h: BROWSER_H,
  },
  // Edge
  {
    id: "cdn",
    label: "CDN cache",
    sublabel: "cached HTML",
    icon: DatabaseZap,
    color: "var(--flow-cdn)",
    x: 256,
    y: ROW_Y,
    w: NODE_W,
    h: NODE_H,
  },
  {
    id: "isr",
    label: "ISR function",
    sublabel: "runs when stale",
    icon: Zap,
    color: "var(--flow-edge)",
    x: 444,
    y: ROW_Y,
    w: NODE_W,
    h: NODE_H,
  },
  {
    id: "back",
    label: "back",
    sublabel: "/api/scores",
    icon: Server,
    color: "var(--flow-back)",
    x: 632,
    y: ROW_Y,
    w: NODE_W,
    h: NODE_H,
  },
  // Third party
  {
    id: "api",
    label: "Provider",
    sublabel: "third party",
    icon: Globe,
    color: "var(--flow-api)",
    x: 838,
    y: ROW_Y,
    w: 64,
    h: NODE_H,
  },
];

interface BoundaryDef {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Dotted inner grouping (e.g. the separate `back` project) drawn subtler. */
  inner?: boolean;
}

const PAD = 14;
const VERCEL_X = 256 - PAD;
const VERCEL_RIGHT = 632 + NODE_W + PAD;
const BOUNDARIES: BoundaryDef[] = [
  {
    label: "CLIENTS",
    x: BROWSER_X - PAD,
    y: BROWSER_YS[0] - 24,
    w: BROWSER_W + PAD * 2,
    h: BROWSER_YS[2] + BROWSER_H - BROWSER_YS[0] + 36,
  },
  {
    // Everything on Vercel: CDN + ISR function (front project) and back.
    label: "VERCEL",
    x: VERCEL_X,
    y: ROW_Y - 24,
    w: VERCEL_RIGHT - VERCEL_X,
    h: NODE_H + 36,
  },
  {
    // back is the same platform but a separate project — subtle inner group.
    label: "back · separate project",
    x: 632 - 10,
    y: ROW_Y - 12,
    w: NODE_W + 20,
    h: NODE_H + 22,
    inner: true,
  },
  {
    label: "THIRD PARTY",
    x: 838 - PAD,
    y: ROW_Y - 24,
    w: 64 + PAD * 2,
    h: NODE_H + 36,
  },
];

function nodeById(id: NodeId): NodeDef {
  // biome-ignore lint/style/noNonNullAssertion: ids are static and known
  return NODES.find((n) => n.id === id)!;
}

// Curved path from a browser's right edge to the CDN's left edge.
function browserToCdnPath(browser: NodeId): string {
  const a = nodeById(browser);
  const cdn = nodeById("cdn");
  const x1 = a.x + a.w;
  const y1 = a.y + a.h / 2;
  const x2 = cdn.x;
  const y2 = cdn.y + cdn.h / 2;
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}

// Straight horizontal path between two row-aligned nodes.
function rowPath(from: NodeId, to: NodeId): string {
  const a = nodeById(from);
  const b = nodeById(to);
  const y = a.y + a.h / 2;
  return `M ${a.x + a.w} ${y} L ${b.x} ${y}`;
}

const CONNECTIONS: { id: string; d: string }[] = [
  { id: "you-cdn", d: browserToCdnPath("you") },
  { id: "peer1-cdn", d: browserToCdnPath("peer1") },
  { id: "peer2-cdn", d: browserToCdnPath("peer2") },
  { id: "cdn-isr", d: rowPath("cdn", "isr") },
  { id: "isr-back", d: rowPath("isr", "back") },
  { id: "back-api", d: rowPath("back", "api") },
];

type Flow = "poll" | "revalidate";

interface ActiveParticle {
  id: string;
  connId: string;
  color: string;
  reverse: boolean;
  delay: number;
}

const REVALIDATE_WINDOW_MS = 5_000;
// Independent cadence for the two simulated peers (ms). Staggered + jittered so
// they visibly fire at different times from each other and from the real tab.
const PEER_BASE_MS = [6_300, 8_100];

export function FlowDiagram() {
  const state = usePollState();
  const [particles, setParticles] = useState<ActiveParticle[]>([]);
  const [activeNodes, setActiveNodes] = useState<Map<NodeId, Flow>>(new Map());
  const [activeConns, setActiveConns] = useState<Map<string, Flow>>(new Map());

  const lastPollRef = useRef(0);
  const lastRevalidateAtRef = useRef(0);
  const seqRef = useRef(0);
  const litTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // --- shared animation helpers (stable across renders) -------------------
  const helpers = useRef({
    addParticles(p: ActiveParticle[]) {
      setParticles((prev) => [...prev, ...p]);
    },
    lightUp(nodes: NodeId[], conns: string[], flow: Flow, durationMs: number) {
      setActiveNodes((prev) => {
        const next = new Map(prev);
        for (const n of nodes) next.set(n, flow);
        return next;
      });
      setActiveConns((prev) => {
        const next = new Map(prev);
        for (const c of conns) next.set(c, flow);
        return next;
      });
      const key = `${flow}-${seqRef.current++}`;
      const t = setTimeout(() => {
        setActiveNodes((prev) => {
          const next = new Map(prev);
          for (const n of nodes) if (next.get(n) === flow) next.delete(n);
          return next;
        });
        setActiveConns((prev) => {
          const next = new Map(prev);
          for (const c of conns) if (next.get(c) === flow) next.delete(c);
          return next;
        });
        litTimers.current.delete(key);
      }, durationMs);
      litTimers.current.set(key, t);
    },
  });

  // A cache hit: browser → CDN → browser. Never runs the ISR function.
  const emitCacheHit = useRef((browser: NodeId, connId: string) => {
    const id = `c${seqRef.current++}`;
    helpers.current.addParticles([
      {
        id: `${id}-req`,
        connId,
        color: nodeById(browser).color,
        reverse: false,
        delay: 0,
      },
      {
        id: `${id}-res`,
        connId,
        color: "var(--flow-cdn)",
        reverse: true,
        delay: 0.4,
      },
    ]);
    helpers.current.lightUp([browser, "cdn"], [connId], "poll", 1000);
  });

  // The real session: fire a cache hit whenever a poll lands, and roughly once
  // per revalidate window also run the ISR function through to the provider.
  useEffect(() => {
    if (state.pollCount === lastPollRef.current) return;
    lastPollRef.current = state.pollCount;
    if (state.pollCount === 0) return;

    emitCacheHit.current("you", "you-cdn");

    const now = Date.now();
    if (
      state.status === "polling" &&
      now - lastRevalidateAtRef.current >= REVALIDATE_WINDOW_MS
    ) {
      lastRevalidateAtRef.current = now;
      const id = `r${seqRef.current++}`;
      helpers.current.addParticles([
        {
          id: `${id}-1`,
          connId: "cdn-isr",
          color: "var(--flow-cdn)",
          reverse: false,
          delay: 0,
        },
        {
          id: `${id}-2`,
          connId: "isr-back",
          color: "var(--flow-edge)",
          reverse: false,
          delay: 0.5,
        },
        {
          id: `${id}-3`,
          connId: "back-api",
          color: "var(--flow-back)",
          reverse: false,
          delay: 1.0,
        },
        {
          id: `${id}-4`,
          connId: "back-api",
          color: "var(--flow-api)",
          reverse: true,
          delay: 1.5,
        },
        {
          id: `${id}-5`,
          connId: "isr-back",
          color: "var(--flow-back)",
          reverse: true,
          delay: 2.0,
        },
        {
          id: `${id}-6`,
          connId: "cdn-isr",
          color: "var(--flow-edge)",
          reverse: true,
          delay: 2.5,
        },
      ]);
      helpers.current.lightUp(
        ["cdn", "isr", "back", "api"],
        ["cdn-isr", "isr-back", "back-api"],
        "revalidate",
        3200,
      );
    }
  }, [state.pollCount, state.status]);

  // Two simulated peers polling on their own cadence, so the shared-cache story
  // is visible even when the real tab is idle/slow.
  useEffect(() => {
    const timers = [
      setInterval(
        () => emitCacheHit.current("peer1", "peer1-cdn"),
        PEER_BASE_MS[0],
      ),
      setInterval(
        () => emitCacheHit.current("peer2", "peer2-cdn"),
        PEER_BASE_MS[1],
      ),
    ];
    return () => timers.forEach(clearInterval);
  }, []);

  // Clean up pending lit-state timers on unmount.
  useEffect(() => {
    const timers = litTimers.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  const removeParticle = (id: string) =>
    setParticles((prev) => prev.filter((p) => p.id !== id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data flow</CardTitle>
        <CardDescription>
          Animated from the live poll state. Every client hits the CDN, which
          serves the cached page without running the ISR function. Only when the
          cache goes stale does the function run, call{" "}
          <code className="font-mono text-[0.85em]">back</code>, and reach the
          provider, and that one result is shared by every client.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="overflow-hidden rounded-lg border bg-muted/20">
          <svg
            viewBox={`0 0 ${VB.w} ${VB.h}`}
            className="h-auto w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Architecture data flow diagram"
          >
            <Boundaries />

            {CONNECTIONS.map((c) => (
              <ConnectionLine
                key={c.id}
                d={c.d}
                flow={activeConns.get(c.id) ?? null}
              />
            ))}

            <AnimatePresence>
              {particles.map((p) => {
                const conn = CONNECTIONS.find((c) => c.id === p.connId);
                if (!conn) return null;
                return (
                  <Particle
                    key={p.id}
                    d={conn.d}
                    color={p.color}
                    reverse={p.reverse}
                    delay={p.delay}
                    onDone={() => removeParticle(p.id)}
                  />
                );
              })}
            </AnimatePresence>

            {NODES.map((n) => (
              <DiagramNode
                key={n.id}
                node={n}
                flow={activeNodes.get(n.id) ?? null}
              />
            ))}
          </svg>
        </div>

        <Legend />
      </CardContent>
    </Card>
  );
}

function Boundaries() {
  return (
    <g>
      {BOUNDARIES.map((b) => {
        const fontSize = b.inner ? 8.5 : 10;
        const labelW = b.label.length * (b.inner ? 5.2 : 7.2) + 16;
        return (
          <g key={b.label}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={b.inner ? 10 : 14}
              className={cn(
                "stroke-border",
                b.inner ? "fill-transparent" : "fill-foreground/[0.015]",
              )}
              strokeWidth={1}
              strokeDasharray={b.inner ? "3 4" : "5 5"}
              strokeOpacity={b.inner ? 0.6 : 1}
            />
            <rect
              x={b.x + 12}
              y={b.y - 10}
              width={labelW}
              height={b.inner ? 17 : 20}
              rx={5}
              className="fill-background stroke-border"
              strokeWidth={1}
              strokeOpacity={b.inner ? 0.6 : 1}
            />
            <text
              x={b.x + 12 + labelW / 2}
              y={b.y + (b.inner ? 2 : 3)}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={fontSize}
              fontFamily="var(--font-geist-mono), monospace"
              letterSpacing={b.inner ? "0.04em" : "0.12em"}
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function ConnectionLine({ d, flow }: { d: string; flow: Flow | null }) {
  const active = flow !== null;
  return (
    <motion.path
      d={d}
      fill="none"
      strokeLinecap="round"
      className={cn(
        !active && "stroke-border",
        flow === "poll" && "stroke-[var(--flow-cdn)]",
        flow === "revalidate" && "stroke-[var(--flow-api)]",
      )}
      animate={{ strokeWidth: active ? 2 : 1.25, opacity: active ? 1 : 0.45 }}
      transition={{ duration: 0.25 }}
      strokeDasharray="2 7"
    />
  );
}

function Particle({
  d,
  color,
  reverse,
  delay,
  onDone,
}: {
  d: string;
  color: string;
  reverse: boolean;
  delay: number;
  onDone: () => void;
}) {
  return (
    <motion.circle
      r={4.5}
      style={{
        offsetPath: `path('${d}')`,
        fill: color,
        filter: `drop-shadow(0 0 5px ${color})`,
      }}
      initial={{ offsetDistance: reverse ? "100%" : "0%", opacity: 0 }}
      animate={{
        offsetDistance: reverse ? "0%" : "100%",
        opacity: [0, 1, 1, 0.9],
      }}
      transition={{ duration: 0.85, delay, ease: [0.4, 0, 0.2, 1] }}
      onAnimationComplete={onDone}
    />
  );
}

function DiagramNode({ node, flow }: { node: NodeDef; flow: Flow | null }) {
  const Icon = node.icon;
  const active = flow !== null;
  return (
    <g>
      <motion.rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={node.h}
        rx={12}
        className={cn(
          active ? "fill-foreground/[0.04]" : "fill-foreground/[0.02]",
        )}
        animate={{
          stroke: active
            ? node.color
            : node.primary
              ? "var(--flow-browser)"
              : "var(--flow-idle)",
          strokeWidth: active ? 1.8 : node.primary ? 1.4 : 1,
          filter: active
            ? `drop-shadow(0 0 10px ${node.color})`
            : "drop-shadow(0 0 0px transparent)",
        }}
        transition={{ duration: 0.2 }}
      />

      {active && (
        <motion.rect
          x={node.x - 4}
          y={node.y - 4}
          width={node.w + 8}
          height={node.h + 8}
          rx={15}
          fill="none"
          stroke={node.color}
          strokeWidth={1.25}
          initial={{ opacity: 0.5 }}
          animate={{ opacity: [0.5, 0.15, 0.5] }}
          transition={{
            duration: 1.4,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
          }}
          style={{
            transformOrigin: `${node.x + node.w / 2}px ${node.y + node.h / 2}px`,
          }}
        />
      )}

      {/* "You" marker on the primary client. */}
      {node.primary && (
        <foreignObject
          x={node.x + node.w - 44}
          y={node.y - 9}
          width={44}
          height={18}
        >
          <div className="flex justify-end">
            <span className="rounded-full bg-[var(--flow-browser)] px-1.5 py-0.5 font-mono font-semibold text-[9px] text-white uppercase leading-none tracking-wider">
              You
            </span>
          </div>
        </foreignObject>
      )}

      <foreignObject x={node.x} y={node.y + 10} width={node.w} height={node.h}>
        <div className="flex flex-col items-center gap-0.5 text-center">
          <Icon
            className="size-4"
            style={{ color: active ? node.color : "var(--flow-icon-idle)" }}
          />
          <span
            className="font-semibold text-[12px] leading-tight"
            style={{
              color: active ? "var(--flow-label-active)" : "var(--flow-label)",
            }}
          >
            {node.label}
          </span>
          <span className="px-1 font-mono text-[9px] text-muted-foreground leading-tight">
            {node.sublabel}
          </span>
        </div>
      </foreignObject>
    </g>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-1 text-xs">
      <LegendItem
        className="bg-[var(--flow-cdn)]"
        label="Cache hit (no function run)"
      />
      <LegendItem
        className="bg-[var(--flow-api)]"
        label="Revalidation (ISR function runs, reaches provider)"
      />
    </div>
  );
}

function LegendItem({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("size-2 rounded-full", className)} />
      {label}
    </span>
  );
}
