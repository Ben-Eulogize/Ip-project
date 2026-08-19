// Watch sweep - "what was filed recently that matches my watchlist?"
// This is the CC-IP-Watch capability living inside TM Researcher: an
// on-demand sweep of recent AU filings against a keyword watchlist,
// risk-scored by the same engine the availability checker uses.
//
// Recency strategy: the /page/advanced endpoint is queried NUMBER
// DESCENDING (application numbers are broadly sequential), and results
// are post-filtered by appDate against the cutoff. No `date` clause is
// sent - the OAS spec advertises one but its wire shape is unverified,
// and NUMBER-DESC + appDate filtering needs nothing beyond fields this
// client already trusts. We paginate deeper until a page yields zero
// in-window records or the page cap is hit.

import { NormalisedTrademark } from "./types";
import { searchAdvanced, AdvancedStatus } from "./ipau";
import { mockSearchIPAU } from "./mock-data";
import { distinctiveOf } from "./variants";
import {
  scoreTrademark,
  RiskFinding,
  compareFindings,
} from "./risk";

export type WatchRequest = {
  // Watch terms - a client brand, a conflict mark, a firm keyword.
  keywords: string[];
  // Lookback window in days.
  days: number;
  // Optional Nice classes of interest - used for risk scoring (class
  // overlap is a big part of the score). Search itself is unrestricted
  // so nothing in an unexpected class is missed.
  classes?: number[];
  forceMock?: boolean;
};

export type WatchMatch = {
  keyword: string;
  finding: RiskFinding;
};

export type WatchReport = {
  keywords: string[];
  days: number;
  cutoff: string; // ISO date of the window start
  matches: WatchMatch[];
  scanned: number; // unique marks pulled before date filtering
  undated: number; // marks dropped because IPAU returned no filing date
  truncated: string[]; // keywords where the page cap hit while still in-window
  source: "live" | "mock";
  errors: string[];
  method: string;
};

const PAGE_SIZE = 100;
const MAX_PAGES_PER_KEYWORD = 3;
const MAX_KEYWORDS = 15;

function searchTokenFor(keyword: string): string {
  const distinctive = distinctiveOf(keyword);
  if (distinctive.length > 0) return distinctive[0];
  const first = keyword.trim().split(/\s+/)[0];
  return first || keyword.trim();
}

export async function runWatchSweep(req: WatchRequest): Promise<WatchReport> {
  const keywords = req.keywords
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, MAX_KEYWORDS);
  const days = Math.min(Math.max(Math.round(req.days) || 7, 1), 90);
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  const useMock =
    req.forceMock === true || process.env.IPAU_MOCK_MODE === "true";

  const errors: string[] = [];
  const truncated: string[] = [];
  // mark id -> best-scoring (keyword, finding) pair
  const best = new Map<string, WatchMatch>();
  let scanned = 0;
  let undated = 0;

  // New filings inside a short window are almost always still PENDING,
  // but include REGISTERED so a longer window (90d) doesn't silently
  // drop marks that raced through examination.
  const statuses: AdvancedStatus[] = ["PENDING", "REGISTERED"];

  for (const keyword of keywords) {
    const token = searchTokenFor(keyword);
    if (!token) continue;

    if (useMock) {
      // Mock fixture has historical dates; skip the window filter so the
      // demo still demonstrates the flow.
      const r = await mockSearchIPAU(keyword);
      for (const tm of r.results) {
        scanned++;
        considerMatch(best, keyword, tm, req.classes);
      }
      continue;
    }

    let sawInWindow = false;
    for (let page = 0; page < MAX_PAGES_PER_KEYWORD; page++) {
      const r = await searchAdvanced({
        word: token,
        wordMatchType: "STEM",
        statuses,
        pageSize: PAGE_SIZE,
        pageNumber: page,
      });
      if (r.error) {
        errors.push(`"${keyword}": ${r.error}`);
        break;
      }

      let inWindowThisPage = 0;
      for (const tm of r.results) {
        scanned++;
        if (!tm.appDate) {
          undated++;
          continue;
        }
        const filedMs = Date.parse(tm.appDate);
        if (Number.isNaN(filedMs) || filedMs < cutoffMs) continue;
        inWindowThisPage++;
        sawInWindow = true;
        considerMatch(best, keyword, tm, req.classes);
      }

      const lastPage = r.results.length < PAGE_SIZE;
      if (lastPage || inWindowThisPage === 0) break;
      if (page === MAX_PAGES_PER_KEYWORD - 1 && inWindowThisPage > 0) {
        // Every page so far still had in-window records - deeper results
        // may exist that we did not pull. Flag it rather than hide it.
        truncated.push(keyword);
      }
    }
    void sawInWindow;
  }

  const matches = Array.from(best.values()).sort((a, b) => {
    const byRisk = compareFindings(a.finding, b.finding);
    if (byRisk !== 0) return byRisk;
    const da = a.finding.trademark.appDate || "";
    const db = b.finding.trademark.appDate || "";
    return db.localeCompare(da); // newest first within a level
  });

  return {
    keywords,
    days,
    cutoff,
    matches,
    scanned,
    undated,
    truncated,
    source: useMock ? "mock" : "live",
    errors,
    method: useMock
      ? "mock fixture (date filter skipped)"
      : "NUMBER-DESC pagination + appDate window filter",
  };
}

function considerMatch(
  best: Map<string, WatchMatch>,
  keyword: string,
  tm: NormalisedTrademark,
  classes?: number[]
) {
  const finding = scoreTrademark(
    { candidate: keyword, intendedClasses: classes ?? [] },
    tm
  );
  const existing = best.get(tm.id);
  if (!existing || finding.score > existing.finding.score) {
    best.set(tm.id, { keyword, finding });
  }
}
