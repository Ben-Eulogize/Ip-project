import { NormalisedTrademark } from "./types";

const TOKEN_URL = "https://production.api.euipo.europa.eu/oauth/token";
const SEARCH_URL =
  "https://production.api.euipo.europa.eu/trademark-search/v1/trademarks";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const clientId = process.env.EUIPO_CLIENT_ID;
  const clientSecret = process.env.EUIPO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("not_configured");
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
  });

  if (!res.ok) {
    throw new Error(`EUIPO auth failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + 55 * 60 * 1000, // 55 min TTL
  };
  return cachedToken.token;
}

function findResults(obj: unknown): unknown[] {
  if (Array.isArray(obj)) return obj;
  if (obj && typeof obj === "object") {
    for (const key of ["trademarks", "data", "results"]) {
      const val = (obj as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val;
    }
    for (const val of Object.values(obj as Record<string, unknown>)) {
      if (Array.isArray(val)) return val;
    }
  }
  return [];
}

export async function searchEUIPO(term: string): Promise<{
  results: NormalisedTrademark[];
  error?: string;
  notConfigured?: boolean;
}> {
  let token: string;
  try {
    token = await getToken();
  } catch (e) {
    if (e instanceof Error && e.message === "not_configured") {
      return {
        results: [],
        notConfigured: true,
        error:
          "EUIPO not configured. Set EUIPO_CLIENT_ID and EUIPO_CLIENT_SECRET environment variables.",
      };
    }
    return {
      results: [],
      error: `EUIPO auth error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  try {
    const url = new URL(SEARCH_URL);
    url.searchParams.set("query", term);
    url.searchParams.set("pageSize", "20");
    url.searchParams.set("pageNumber", "0");
    url.searchParams.set("sortBy", "applicationDate");
    url.searchParams.set("sortOrder", "desc");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return {
        results: [],
        error: `EUIPO search failed: ${res.status} ${res.statusText}`,
      };
    }

    const data = await res.json();
    const arr = findResults(data);

    return {
      results: arr.slice(0, 20).map((item) => normalise(item as Record<string, unknown>)),
    };
  } catch (e) {
    return {
      results: [],
      error: `EUIPO error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

function normalise(result: Record<string, unknown>): NormalisedTrademark {
  const appNumber = String(
    result.applicationNumber || result.number || result.id || "unknown"
  );

  const holders = result.holders as Array<{ name?: string }> | undefined;
  const applicants = result.applicants as Array<{ name?: string }> | undefined;

  const gs = (result.goodsAndServices || result.niceClasses || []) as Array<
    { classNumber?: unknown; niceClass?: unknown } | number | string
  >;

  return {
    id: `EU-${appNumber}`,
    source: "EUIPO",
    markName:
      String(result.wordMark || result.name || result.tradeMarkName || "") ||
      "(figurative)",
    owner: holders?.[0]?.name || applicants?.[0]?.name || "Unknown",
    status: String(result.tradeMarkStatus || result.status || "UNKNOWN"),
    niceClasses: gs
      .map((c) => {
        if (typeof c === "object" && c !== null) {
          const obj = c as { classNumber?: unknown; niceClass?: unknown };
          return obj.classNumber ?? obj.niceClass;
        }
        return c;
      })
      .filter(Boolean)
      .map(String),
    appDate: (result.applicationDate || null) as string | null,
    regDate: (result.registrationDate || null) as string | null,
    jurisdiction: "EU",
    externalUrl: result.applicationNumber
      ? `https://euipo.europa.eu/eSearch/#details/trademarks/${result.applicationNumber}`
      : null,
    rawData: result,
  };
}
