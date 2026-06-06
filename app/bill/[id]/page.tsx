import Link from "next/link";
import { notFound } from "next/navigation";
import { getBillView } from "@src/ui/data";
import { submitOverride } from "@src/ui/actions";
import { bandClass, directionClass } from "@src/ui/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function BillPage({ params }: { params: { id: string } }) {
  const id = decodeURIComponent(params.id);
  const view = getBillView(id);
  if (!view) notFound();
  const { bill, classification, score, memo, record, campaign } = view;
  const label = record?.active_label;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/desk" className="text-xs text-desk-muted hover:text-desk-text">
        ← Operator queue
      </Link>

      <header className="mt-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{bill.id}</h1>
          {score && (
            <span className={`border px-2 py-0.5 text-xs ${bandClass(score.band)}`}>
              {score.band.toUpperCase()} · {score.aggregate}
            </span>
          )}
          {classification?.is_indirect && (
            <span className="bg-signal-indirect/10 px-2 py-0.5 text-[11px] font-medium text-signal-indirect">
              ⚑ INDIRECT
            </span>
          )}
        </div>
        <p className="mt-1 text-desk-muted">{bill.title}</p>
        <p className="mt-1 text-xs text-desk-muted">
          {bill.state} · stage {bill.stage}
          {bill.committee ? ` · ${bill.committee}` : ""}
          {bill.sponsors.length ? ` · ${bill.sponsors.join(", ")}` : ""}
        </p>
      </header>

      {/* Memo */}
      {memo && (
        <section className="mt-8 border border-desk-line bg-desk-panel p-5">
          <h2 className="text-xs uppercase tracking-wider text-desk-muted">Memo</h2>
          <p className="mt-2 font-medium">{memo.headline}</p>
          <dl className="mt-3 space-y-2 text-sm">
            <Row k="What it does" v={memo.what_it_does} />
            <Row k="Why it matters" v={memo.why_it_matters} />
            <div>
              <dt className="text-xs uppercase tracking-wider text-desk-muted">Position</dt>
              <dd className="mt-1">
                <span className="font-semibold">{memo.position.toUpperCase()}</span>{" "}
                — {memo.recommended_action}
              </dd>
            </div>
          </dl>
          {memo.citations.length > 0 && (
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wider text-desk-muted">
                Cited sections
              </p>
              <ul className="mt-1 space-y-1 text-xs text-desk-muted">
                {memo.citations.map((c, i) => (
                  <li key={i} className="border-l-2 border-desk-line pl-2">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Score breakdown — every component's reasoning is visible. */}
      {score && (
        <section className="mt-6">
          <h2 className="text-xs uppercase tracking-wider text-desk-muted">
            Materiality breakdown
          </h2>
          <div className="mt-2 space-y-2">
            {Object.entries(score.components).map(([k, c]) => (
              <div key={k} className="border border-desk-line/60 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{k.replace(/_/g, " ")}</span>
                  <span className="tabular-nums text-desk-muted">{c.score}</span>
                </div>
                <p className="mt-1 text-xs text-desk-muted">{c.rationale}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Impact vectors */}
      {classification && classification.impact_vectors.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs uppercase tracking-wider text-desk-muted">
            Impact vectors
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {classification.impact_vectors.map((v, i) => (
              <li key={i} className="flex gap-2">
                <span className={`min-w-[3rem] ${directionClass(v.direction)}`}>
                  {v.direction}
                </span>
                <span className="text-desk-muted">{v.rationale}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Campaign membership */}
      {campaign && (
        <section className="mt-6 border border-desk-line/60 p-3 text-sm">
          <h2 className="text-xs uppercase tracking-wider text-desk-muted">
            Cross-state campaign
          </h2>
          <p className="mt-1">
            {campaign.headline} — {campaign.states.join(", ")} (similarity{" "}
            {campaign.similarity})
          </p>
        </section>
      )}

      {/* Override control — writes to the corpus */}
      {record && label && (
        <section className="mt-8 border border-desk-line bg-desk-panel p-5">
          <h2 className="text-xs uppercase tracking-wider text-desk-muted">
            Override (writes to judgment corpus)
          </h2>
          {record.override && (
            <p className="mt-1 text-[11px] text-desk-muted">
              Currently overridden by {record.override.by}. The model said:{" "}
              {record.model_label.suggested_position.toUpperCase()} /{" "}
              {record.model_label.materiality_band}.
            </p>
          )}
          <form action={submitOverride} className="mt-3 space-y-3 text-sm">
            <input type="hidden" name="record_id" value={record.record_id} />
            <input type="hidden" name="bill_id" value={bill.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Relevant">
                <select name="relevant" defaultValue={String(label.relevant)} className={selectCls}>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </Field>
              <Field label="Direction">
                <select name="direction" defaultValue={label.direction} className={selectCls}>
                  <option value="helps">helps</option>
                  <option value="hurts">hurts</option>
                  <option value="neutral">neutral</option>
                </select>
              </Field>
              <Field label="Position">
                <select
                  name="suggested_position"
                  defaultValue={label.suggested_position}
                  className={selectCls}
                >
                  <option value="support">support</option>
                  <option value="oppose">oppose</option>
                  <option value="amend">amend</option>
                  <option value="monitor">monitor</option>
                </select>
              </Field>
              <Field label="Materiality band">
                <select
                  name="materiality_band"
                  defaultValue={label.materiality_band}
                  className={selectCls}
                >
                  <option value="none">none</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reviewer">
                <input name="by" placeholder="you@desk" className={selectCls} />
              </Field>
              <Field label="Note">
                <input name="note" placeholder="rationale" className={selectCls} />
              </Field>
            </div>
            <button
              type="submit"
              className="border border-signal-high px-3 py-1.5 text-signal-high hover:bg-signal-high/10"
            >
              Save override
            </button>
          </form>

          {record.history.length > 0 && (
            <div className="mt-4">
              <p className="text-xs uppercase tracking-wider text-desk-muted">
                History ({record.history.length})
              </p>
              <ul className="mt-1 space-y-1 text-[11px] text-desk-muted">
                {record.history.map((h, i) => (
                  <li key={i}>
                    {h.at} · {h.source} · {h.label.suggested_position.toUpperCase()} /{" "}
                    {h.label.materiality_band}
                    {h.by ? ` · ${h.by}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

const selectCls =
  "w-full border border-desk-line bg-desk-bg px-2 py-1 text-desk-text";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-desk-muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-desk-muted">{k}</dt>
      <dd className="mt-1 leading-relaxed">{v}</dd>
    </div>
  );
}
