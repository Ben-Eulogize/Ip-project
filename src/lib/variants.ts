// Variant generation for trademark availability checks.
// Given a candidate brand name, produce alternate forms to widen the IPAU
// search net so that "Pauls Lemonade" also catches "Paul's", "Paul",
// "Pauls", and the descriptor-stripped "Lemonade" if it happens to be a
// distinctive standalone.

const DESCRIPTORS = new Set([
  // Generic product descriptors that rarely contribute to distinctiveness.
  "lemonade", "soda", "cola", "drink", "drinks", "beverage", "beverages",
  "water", "juice", "tea", "coffee", "beer", "ale", "wine", "spirits",
  "snack", "snacks", "chips", "biscuit", "biscuits", "cookie", "cookies",
  "candy", "lollies", "chocolate", "chocolates", "icecream", "ice-cream",
  "shop", "store", "co", "company", "corp", "corporation", "inc", "ltd",
  "pty", "ptyltd", "group", "holdings", "brands", "brand",
  "the", "and", "of", "&", "+",
]);

const STOPWORDS = new Set(["the", "and", "of", "a", "an", "for", "with"]);

function normalise(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function lower(s: string): string {
  return s.toLowerCase();
}

function tokens(s: string): string[] {
  // Preserves original case so that downstream query generation can
  // build "Paul's"/"Pauls" variants. Apostrophes stay attached.
  return normalise(s).split(/\s+/).filter(Boolean);
}

// Normalised tokens for comparison: lowercased, apostrophe-stripped,
// alphanumeric-only. Empty strings filtered out.
function normTokens(s: string): string[] {
  return normalise(s)
    .replace(/['']/g, "")
    .split(/\s+/)
    .map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean);
}

// Distinctive normalised tokens — strips descriptors and stopwords.
// Used by the risk scorer to detect dominant-element overlap.
export function distinctiveOf(s: string): string[] {
  return normTokens(s).filter(
    (t) => !STOPWORDS.has(t) && !DESCRIPTORS.has(t.replace(/[^a-z]/g, ""))
  );
}

function isDescriptor(word: string): boolean {
  return DESCRIPTORS.has(lower(word).replace(/[^a-z]/g, ""));
}

function isStopword(word: string): boolean {
  return STOPWORDS.has(lower(word));
}

function possessiveForms(word: string): string[] {
  const w = word;
  const lw = lower(w);
  const out = new Set<string>([w]);
  // Drop trailing s/'s/'.
  if (lw.endsWith("'s")) out.add(w.slice(0, -2));
  if (lw.endsWith("s'")) out.add(w.slice(0, -2));
  if (lw.endsWith("s") && !lw.endsWith("ss")) out.add(w.slice(0, -1));
  // Add trailing 's / s' / s.
  if (!lw.endsWith("s") && !lw.endsWith("'s")) {
    out.add(`${w}s`);
    out.add(`${w}'s`);
  }
  return Array.from(out);
}

export type VariantSet = {
  // The full original candidate, normalised.
  primary: string;
  // Queries to actually fire against IPAU /search/quick. Bounded list.
  queries: string[];
  // Distinctive words extracted from the candidate (excluding descriptors
  // and stopwords). Used for downstream scoring.
  distinctiveTokens: string[];
};

export function generateVariants(candidate: string): VariantSet {
  const primary = normalise(candidate);
  const tks = tokens(primary);

  const distinctive = tks.filter(
    (t) => !isStopword(t) && !isDescriptor(t)
  );

  const queries = new Set<string>();
  queries.add(primary);

  // Each distinctive token in possessive variants.
  for (const t of distinctive) {
    for (const p of possessiveForms(t)) {
      queries.add(p);
    }
  }

  // Pairs of distinctive tokens (in original order), useful when the
  // candidate has multiple distinctive words.
  if (distinctive.length >= 2) {
    queries.add(distinctive.join(" "));
  }

  // Full primary without descriptors.
  const stripped = tks.filter((t) => !isDescriptor(t)).join(" ");
  if (stripped && stripped !== primary) queries.add(stripped);

  // Possessive form of the whole primary.
  if (tks.length > 0) {
    const first = tks[0];
    for (const p of possessiveForms(first)) {
      if (p !== first) {
        queries.add([p, ...tks.slice(1)].join(" "));
      }
    }
  }

  // Cap to keep API usage bounded — most candidates yield 3–6 queries.
  const bounded = Array.from(queries).slice(0, 10);

  return {
    primary,
    queries: bounded,
    distinctiveTokens: distinctive.map(lower),
  };
}

// Edit distance for fuzzy name matching downstream (Levenshtein).
export function editDistance(a: string, b: string): number {
  const al = lower(a);
  const bl = lower(b);
  if (al === bl) return 0;
  if (!al.length) return bl.length;
  if (!bl.length) return al.length;

  const prev: number[] = new Array(bl.length + 1);
  const curr: number[] = new Array(bl.length + 1);
  for (let j = 0; j <= bl.length; j++) prev[j] = j;

  for (let i = 1; i <= al.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= bl.length; j++) {
      const cost = al[i - 1] === bl[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bl.length; j++) prev[j] = curr[j];
  }
  return prev[bl.length];
}

// Token-set similarity: fraction of distinctive tokens shared.
export function tokenSetSimilarity(a: string, b: string): number {
  const at = new Set(normTokens(a).filter((t) => !STOPWORDS.has(t)));
  const bt = new Set(normTokens(b).filter((t) => !STOPWORDS.has(t)));
  if (!at.size || !bt.size) return 0;
  let shared = 0;
  for (const t of Array.from(at)) if (bt.has(t)) shared++;
  return shared / Math.max(at.size, bt.size);
}

// Generate alternative brand names that keep the candidate's flavour but
// are likely less collision-prone. Used to suggest "what to try instead".
export function generateAlternativeNames(
  candidate: string,
  blockedTokens: Set<string>
): string[] {
  const primary = normalise(candidate);
  const tks = tokens(primary);
  const out = new Set<string>();

  const distinctive = tks.filter(
    (t) => !isStopword(t) && !isDescriptor(t)
  );

  // Drop the blocked token entirely if there's another distinctive word.
  if (distinctive.length >= 2) {
    const kept = tks.filter((t) => !blockedTokens.has(lower(t)));
    if (kept.length > 0 && kept.join(" ") !== primary) {
      out.add(kept.join(" "));
    }
  }

  // Prepend/append a differentiator. Real-world TM offices look at the
  // dominant element, so this won't always work — but it's a cheap signal
  // for the user that "more words" sometimes helps.
  const differentiators = ["True", "Real", "House", "Native", "Wild", "Co.", "Made"];
  for (const t of distinctive) {
    if (!blockedTokens.has(lower(t))) continue;
    for (const d of differentiators) {
      out.add(`${d} ${primary}`);
      out.add(`${primary} ${d}`);
    }
  }

  // Spelling variant of the blocked token (drop one letter, change
  // vowel). Cheap, sometimes useful.
  for (const t of distinctive) {
    if (!blockedTokens.has(lower(t))) continue;
    if (t.length < 4) continue;
    // a → e, e → a, o → a, u → o cycle.
    const swapped = t.replace(/[aeiou]/i, (v) => {
      const cycle: Record<string, string> = { a: "e", e: "a", i: "y", o: "a", u: "o", A: "E", E: "A", I: "Y", O: "A", U: "O" };
      return cycle[v] ?? v;
    });
    if (swapped !== t) {
      const replaced = tks.map((tok) => (tok === t ? swapped : tok)).join(" ");
      out.add(replaced);
    }
  }

  return Array.from(out).slice(0, 8);
}
