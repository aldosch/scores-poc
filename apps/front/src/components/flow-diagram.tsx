"use client";

// apps/front/src/components/flow-diagram.tsx
//
// A live architecture diagram that animates from the REAL poll state. It reads
// the same PollMonitor the visualiser uses, so particles fire as the system
// actually works:
//
//   • Every client poll  → Browser ⇄ Vercel Edge (a CDN cache hit; back is not
//     touched). This is the frequent, cheap path.
//   • Periodically (≈ the ISR revalidate window) the Edge regenerates the page
//     in the background: Edge → back → External API and back again. This is the
//     only path that reaches the third-party provider.
//
// The revalidation cadence is illustrative: the client can't observe an edge
// regeneration directly, so we model "roughly one per revalidate window" to show
// where the third-party cost actually lands.

import { AnimatePresence, motion } from "framer-motion";
import { Globe, MonitorSmartphone, Server, Zap } from "lucide-react";
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
// Geometry. A wide, short viewBox with four nodes in a row.
// ---------------------------------------------------------------------------
const VB = { w: 880, h: 300 };

type NodeId = "browser" | "edge" | "back" | "api";

interface NodeDef {
  id: NodeId;
  label: string;
  sublabel: string;
  icon: typeof Globe;
  color: string; // CSS color for stroke/glow/particles
  x: number;
  y: number;
  w: number;
  h: number;
}

const NODE_W = 168;
const NODE_H = 92;
const ROW_Y = 120;

const NODES: NodeDef[] = [
  {
    id: "browser",
    label: "Browser",
    sublabel: "router.refresh()",
    icon: MonitorSmartphone,
    color: "var(--flow-browser)",
    x: 8,
    y: ROW_Y,
    w: NODE_W,
    h: NODE_H,
  },
  {
    id: "edge",
    label: "Vercel Edge",
    sublabel: "ISR · revalidate 5s",
    icon: Zap,
    color: "var(--flow-edge)",
    x: 244,
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
    x: 480,
    y: ROW_Y,
    w: NODE_W,
    h: NODE_H,
  },
  {
    id: "api",
    label: "Provider API",
    sublabel: "third party",
    icon: Globe,
    color: "var(--flow-api)",
    x: 716,
    y: ROW_Y,
    w: 156,
    h: NODE_H,
  },
];

interface BoundaryDef {
  label: string;
  x: number;
  w: number;
  color: string;
}

const PAD = 14;
const BOUNDARIES: BoundaryDef[] = [
  {
    label: "CLIENT",
    x: 8 - PAD,
    w: NODE_W + PAD * 2,
    color: "var(--flow-browser)",
  },
  {
    label: "VERCEL EDGE",
    x: 244 - PAD,
    w: NODE_W + PAD * 2,
    color: "var(--flow-edge)",
  },
  {
    label: "INTERNAL",
    x: 480 - PAD,
    w: NODE_W + PAD * 2,
    color: "var(--flow-back)",
  },
  {
    label: "THIRD PARTY",
    x: 716 - PAD,
    w: 156 + PAD * 2,
    color: "var(--flow-api)",
  },
];

function nodeById(id: NodeId): NodeDef {
  // biome-ignore lint/style/noNonNullAssertion: ids are static and known
  return NODES.find((n) => n.id === id)!;
}

// Straight horizontal path between the right edge of `from` and left edge of
// `to`, at the shared row centre line.
function edgePath(from: NodeId, to: NodeId): string {
  const a = nodeById(from);
  const b = nodeById(to);
  const y = a.y + a.h / 2;
  return `M ${a.x + a.w} ${y} L ${b.x} ${y}`;
}

const CONNECTIONS: { id: string; from: NodeId; to: NodeId; d: string }[] = [
  {
    id: "browser-edge",
    from: "browser",
    to: "edge",
    d: edgePath("browser", "edge"),
  },
  { id: "edge-back", from: "edge", to: "back", d: edgePath("edge", "back") },
  { id: "back-api", from: "back", to: "api", d: edgePath("back", "api") },
];

type Flow = "poll" | "revalidate";

interface ActiveParticle {
  id: string;
  connId: string;
  color: string;
  reverse: boolean;
  delay: number;
  flow: Flow;
}

const REVALIDATE_WINDOW_MS = 5_000;

