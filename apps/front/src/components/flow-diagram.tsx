"use client";

// apps/front/src/components/flow-diagram.tsx
//
// A live architecture diagram that animates from the REAL poll state, plus a
// fleet of simulated peers, to show how the design behaves at scale.
//
//   • Ten browser clients poll independently. The highlighted one ("You") is the
//     real session and fires on actual polls; the other nine are simulated peers
//     that drift between active / idle / hidden over time (just like real users),
//     so their polling cadence rises and falls. All hit the CDN.
//   • The CDN serves the cached page WITHOUT running the ISR function — the
//     common case, and why cost doesn't scale with viewers.
//   • Only when the cache is stale does the CDN run the ISR function, which calls
//     back, which calls the third-party provider. That regenerated page is then
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
// Geometry.
// ---------------------------------------------------------------------------
const VB = { w: 960, h: 300 };

type ServiceId = "cdn" | "isr" | "back" | "api";

interface ServiceNode {
  id: ServiceId;
  label: string;
  sublabel: string;
  icon: typeof Globe;
  color: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const ROW_Y = 110;
const NODE_H = 78;
const NODE_W = 138;

const SERVICES: ServiceNode[] = [
  {
    id: "cdn",
    label: "CDN cache",
    sublabel: "cached HTML",
    icon: DatabaseZap,
    color: "var(--flow-cdn)",
    x: 300,
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
    x: 482,
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
    x: 664,
    y: ROW_Y,
    w: NODE_W,
    h: NODE_H,
  },
  {
    id: "api",
    label: "Provider",
    sublabel: "third party",
    icon: Globe,
    color: "var(--flow-api)",
    x: 866,
    y: ROW_Y,
    w: 62,
    h: NODE_H,
  },
];

// Ten clients in a compact 2-column × 5-row grid on the left.
const CLIENT_COUNT = 10;
const CLIENT_W = 96;
const CLIENT_H = 36;
const CLIENT_COL_GAP = 10;
const CLIENT_ROW_GAP = 9;
const CLIENT_X0 = 8;
const CLIENT_Y0 = 26;

interface ClientPos {
  index: number;
  x: number;
  y: number;
  cx: number; // right-edge centre, where its connection leaves
  cy: number;
}

const CLIENTS: ClientPos[] = Array.from({ length: CLIENT_COUNT }, (_, i) => {
  const col = i % 2;
  const row = Math.floor(i / 2);
  const x = CLIENT_X0 + col * (CLIENT_W + CLIENT_COL_GAP);
  const y = CLIENT_Y0 + row * (CLIENT_H + CLIENT_ROW_GAP);
  return { index: i, x, y, cx: x + CLIENT_W, cy: y + CLIENT_H / 2 };
});

const CLIENTS_RIGHT = CLIENT_X0 + 2 * CLIENT_W + CLIENT_COL_GAP;

interface BoundaryDef {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 14;
const VERCEL_X = 300 - PAD;
const VERCEL_RIGHT = 664 + NODE_W + PAD;
const BOUNDARIES: BoundaryDef[] = [
  {
    label: "CLIENTS",
    x: CLIENT_X0 - PAD,
    y: CLIENT_Y0 - 22,
    w: CLIENTS_RIGHT - CLIENT_X0 + PAD * 2,
    h: 5 * CLIENT_H + 4 * CLIENT_ROW_GAP + 34,
  },
  {
    label: "VERCEL",
    x: VERCEL_X,
    y: ROW_Y - 22,
    w: VERCEL_RIGHT - VERCEL_X,
    h: NODE_H + 32,
  },
  {
    label: "THIRD PARTY",
    x: 866 - PAD,
    y: ROW_Y - 22,
    w: 62 + PAD * 2,
    h: NODE_H + 32,
  },
];

function serviceById(id: ServiceId): ServiceNode {
  // biome-ignore lint/style/noNonNullAssertion: ids are static and known
  return SERVICES.find((n) => n.id === id)!;
}

// Curved path from a client's right edge to the CDN's left edge.
function clientToCdnPath(c: ClientPos): string {
  const cdn = serviceById("cdn");
  const x2 = cdn.x;
  const y2 = cdn.y + cdn.h / 2;
  const midX = (c.cx + x2) / 2;
  return `M ${c.cx} ${c.cy} C ${midX} ${c.cy}, ${midX} ${y2}, ${x2} ${y2}`;
}

function rowPath(from: ServiceId, to: ServiceId): string {
  const a = serviceById(from);
  const b = serviceById(to);
  const y = a.y + a.h / 2;
  return `M ${a.x + a.w} ${y} L ${b.x} ${y}`;
}

const CLIENT_CONN_IDS = CLIENTS.map((c) => `client${c.index}-cdn`);
const CONNECTIONS: { id: string; d: string }[] = [
  ...CLIENTS.map((c) => ({
    id: `client${c.index}-cdn`,
    d: clientToCdnPath(c),
  })),
  { id: "cdn-isr", d: rowPath("cdn", "isr") },
  { id: "isr-back", d: rowPath("isr", "back") },
  { id: "back-api", d: rowPath("back", "api") },
];

type Flow = "poll" | "revalidate";
type ClientMode = "active" | "idle" | "hidden";

interface ActiveParticle {
  id: string;
  connId: string;
  color: string;
  reverse: boolean;
  delay: number;
}

const REVALIDATE_WINDOW_MS = 5_000;

// Per-mode polling cadence (ms) for simulated peers. Hidden peers don't poll.
const MODE_INTERVAL: Record<Exclude<ClientMode, "hidden">, number> = {
  active: 5_000,
  idle: 60_000,
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// Weighted next mode: mostly active, sometimes idle, occasionally hidden.
function nextMode(): ClientMode {
  const r = Math.random();
  if (r < 0.55) return "active";
  if (r < 0.85) return "idle";
  return "hidden";
}

interface PeerState {
  mode: ClientMode;
  nextPollAt: number;
  nextModeChangeAt: number;
}

export function FlowDiagram() {
  const state = usePollState();
  const [particles, setParticles] = useState<ActiveParticle[]>([]);
  const [activeServices, setActiveServices] = useState<Map<ServiceId, Flow>>(
    new Map(),
  );
  const [activeConns, setActiveConns] = useState<Map<string, Flow>>(new Map());
  // Lit clients (just polled) and each peer's current mode for styling.
  const [litClients, setLitClients] = useState<Set<number>>(new Set());
  const [clientModes, setClientModes] = useState<Map<number, ClientMode>>(
    () => new Map(CLIENTS.map((c) => [c.index, "active" as ClientMode])),
  );

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
    litService(services: ServiceId[], conns: string[], flow: Flow, ms: number) {
      setActiveServices((prev) => {
        const next = new Map(prev);
        for (const n of services) next.set(n, flow);
        return next;
      });
      setActiveConns((prev) => {
        const next = new Map(prev);
        for (const c of conns) next.set(c, flow);
        return next;
      });
      const key = `${flow}-${seqRef.current++}`;
      const t = setTimeout(() => {
        setActiveServices((prev) => {
          const next = new Map(prev);
          for (const n of services) if (next.get(n) === flow) next.delete(n);
          return next;
        });
        setActiveConns((prev) => {
          const next = new Map(prev);
          for (const c of conns) if (next.get(c) === flow) next.delete(c);
          return next;
        });
        litTimers.current.delete(key);
      }, ms);
      litTimers.current.set(key, t);
    },
    litClient(index: number) {
      setLitClients((prev) => new Set(prev).add(index));
      const key = `cl-${index}-${seqRef.current++}`;
      const t = setTimeout(() => {
        setLitClients((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
        litTimers.current.delete(key);
      }, 950);
      litTimers.current.set(key, t);
    },
  });

  // A cache hit: client → CDN → client. Never runs the ISR function.
  const emitCacheHit = useRef((index: number) => {
    const connId = `client${index}-cdn`;
    const color = index === 0 ? "var(--flow-browser)" : "var(--flow-peer)";
    const id = `c${seqRef.current++}`;
    helpers.current.addParticles([
      { id: `${id}-req`, connId, color, reverse: false, delay: 0 },
      {
        id: `${id}-res`,
        connId,
        color: "var(--flow-cdn)",
        reverse: true,
        delay: 0.4,
      },
    ]);
    helpers.current.litClient(index);
    helpers.current.litService(["cdn"], [connId], "poll", 1000);
  });

  // The real session ("You" = client 0): fire a cache hit on every poll, and
  // roughly once per revalidate window also run the ISR function to the provider.
  useEffect(() => {
    if (state.pollCount === lastPollRef.current) return;
    lastPollRef.current = state.pollCount;
    if (state.pollCount === 0) return;

    emitCacheHit.current(0);

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
      helpers.current.litService(
        ["cdn", "isr", "back", "api"],
        ["cdn-isr", "isr-back", "back-api"],
        "revalidate",
        3200,
      );
    }
  }, [state.pollCount, state.status]);

  // Nine simulated peers (clients 1..9) with their own mode state machines. A
  // single ticking loop advances every peer: when its mode timer expires it may
  // switch between active / idle / hidden; when its poll timer expires (and it
  // isn't hidden) it fires a cache hit.
  useEffect(() => {
    const peers = new Map<number, PeerState>();
    const now0 = Date.now();
    for (let i = 1; i < CLIENT_COUNT; i++) {
      peers.set(i, {
        mode: "active",
        // Stagger initial polls so they don't fire in lockstep.
        nextPollAt: now0 + rand(500, MODE_INTERVAL.active),
        nextModeChangeAt: now0 + rand(6_000, 16_000),
      });
    }

    const tick = () => {
      const now = Date.now();
      const modeChanges: [number, ClientMode][] = [];
      for (const [index, p] of peers) {
        if (now >= p.nextModeChangeAt) {
          const m = nextMode();
          if (m !== p.mode) {
            p.mode = m;
            modeChanges.push([index, m]);
          }
          p.nextModeChangeAt = now + rand(6_000, 18_000);
          // Reschedule next poll to fit the new cadence.
          if (m !== "hidden") {
            p.nextPollAt = Math.min(
              p.nextPollAt,
              now + rand(300, MODE_INTERVAL[m]),
            );
          }
        }
        if (p.mode !== "hidden" && now >= p.nextPollAt) {
          emitCacheHit.current(index);
          const base = MODE_INTERVAL[p.mode];
          p.nextPollAt = now + base + rand(-base * 0.15, base * 0.15);
        }
      }
      if (modeChanges.length > 0) {
        setClientModes((prev) => {
          const next = new Map(prev);
          for (const [i, m] of modeChanges) next.set(i, m);
          return next;
        });
      }
    };

    const id = setInterval(tick, 250);
    return () => clearInterval(id);
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
          provider, and that one result is shared by every client. The peers
          drift between active, idle, and hidden over time.
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
                isClient={CLIENT_CONN_IDS.includes(c.id)}
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

            {CLIENTS.map((c) => (
              <ClientChip
                key={c.index}
                pos={c}
                primary={c.index === 0}
                mode={
                  c.index === 0
                    ? "active"
                    : (clientModes.get(c.index) ?? "active")
                }
                lit={litClients.has(c.index)}
              />
            ))}

            {SERVICES.map((n) => (
              <ServiceNodeView
                key={n.id}
                node={n}
                flow={activeServices.get(n.id) ?? null}
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
        const labelW = b.label.length * 7.2 + 16;
        return (
          <g key={b.label}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={14}
              className="fill-foreground/[0.015] stroke-border"
              strokeWidth={1}
              strokeDasharray="5 5"
            />
            <rect
              x={b.x + 12}
              y={b.y - 10}
              width={labelW}
              height={20}
              rx={5}
              className="fill-background stroke-border"
              strokeWidth={1}
            />
            <text
              x={b.x + 12 + labelW / 2}
              y={b.y + 3}
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

function ConnectionLine({
  d,
  flow,
  isClient,
}: {
  d: string;
  flow: Flow | null;
  isClient: boolean;
}) {
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
      animate={{
        strokeWidth: active ? 2 : 1,
        opacity: active ? 1 : isClient ? 0.28 : 0.45,
      }}
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
      r={4}
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

const MODE_META: Record<ClientMode, { dot: string; label: string }> = {
  active: { dot: "var(--flow-peer)", label: "polling" },
  idle: { dot: "var(--flow-back)", label: "idle" },
  hidden: { dot: "var(--flow-idle)", label: "hidden" },
};

function ClientChip({
  pos,
  primary,
  mode,
  lit,
}: {
  pos: ClientPos;
  primary: boolean;
  mode: ClientMode;
  lit: boolean;
}) {
  const hidden = mode === "hidden";
  const accent = primary ? "var(--flow-browser)" : "var(--flow-peer)";
  const stroke = lit
    ? primary
      ? "var(--flow-browser)"
      : "var(--flow-cdn)"
    : primary
      ? "var(--flow-browser)"
      : "var(--flow-idle)";
  return (
    <g>
      <motion.rect
        x={pos.x}
        y={pos.y}
        width={CLIENT_W}
        height={CLIENT_H}
        rx={8}
        className="fill-foreground/[0.025]"
        animate={{
          stroke,
          strokeWidth: lit ? 1.6 : primary ? 1.4 : 1,
          opacity: hidden ? 0.4 : 1,
          filter: lit
            ? `drop-shadow(0 0 7px ${primary ? "var(--flow-browser)" : "var(--flow-cdn)"})`
            : "drop-shadow(0 0 0px transparent)",
        }}
        strokeDasharray={hidden ? "3 3" : undefined}
        transition={{ duration: 0.2 }}
      />
      <foreignObject x={pos.x} y={pos.y} width={CLIENT_W} height={CLIENT_H}>
        <div className="flex h-full items-center gap-1.5 px-2">
          <MonitorSmartphone
            className="size-3.5 shrink-0"
            style={{
              color: hidden
                ? "var(--flow-icon-idle)"
                : primary
                  ? accent
                  : "var(--flow-icon-idle)",
            }}
          />
          <div className="flex min-w-0 flex-col leading-none">
            <span
              className="truncate font-semibold text-[10px]"
              style={{
                color: primary
                  ? "var(--flow-label-active)"
                  : "var(--flow-label)",
              }}
            >
              {primary ? "You" : `Client ${pos.index}`}
            </span>
            <span className="flex items-center gap-1 font-mono text-[8px] text-muted-foreground">
              <span
                className="inline-block size-1 rounded-full"
                style={{ background: primary ? accent : MODE_META[mode].dot }}
              />
              {primary ? "this tab" : MODE_META[mode].label}
            </span>
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

function ServiceNodeView({
  node,
  flow,
}: {
  node: ServiceNode;
  flow: Flow | null;
}) {
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
      <LegendItem
        className="bg-[var(--flow-back)]"
        label="Peer idle / hidden"
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
