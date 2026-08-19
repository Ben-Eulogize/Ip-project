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

// /page/advanced — request shape per the official OAS spec. Each row is
// an AND/OR/AND_NOT-combined sub-query; the inner query supports word,
// image, classNumber, owner, date, statuses, kinds, etc. The endpoint
// returns full detail records inline (no N+1 fan-out).
type AdvancedQuery = {
  word?: { text: string; type: WordMatchType };
  image?: { text: string; type: "EXACT" | "PART" };
  classNumber?: { text: string; type: "SINGLE" | "ASSOCIATED" | "ASSOCIATED_PRE_2012" };
  goodsAndServices?: string;
  owner?: string;
  trademarkNumber?: string;
  irNumber?: string;
  statuses?: AdvancedStatus[];
  kinds?: MarkKind[];
};

export type WordMatchType =
  | "EXACT"
  | "PREFIX"
  | "PART"
  | "SUFFIX"
  | "PHONETIC"
  | "FUZZY"
  | "STEM"
  | "NON_WILDCARD_EXACT"
  | "WORD_ONLY_EXACT"
  | "TRANSLITERATION_EXACT";

export type AdvancedStatus =
  | "PENDING_REGISTERED_REFUSED"
  | "PENDING_REGISTERED"
  | "PENDING"
  | "REGISTERED"
  | "REFUSED"
  | "REMOVED"
  | "NEVER_REGISTERED"
  | "DISCONTINUED";

export type MarkKind =
  | "WORD"
  | "FIGURATIVE"
  | "FANCY"
  | "COLOUR"
  | "SCENT"
  | "SHAPE"
  | "SOUND"
  | "MOVEMENT"
  | "FEEL"
  | "HOLOGRAM"
  | "POSITION"
  | "TASTE"
  | "TRACER"
  | "OTHER";

export type AdvancedRow = {
  op: "AND" | "OR" | "AND_NOT";
  query: AdvancedQuery;
};

export type AdvancedSearchInput = {
  word?: string;
  wordMatchType?: WordMatchType;
  classes?: number[];
  imageKeywords?: string; // Vienna-style image description tokens — e.g. "STAR,CIRCLE,RED"
  // Restrict to live/pending by default; expand if caller passes otherwise.
  statuses?: AdvancedStatus[];
  pageSize?: number;
  // Zero-based page for walking deeper into NUMBER-DESC results (the
  // watch sweep paginates until it crosses its date cutoff).
  pageNumber?: number;
};

/**
 * Run an advanced search via /page/advanced. Returns full detail records
 * inline — no N+1 fan-out to /trade-mark/{id}. Handles status filtering
 * and Nice class filtering at search time so the result set is already
 * risk-relevant.
 */