export function FlowDiagram() {
  const state = usePollState();
  const [particles, setParticles] = useState<ActiveParticle[]>([]);
  // Nodes lit up right now, mapped to the flow that lit them.
  const [activeNodes, setActiveNodes] = useState<Map<NodeId, Flow>>(new Map());
  const [activeConns, setActiveConns] = useState<Map<string, Flow>>(new Map());

  const lastPollRef = useRef(0);
  const lastRevalidateAtRef = useRef(0);
  const seqRef = useRef(0);
  const litTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  // Fire animations whenever a new poll lands.
  useEffect(() => {
    if (state.pollCount === lastPollRef.current) return;
    lastPollRef.current = state.pollCount;
    if (state.pollCount === 0) return;

    const now = Date.now();
    // Every poll is a Browser ⇄ Edge cache hit.
    emitPoll();

    // Roughly once per revalidate window, also show a background regeneration
    // reaching back and the provider. Only while actively polling.
    if (
      state.status === "polling" &&
      now - lastRevalidateAtRef.current >= REVALIDATE_WINDOW_MS
    ) {
      lastRevalidateAtRef.current = now;
      emitRevalidate();
    }

    function emitPoll() {
      const id = `p${seqRef.current++}`;
      addParticles([
        {
          id: `${id}-req`,
          connId: "browser-edge",
          color: "var(--flow-browser)",
          reverse: false,
          delay: 0,
          flow: "poll",
        },
        {
          id: `${id}-res`,
          connId: "browser-edge",
          color: "var(--flow-edge)",
          reverse: true,
          delay: 0.45,
          flow: "poll",
        },
      ]);
      lightUp(["browser", "edge"], ["browser-edge"], "poll", 1000);
    }

    function emitRevalidate() {
      const id = `r${seqRef.current++}`;
      addParticles([
        // Edge → back → provider, then echo back.
        {
          id: `${id}-1`,
          connId: "edge-back",
          color: "var(--flow-edge)",
          reverse: false,
          delay: 0,
          flow: "revalidate",
        },
        {
          id: `${id}-2`,
          connId: "back-api",
          color: "var(--flow-back)",
          reverse: false,
          delay: 0.5,
          flow: "revalidate",
        },
        {
          id: `${id}-3`,
          connId: "back-api",
          color: "var(--flow-api)",
          reverse: true,
          delay: 1.0,
          flow: "revalidate",
        },
        {
          id: `${id}-4`,
          connId: "edge-back",
          color: "var(--flow-back)",
          reverse: true,
          delay: 1.5,
          flow: "revalidate",
        },
      ]);
      lightUp(
        ["edge", "back", "api"],
        ["edge-back", "back-api"],
        "revalidate",
        2200,
      );
    }

    function addParticles(p: ActiveParticle[]) {
      setParticles((prev) => [...prev, ...p]);
    }

    function lightUp(
      nodes: NodeId[],
      conns: string[],
      flow: Flow,
      durationMs: number,
    ) {
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
      const key = `${flow}-${seqRef.current}`;
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
    }
  }, [state.pollCount, state.status]);

  // Clean up pending timers on unmount.
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
          Animated from the live poll state. Most polls are a cheap Browser ⇄
          Edge cache hit; the provider is only reached when the Edge regenerates
          the page.
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
        const labelW = b.label.length * 7.2 + 18;
        return (
          <g key={b.label}>
            <rect
              x={b.x}
              y={70}
              width={b.w}
              height={180}
              rx={14}
              className="fill-foreground/[0.015] stroke-border"
              strokeWidth={1}
              strokeDasharray="5 5"
            />
            <rect
              x={b.x + 12}
              y={59}
              width={labelW}
              height={20}
              rx={5}
              className="fill-background stroke-border"
              strokeWidth={1}
            />
            <text
              x={b.x + 12 + labelW / 2}
              y={73}
              textAnchor="middle"
              className="fill-muted-foreground"
              fontSize={10}
              fontFamily="var(--font-geist-mono), monospace"
              letterSpacing="0.12em"
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
        flow === "poll" && "stroke-[var(--flow-edge)]",
        flow === "revalidate" && "stroke-[var(--flow-api)]",
      )}
      animate={{ strokeWidth: active ? 2 : 1.25, opacity: active ? 1 : 0.5 }}
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
          stroke: active ? node.color : "var(--flow-idle)",
          strokeWidth: active ? 1.8 : 1,
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
          initial={{ opacity: 0.5, scale: 1 }}
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

      <foreignObject
        x={node.x}
        y={node.y + 18}
        width={node.w}
        height={node.h - 24}
      >
        <div className="flex flex-col items-center gap-1.5 text-center">
          <Icon
            className="size-5"
            style={{ color: active ? node.color : "var(--flow-icon-idle)" }}
          />
          <span
            className="font-semibold text-[13px] leading-none"
            style={{
              color: active ? "var(--flow-label-active)" : "var(--flow-label)",
            }}
          >
            {node.label}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground leading-none">
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
        className="bg-[var(--flow-edge)]"
        label="Cache hit (every poll)"
      />
      <LegendItem
        className="bg-[var(--flow-api)]"
        label="Background revalidation (reaches provider)"
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
