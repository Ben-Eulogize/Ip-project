import { NormalisedTrademark } from "./types";

const BASE_URL =
  "https://production.api.ipaustralia.gov.au/public/australian-trade-mark-search-api/v1";

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
    const requestBody = {
      query: term,
      filters: { quickSearchType: ["WORD"] },
      sort: { field: "NUMBER", direction: "DESCENDING" },
    };

    console.log("[IPAU] Searching for:", term);
    console.log("[IPAU] Request body:", JSON.stringify(requestBody));

    const searchRes = await fetch(`${BASE_URL}/search/quick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!searchRes.ok) {
      const errorBody = await searchRes.text().catch(() => "");
      console.error(`[IPAU] Search failed: ${searchRes.status} ${searchRes.statusText}`, errorBody);
      return {
        results: [],
        error: `IP Australia search failed (${searchRes.status}): ${errorBody || searchRes.statusText}`,
      };
    }

    const searchData = await searchRes.json();
    console.log("[IPAU] Response keys:", Object.keys(searchData));

    const arr = findArray(searchData);
    const numbers = arr
      .map(extractNumber)
      .filter((n): n is string => n !== null)
      .slice(0, 20);

    console.log("[IPAU] Found", numbers.length, "trade mark numbers");

    if (numbers.length === 0) {
      return { results: [] };
    }

    const details = await Promise.allSettled(
      numbers.map(async (num) => {
        const res = await fetch(`${BASE_URL}/trade-mark/${num}`, {
          headers: { Accept: "application/json" },
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
