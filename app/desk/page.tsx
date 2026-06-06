import Link from "next/link";
import { getQueue, hasData } from "@src/ui/data";
import { bandClass, directionClass } from "@src/ui/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function DeskPage() {
  const ready = hasData();
  const queue = ready ? getQueue() : [];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-desk-muted">
            Nuclear Policy Intelligence
          </p>
          <h1 className="mt-1 text-xl font-semibold">Signal Desk — Operator Queue</h1>
        </div>
        <nav className="flex gap-4 text-sm text-desk-muted">
          <Link href="/campaigns" className="hover:text-desk-text">
            Campaigns →
          </Link>
        </nav>
      </header>

      {!ready ? (
        <EmptyState />
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-desk-line text-left text-xs uppercase tracking-wider text-desk-muted">
              <th className="py-2 pr-3 font-normal">Materiality</th>
              <th className="py-2 pr-3 font-normal">Bill</th>
              <th className="py-2 pr-3 font-normal">Signal</th>
              <th className="py-2 pr-3 font-normal">Dir</th>
              <th className="py-2 pr-3 font-normal">Position</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((r) => (
              <tr
                key={r.id}
                className="border-b border-desk-line/50 align-top hover:bg-desk-panel"
              >
                <td className="py-3 pr-3">
                  <span
                    className={`inline-block min-w-[3.5rem] border px-2 py-0.5 text-center text-xs ${bandClass(
                      r.band,
                    )}`}
                    title={`aggregate ${r.aggregate}`}
                  >
                    {r.band.toUpperCase()}
                  </span>
                  <div className="mt-1 text-[11px] text-desk-muted">{r.aggregate}</div>
                </td>
                <td className="py-3 pr-3">
                  <Link
                    href={`/bill/${encodeURIComponent(r.id)}`}
                    className="font-medium text-desk-text hover:text-signal-high"
                  >
                    {r.id}
                  </Link>
                  <div className="max-w-md text-desk-muted">{r.title}</div>
                  {r.is_indirect && (
                    <div className="mt-1 inline-block bg-signal-indirect/10 px-2 py-0.5 text-[11px] font-medium text-signal-indirect">
                      ⚑ INDIRECT — keyword search would miss this
                    </div>
                  )}
                  {r.overridden && (
                    <div className="mt-1 text-[11px] text-desk-muted">
                      ✎ human-overridden
                    </div>
                  )}
                </td>
                <td className="py-3 pr-3 text-desk-muted">
                  {r.relevant ? r.headline : "not relevant"}
                </td>
                <td className={`py-3 pr-3 ${directionClass(r.direction)}`}>
                  {r.direction}
                </td>
                <td className="py-3 pr-3 font-medium">{r.position.toUpperCase()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <div className="border border-desk-line bg-desk-panel p-6 text-sm text-desk-muted">
      <p className="text-desk-text">No data yet.</p>
      <p className="mt-2">
        Populate the store (zero API keys required):
      </p>
      <pre className="mt-3 bg-desk-bg p-3 text-xs text-desk-text">
        npm run pipeline
      </pre>
      <p className="mt-2">Then refresh this page.</p>
    </div>
  );
}
