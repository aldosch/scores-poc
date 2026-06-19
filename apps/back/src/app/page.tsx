export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>scores-poc · back</h1>
      <p>
        Internal scores API. The only route is <code>GET /api/scores</code>,
        which is protected by a Vercel Firewall rule requiring a valid{" "}
        <code>x-api-secret</code> header.
      </p>
    </main>
  );
}