export async function searchAdvanced(
  input: AdvancedSearchInput
): Promise<{ results: NormalisedTrademark[]; total: number; error?: string }> {
  const tokenResult = await getToken();
  if (tokenResult.kind === "missing") {
    return {
      results: [],
      total: 0,
      error:
        "IP Australia credentials not configured. Set IPAU_CLIENT_ID and IPAU_CLIENT_SECRET in Vercel env vars.",
    };
  }
  if (tokenResult.kind === "error") {
    return {
      results: [],
      total: 0,
      error: `IP Australia token request failed (${tokenResult.status}): ${tokenResult.body || "check credentials"}`,
    };
  }

  const token = tokenResult.token;
  const statuses = input.statuses ?? ["REGISTERED", "PENDING"];
  const pageSize = Math.min(input.pageSize ?? 50, 100);

  // Build one row per intended class. If no classes specified, single row
  // with no class filter. Rows are OR-joined so any class-row matching
  // pulls the mark in.
  const rows: AdvancedRow[] = [];
  const classes = input.classes && input.classes.length ? input.classes : [null];
  for (const cls of classes) {
    const query: AdvancedQuery = { statuses };
    if (input.word) {
      query.word = {
        text: input.word,
        type: input.wordMatchType ?? "STEM",
      };
    }
    if (input.imageKeywords && input.imageKeywords.trim()) {
      query.image = { text: input.imageKeywords.trim(), type: "PART" };
    }
    if (cls != null) {
      query.classNumber = { text: String(cls), type: "SINGLE" };
    }
    rows.push({ op: rows.length === 0 ? "AND" : "OR", query });
  }

  const body = {
    pageSize,
    pageNumber: input.pageNumber ?? 0,
    sort: { field: "NUMBER", direction: "DESCENDING" as const },
    rows,
  };

  try {
    const res = await fetch(`${BASE_URL}/page/advanced`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error(`[IPAU] /page/advanced failed: ${res.status}`, errBody);
      return {
        results: [],
        total: 0,
        error: `IP Australia advanced search failed (${res.status}): ${errBody || res.statusText}`,
      };
    }
    const data = await res.json();
    const raw = Array.isArray(data?.trademarks) ? data.trademarks : [];
    const total = typeof data?.count === "number" ? data.count : raw.length;
    // Drop the negative-ID prohibited-marks rows — they're noise for a
    // commercial availability check.
    const results: NormalisedTrademark[] = raw
      .filter((tm: { number?: unknown }) => {
        const n = Number(tm.number);
        return Number.isFinite(n) && n > 0;
      })
      .map((tm: Record<string, unknown>) => normalise(tm, String(tm.number)));
    return { results, total };
  } catch (e) {
    console.error("[IPAU] /page/advanced error:", e);
    return {
      results: [],
      total: 0,
      error: `IP Australia error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Legacy single-term searcher — kept for the batch UI at /batch. Wraps
 * the new advanced search using STEM word matching (the closest analog
 * to ATMOSS's default behaviour). The risk-classifier uses
 * searchAdvanced directly.
 */
export async function searchIPAU(term: string): Promise<{
  results: NormalisedTrademark[];
  error?: string;
}> {
  const r = await searchAdvanced({ word: term, wordMatchType: "STEM" });
  return { results: r.results, error: r.error };
}

function normalise(
  record: Record<string, unknown>,
  fallbackNumber: string
): NormalisedTrademark {
  const appNumber = String(
    record.number || record.applicationNumber || fallbackNumber
  );

  const words = record.words as string[] | undefined;
  const markName =
    (Array.isArray(words) && words.length ? words.join(" / ") : "") ||
    String(record.name || record.wordMark || record.tradeMarkName || "") ||
    "(no word mark)";

  const ownerArr =
    (Array.isArray(record.owner) ? (record.owner as Array<{ name?: string }>) : undefined) ||
    (record.owners as Array<{ name?: string }> | undefined) ||
    (record.applicants as Array<{ name?: string }> | undefined);
  const ownerSingle = !Array.isArray(record.owner)
    ? (record.owner as { name?: string } | undefined)
    : undefined;
  const owner = ownerArr?.[0]?.name || ownerSingle?.name || "Unknown";

  const statusGroup = record.statusGroup ? String(record.statusGroup) : "";
  const statusDetail = record.statusDetail ? String(record.statusDetail) : "";
  const status =
    [statusGroup, statusDetail].filter(Boolean).join(" — ") ||
    String(record.status || "UNKNOWN");

  const gAndS =
    (record.goodsAndServices as Array<{ class?: unknown }> | undefined) || [];
  const niceClasses = Array.from(
    new Set(
      gAndS
        .map((g) => g?.class)
        .filter((c) => c != null && c !== "" && c !== "All")
        .map(String)
    )
  ).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

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

  // Image data — figurative marks have CDN thumbnail URLs and
  // Vienna-style description keywords.
  const imagesObj = record.images as
    | { description?: string[]; images?: string[] }
    | undefined;
  const imageUrls = Array.isArray(imagesObj?.images)
    ? imagesObj!.images!.filter((u): u is string => typeof u === "string")
    : [];
  const imageDescription = Array.isArray(imagesObj?.description)
    ? imagesObj!.description!.filter((d): d is string => typeof d === "string")
    : [];

  const kindsArr = record.kind as string[] | undefined;
  const kinds = Array.isArray(kindsArr) ? kindsArr : [];

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
    imageUrls,
    imageDescription,
    kinds,
    rawData: record,
  };
}
