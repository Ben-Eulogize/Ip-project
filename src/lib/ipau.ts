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
    for (const key of ["tradeMarks", "results", "data", "body"]) {
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

    const searchRes = await fetch(`${BASE_URL}/search/quick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: term,
        filters: { quickSearchType: ["WORD"] },
        sort: { field: "NUMBER", direction: "DESCENDING" },
      }),
    });

    if (!searchRes.ok) {
      const errorBody = await searchRes.text().catch(() => "");
      console.error(`[IPAU] Search failed: ${searchRes.status}`, errorBody);
      return {
        results: [],
        error: `IP Australia search failed (${searchRes.status}): ${errorBody || searchRes.statusText}`,
      };
    }

    const searchData = await searchRes.json();
    const arr = findArray(searchData);
    const numbers = arr
      .map(extractNumber)
      .filter((n): n is string => n !== null)
      .slice(0, 20);

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
  const appNumber = String(
    record.applicationNumber || record.number || fallbackNumber
  );

  const applicants = record.applicants as Array<{ name?: string }> | undefined;
  const owners = record.owners as Array<{ name?: string }> | undefined;
  const ownerObj = record.owner as { name?: string } | undefined;

  const gsClasses = (record.goodsAndServicesClasses || []) as Array<
    { classNumber?: unknown } | number | string
  >;

  return {
    id: `AU-${appNumber}`,
    source: "IPAU",
    markName:
      String(record.name || record.wordMark || record.tradeMarkName || "") ||
      "(no word mark)",
    owner:
      applicants?.[0]?.name ||
      owners?.[0]?.name ||
      ownerObj?.name ||
      "Unknown",
    status: String(record.status || "UNKNOWN"),
    niceClasses: gsClasses
      .map((c) => {
        if (typeof c === "object" && c !== null)
          return (c as { classNumber?: unknown }).classNumber;
        return c;
      })
      .filter(Boolean)
      .map(String),
    appDate: (record.applicationDate || record.filingDate || null) as
      | string
      | null,
    regDate: (record.registrationDate || null) as string | null,
    jurisdiction: "AU",
    externalUrl: `https://search.ipaustralia.gov.au/trademarks/search/view/${appNumber}/details`,
    rawData: record,
  };
}
