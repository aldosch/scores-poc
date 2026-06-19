// apps/front/src/app/scores/layout.tsx
//
// Static shell. Included in the RSC payload on each router.refresh(), but React
// reconciliation skips it since nothing changes. Keep it lean.

export default function ScoresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Live Scores</h1>
        <p className="text-sm opacity-60">
          Updates every ~5s via ISR + RSC refresh. No WebSockets, no public JSON
          endpoint.
        </p>
      </header>
      {children}
    </div>
  );
}
