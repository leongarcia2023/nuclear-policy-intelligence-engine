import Link from "next/link";
import { getCampaignViews, hasData } from "@src/ui/data";
import { bandClass } from "@src/ui/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function CampaignsPage() {
  const ready = hasData();
  const views = ready ? getCampaignViews() : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-baseline justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-desk-muted">
            Cross-state model-bill detection
          </p>
          <h1 className="mt-1 text-xl font-semibold">Campaigns</h1>
        </div>
        <Link href="/desk" className="text-sm text-desk-muted hover:text-desk-text">
          ← Operator queue
        </Link>
      </header>

      {views.length === 0 ? (
        <p className="border border-desk-line bg-desk-panel p-5 text-sm text-desk-muted">
          No cross-state campaigns detected in the current store. (The 6-case gold
          fixture has no near-duplicates by design; ingest a session with template
          bills to populate this view.)
        </p>
      ) : (
        <div className="space-y-5">
          {views.map(({ campaign, members }) => (
            <section key={campaign.id} className="border border-desk-line bg-desk-panel p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="font-medium">{campaign.headline}</h2>
                <span className="text-xs text-desk-muted">
                  similarity {campaign.similarity}
                </span>
              </div>
              <p className="mt-1 text-xs text-desk-muted">
                {campaign.states.length} states · first seen {campaign.first_seen ?? "—"}
              </p>
              <ul className="mt-3 space-y-1 text-sm">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2">
                    <span className={`border px-1.5 text-[10px] ${bandClass(m.band)}`}>
                      {m.band.toUpperCase()}
                    </span>
                    <Link
                      href={`/bill/${encodeURIComponent(m.id)}`}
                      className="text-desk-text hover:text-signal-high"
                    >
                      {m.id}
                    </Link>
                    <span className="text-desk-muted">{m.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
