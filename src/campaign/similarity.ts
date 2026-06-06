/**
 * Deterministic, zero-cost lexical similarity for model-bill detection.
 * Template/model bills are near-verbatim copies across states, so lexical
 * similarity (TF-IDF cosine + MinHash Jaccard) is the correct tool — no API
 * embeddings needed (and they'd be non-deterministic and paid).
 */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "by", "with",
  "as", "at", "that", "this", "shall", "any", "no", "not", "be", "is", "are",
  "from", "which", "such", "all", "may", "an", "act", "relating", "section",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Build TF-IDF vectors for a corpus. Returns one Map<term, weight> per doc. */
export function tfidfVectors(docs: string[]): Map<string, number>[] {
  const tokenized = docs.map(tokenize);
  const N = docs.length;
  const df = new Map<string, number>();
  for (const toks of tokenized) {
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return tokenized.map((toks) => {
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    const vec = new Map<string, number>();
    for (const [term, count] of tf) {
      const idf = Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1;
      vec.set(term, count * idf);
    }
    return vec;
  });
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [term, wa] of small) {
    const wb = large.get(term);
    if (wb !== undefined) dot += wa * wb;
  }
  const norm = (m: Map<string, number>) =>
    Math.sqrt([...m.values()].reduce((s, w) => s + w * w, 0));
  const denom = norm(a) * norm(b);
  return denom === 0 ? 0 : dot / denom;
}

// --- MinHash (deterministic; fixed hash coefficients, no randomness) ---

const NUM_HASHES = 64;
const MOD = 2147483647; // 2^31 - 1, prime
// Fixed coefficients derived deterministically (a linear congruential sweep).
const COEFFS: { a: number; b: number }[] = Array.from(
  { length: NUM_HASHES },
  (_, i) => ({ a: 1 + i * 2654435761, b: 1 + i * 40503 }),
).map(({ a, b }) => ({ a: (a % MOD) || 1, b: b % MOD }));

/** FNV-1a 32-bit hash of a string → non-negative int. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** k-word shingles (default 3) as a set. */
export function shingles(text: string, k = 3): Set<string> {
  const toks = tokenize(text);
  const out = new Set<string>();
  if (toks.length < k) {
    if (toks.length) out.add(toks.join(" "));
    return out;
  }
  for (let i = 0; i + k <= toks.length; i++) out.add(toks.slice(i, i + k).join(" "));
  return out;
}

export function minhashSignature(text: string): number[] {
  const sh = shingles(text);
  const sig = new Array(NUM_HASHES).fill(Infinity);
  for (const s of sh) {
    const x = fnv1a(s);
    for (let i = 0; i < NUM_HASHES; i++) {
      const h = (Math.imul(COEFFS[i].a, x) + COEFFS[i].b) % MOD >>> 0;
      if (h < sig[i]) sig[i] = h;
    }
  }
  return sig;
}

/** Estimated Jaccard from two MinHash signatures. */
export function minhashJaccard(sigA: number[], sigB: number[]): number {
  let eq = 0;
  const n = Math.min(sigA.length, sigB.length);
  for (let i = 0; i < n; i++) if (sigA[i] === sigB[i] && sigA[i] !== Infinity) eq++;
  return n === 0 ? 0 : eq / n;
}
