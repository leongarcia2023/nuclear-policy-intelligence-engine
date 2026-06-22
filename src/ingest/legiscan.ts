import { Stage } from "./schema";

/**
 * Thin, rate-limit-aware LegiScan client wrapping the three operations the
 * delta pipeline needs:
 *   - getMasterListRaw  → per-bill { bill_id, number, change_hash } (cheap)
 *   - getBill           → metadata, sponsors, committee, history, progress
 *   - getBillText       → base64 document text
 *
 * LegiScan needs only a FREE key. This client is never constructed unless
 * LEGISCAN_API_KEY is present; without a key the pipeline runs on fixtures.
 * The delta logic (src/ingest/repo.ts) is what keeps this within rate limits:
 * only bills whose change_hash moved get a full getBill/getBillText.
 */

const BASE = "https://api.legiscan.com/";

export type MasterListEntry = {
  id: string; // our canonical "<STATE>:<number>"
  legiscan_id: number;
  bill_number: string;
  change_hash: string;
};

export type BillMeta = {
  legiscan_id: number;
  state: string;
  bill_number: string;
  title: string;
  sponsors: string[];
  committee: string | null;
  stage: Stage;
  last_action: string | null;
  history: { date: string; action: string; chamber?: string }[];
  texts: { doc_id: number; date: string }[]; // available document versions
  change_hash: string;
};

/** Map LegiScan numeric progress codes to our canonical stage. */
function mapProgress(progress: { event: number }[] | undefined): Stage {
  if (!progress || progress.length === 0) return "introduced";
  const max = Math.max(...progress.map((p) => p.event));
  // LegiScan event codes: 1 introduced, 2 engrossed, 3 enrolled, 4 passed,
  // 5 vetoed, 6 failed/dead.
  if (max >= 6) return "failed";
  if (max >= 4) return "enacted";
  if (max >= 3) return "enrolled";
  if (max >= 2) return "passed_one_chamber";
  return "introduced";
}

export class LegiScanClient {
  constructor(
    private readonly apiKey: string,
    private readonly minIntervalMs = 1100, // ≈ <1 req/s, well under LegiScan limits
  ) {}

  private lastCall = 0;

  /** Cooperative rate limiter: space calls by at least minIntervalMs. */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = this.lastCall + this.minIntervalMs - now;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCall = Date.now();
  }

  private async call<T>(op: string, params: Record<string, string>): Promise<T> {
    await this.throttle();
    const url = new URL(BASE);
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("op", op);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`LegiScan ${op} HTTP ${res.status}`);
    const json = (await res.json()) as { status: string } & Record<
      string,
      unknown
    >;
    if (json.status !== "OK") {
      throw new Error(`LegiScan ${op} status ${json.status}`);
    }
    return json as T;
  }

  /** getMasterListRaw — returns the cheap per-bill change_hash list. */
  async getMasterListRaw(state: string): Promise<MasterListEntry[]> {
    const json = await this.call<{
      masterlist: Record<
        string,
        { bill_id: number; number: string; change_hash: string }
      >;
    }>("getMasterListRaw", { state });
    const out: MasterListEntry[] = [];
    for (const [key, v] of Object.entries(json.masterlist)) {
      if (key === "session") continue; // the session metadata entry
      out.push({
        id: `${state.toUpperCase()}:${v.number}`,
        legiscan_id: v.bill_id,
        bill_number: v.number,
        change_hash: v.change_hash,
      });
    }
    return out;
  }

  /**
   * getSearchRaw — full-text search within a state for a query string.
   * Used by the held-out labeler (`npm run label`) to surface real bills to
   * hand-label. Returns bill_id + number + title so the operator can pick.
   */
  async getSearchRaw(
    state: string,
    query: string,
    page = 1,
  ): Promise<
    { bill_id: number; bill_number: string; title: string; state: string; relevance: number }[]
  > {
    const json = await this.call<{ searchresult: Record<string, any> }>(
      "getSearchRaw",
      { state, query, page: String(page) },
    );
    const out: {
      bill_id: number;
      bill_number: string;
      title: string;
      state: string;
      relevance: number;
    }[] = [];
    for (const [key, v] of Object.entries(json.searchresult ?? {})) {
      if (key === "summary") continue; // pagination metadata
      if (v && typeof v === "object" && "bill_id" in v) {
        out.push({
          bill_id: (v as any).bill_id,
          bill_number: (v as any).bill_number ?? "",
          title: (v as any).title ?? "",
          state: (v as any).state ?? state,
          relevance: (v as any).relevance ?? 0,
        });
      }
    }
    return out;
  }

  async getBill(legiscanId: number): Promise<BillMeta> {
    const json = await this.call<{ bill: any }>("getBill", {
      id: String(legiscanId),
    });
    const b = json.bill;
    return {
      legiscan_id: b.bill_id,
      state: b.state,
      bill_number: b.bill_number,
      title: b.title ?? "",
      sponsors: (b.sponsors ?? []).map((s: any) => s.name as string),
      committee: b.committee?.name ?? null,
      stage: mapProgress(b.progress),
      last_action: b.history?.[0]?.action ?? null,
      history: (b.history ?? []).map((h: any) => ({
        date: h.date,
        action: h.action,
        chamber: h.chamber,
      })),
      texts: (b.texts ?? []).map((t: any) => ({
        doc_id: t.doc_id,
        date: t.date ?? "",
      })),
      change_hash: b.change_hash,
    };
  }

  /** getBillText — returns decoded UTF-8 document text. */
  async getBillText(docId: number): Promise<string> {
    const json = await this.call<{ text: { doc: string; mime?: string } }>(
      "getBillText",
      { id: String(docId) },
    );
    return Buffer.from(json.text.doc, "base64").toString("utf8");
  }

  /** Pick the newest document version and return its decoded text ("" if none). */
  async getLatestText(meta: BillMeta): Promise<string> {
    if (meta.texts.length === 0) return "";
    const latest = [...meta.texts].sort((a, b) =>
      a.date < b.date ? 1 : -1,
    )[0];
    return this.getBillText(latest.doc_id);
  }
}
