export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="text-xs uppercase tracking-widest text-desk-muted">
        Nuclear Policy Intelligence Engine
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-desk-text">Signal Desk</h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-desk-muted">
        Scaffold online. The operator queue, bill detail, and campaign views are
        built in Phase 8 over the classification, scoring, and campaign layers.
      </p>
      <a
        href="/desk"
        className="mt-6 inline-block border border-desk-line px-3 py-1.5 text-sm text-desk-text hover:border-signal-high"
      >
        Open the queue →
      </a>
    </main>
  );
}
