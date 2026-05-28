import { NormalisedTrademark } from "./types";

const TOKEN_URL =
  "https://production.api.ipaustralia.gov.au/public/external-token-api/v1/access_token";
const BASE_URL =
  "https://production.api.ipaustralia.gov.au/public/australian-trade-mark-search-api/v1";

let cachedToken: { token: string; expiresAt: number } | null = null;

type TokenResult =
  | { kind: "ok"; token: string }
  | { kind: "missing" }
  | { kind: "error"; status: number; body: string };

async function getToken(): Promise<TokenResult> {
  const clientId = process.env.IPAU_CLIENT_ID;
  const clientSecret = process.env.IPAU_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return { kind: "missing" };
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return { kind: "ok", token: cachedToken.token };
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[IPAU] Token request failed: ${res.status}`, body);
    return { kind: "error", status: res.status, body };
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + 55 * 60 * 1000,
  };
  return { kind: "ok", token: cachedToken.token };
}

function findArray(obj: unknown): unknown[] {
  if (Array.isArray(obj)) return obj;
  if (obj && typeof obj === "object") {
    // trademarkIds is the canonical key on the live /search/quick
    // response — array of numeric-string app numbers.
    for (const key of ["trademarkIds", "tradeMarks", "results", "data", "body"]) {
      const val = (obj as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val;
    }
    for (const val of Object.values(obj as Record<string, unknown>)) {
      if (Array.isArray(val)) return val;
    }
  }
  return [];
}

function extractNumber(item: unknown): string | null {
  if (typeof item === "string") return item;
  if (typeof item === "number") return String(item);
  if (item && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    for (const key of [
      "applicationNumber",
      "number",
      "tradeMarkNumber",
      "id",
    ]) {
      if (obj[key] != null) return String(obj[key]);
    }
  }
  return null;
}

// Detail-fetch budget per variant query. Total per check ≈
// (per-variant detail count) × (variant count) + (variant count for
// search calls). With ~4 variants × 30 details + 4 searches = ~124
// requests vs the 600/min SLA on the Base Tier.
const DETAIL_LIMIT_PER_DIRECTION = 15;

// Sort directions to fan out — captures both new pending applications
// (DESCENDING by app number = newest first) and long-standing registered
// marks (ASCENDING = oldest first). For brand-name searches like
// "PAULS" with 500+ hits, NUMBER-descending alone misses 1990s-era
// registrations that are often the strongest legal conflicts.
type SortDir = "ASCENDING" | "DESCENDING";

async function searchOnce(
  token: string,
  term: string,
  direction: SortDir
): Promise<{ ids: string[]; error?: string }> {
  const res = await fetch(`${BASE_URL}/search/quick`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: term,
      // Filter at search time to live/pending — REMOVED, REFUSED, and
      // NEVER_REGISTERED add noise that the risk scorer would weight to
      // MINIMAL anyway. Saves ~50% of detail-fetch budget on common
      // queries.
      filters: {
        quickSearchType: ["WORD"],
        status: ["REGISTERED", "PENDING"],
      },
      sort: { field: "NUMBER", direction },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ids: [],
      error: `IP Australia search failed (${res.status}): ${body || res.statusText}`,
    };
  }
  const data = await res.json();
  const arr = findArray(data);
  const ids = arr
    .map(extractNumber)
    .filter((n): n is string => n !== null)
    .slice(0, DETAIL_LIMIT_PER_DIRECTION);
  return { ids };
}

export async function searchIPAU(term: string): Promise<{
  results: NormalisedTrademark[];
  error?: string;
}> {
  try {
    const tokenResult = await getToken();

    if (tokenResult.kind === "missing") {
      return {
        results: [],
        error:
          "IP Australia credentials not configured. Set IPAU_CLIENT_ID and IPAU_CLIENT_SECRET in Vercel env vars (register free at portal.api.ipaustralia.gov.au).",
      };
    }

    if (tokenResult.kind === "error") {
      return {
        results: [],
        error: `IP Australia token request failed (${tokenResult.status}): ${tokenResult.body || "check IPAU_CLIENT_ID and IPAU_CLIENT_SECRET are correct"}`,
      };
    }

    const token = tokenResult.token;

    // Two-direction sweep: oldest registered marks + newest pending apps.
    const [descRes, ascRes] = await Promise.all([
      searchOnce(token, term, "DESCENDING"),
      searchOnce(token, term, "ASCENDING"),
    ]);

    if (descRes.error && ascRes.error) {
      return { results: [], error: descRes.error };
    }

    const seenIds = new Set<string>();
    const numbers: string[] = [];
    for (const id of [...descRes.ids, ...ascRes.ids]) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      numbers.push(id);
    }

    if (numbers.length === 0) {
      return { results: [] };
    }

    const details = await Promise.allSettled(
      numbers.map(async (num) => {
        const res = await fetch(`${BASE_URL}/trade-mark/${num}`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          throw new Error(`${res.status}: ${errBody}`);
        }
        const record = await res.json();
        return normalise(record, num);
      })
    );

    const results: NormalisedTrademark[] = details
      .filter(
        (d): d is PromiseFulfilledResult<NormalisedTrademark> =>
          d.status === "fulfilled"
      )
      .map((d) => d.value);

    return { results };
  } catch (e) {
    console.error("[IPAU] Error:", e);
    return {
      results: [],
      error: `IP Australia error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function normalise(
  record: Record<string, unknown>,
  fallbackNumber: string
): NormalisedTrademark {
  // Real IPAU /trade-mark/{n} response uses `number` (numeric), `words`
  // (array of mark text strings), `owner` (array of {name,...}),
  // `statusGroup` + `statusCode` + `statusDetail`, and `goodsAndServices`
  // (array of {class, descriptionText}). Fields fall through to other
  // names defensively in case the API ever changes.

  const appNumber = String(
    record.number || record.applicationNumber || fallbackNumber
  );

  // Mark name: prefer joined `words`, fall back to legacy keys.
  const words = record.words as string[] | undefined;
  const markName =
    (Array.isArray(words) && words.length ? words.join(" / ") : "") ||
    String(record.name || record.wordMark || record.tradeMarkName || "") ||
    "(no word mark)";

  // Owner: `owner` is an array of party objects, OR (legacy) a single
  // object or `applicants` / `owners` arrays.
  const ownerArr =
    (Array.isArray(record.owner) ? (record.owner as Array<{ name?: string }>) : undefined) ||
    (record.owners as Array<{ name?: string }> | undefined) ||
    (record.applicants as Array<{ name?: string }> | undefined);
  const ownerSingle = !Array.isArray(record.owner)
    ? (record.owner as { name?: string } | undefined)
    : undefined;
  const owner =
    ownerArr?.[0]?.name || ownerSingle?.name || "Unknown";

  // Status: prefer statusGroup (REGISTERED/PENDING/REMOVED/REFUSED/
  // NEVER_REGISTERED) and tack on statusDetail when present so the UI
  // shows e.g. "REGISTERED — Registered: registered/protected".
  const statusGroup = record.statusGroup ? String(record.statusGroup) : "";
  const statusDetail = record.statusDetail ? String(record.statusDetail) : "";
  const status =
    [statusGroup, statusDetail].filter(Boolean).join(" — ") ||
    String(record.status || "UNKNOWN");

  // Nice classes: from goodsAndServices[].class, deduped, sorted numeric.
  const gAndS =
    (record.goodsAndServices as Array<{ class?: unknown }> | undefined) || [];
  const niceClasses = Array.from(
    new Set(
      gAndS
        .map((g) => g?.class)
        .filter((c) => c != null && c !== "")
        .map(String)
    )
  ).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  // Dates: lodgementDate / filingDate are usually the same; pick one.
  // enteredOnRegisterDate or registeredFromDate marks registration.
  const appDate =
    (record.lodgementDate as string | null) ||
    (record.filingDate as string | null) ||
    (record.applicationDate as string | null) ||
    null;
  const regDate =
    (record.enteredOnRegisterDate as string | null) ||
    (record.registeredFromDate as string | null) ||
    (record.registrationDate as string | null) ||
    null;

  return {
    id: `AU-${appNumber}`,
    source: "IPAU",
    markName,
    owner,
    status,
    niceClasses,
    appDate,
    regDate,
    jurisdiction: "AU",
    externalUrl: `https://search.ipaustralia.gov.au/trademarks/search/view/${appNumber}/details`,
    rawData: record,
  };
}
