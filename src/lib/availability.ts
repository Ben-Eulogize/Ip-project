import { NormalisedTrademark } from "./types";
import { searchIPAU } from "./ipau";
import { mockSearchIPAU } from "./mock-data";
import { generateVariants, generateAlternativeNames } from "./variants";
import { scoreTrademark, RiskFinding, compareFindings, LEVEL_ORDER, RiskLevel } from "./risk";
import { detectClasses, getNiceClass, relatedClasses } from "./nice-classes";

export type AvailabilityRequest = {
  candidate: string;
  // Intended Nice classes. If empty, we attempt auto-detection from
  // `productDescription` (or from the candidate text).
  intendedClasses?: number[];
  productDescription?: string;
  // Force demo data — used when the API isn't subscribed yet.
  forceMock?: boolean;
};

export type AvailabilityReport = {
  candidate: string;
  intendedClasses: number[];
  detectedClasses: number[];
  // Top-level traffic light derived from the worst single finding.
  overall: RiskLevel;
  findings: RiskFinding[];
  // Suggestion blocks for the UI.
  alternativeNames: string[];
  saferClasses: { class: number; heading: string; reason: string }[];
  // Diagnostics so the UI can surface what happened.
  searchedQueries: string[];
  rawHitCount: number;
  source: "live" | "mock";
  liveApiError: string | null;
  warnings: string[];
};

// Hard cap on total findings returned to the UI. Most users care about
// the top ~30; beyond that the list is noise.
const MAX_FINDINGS = 60;

function dedupe(hits: NormalisedTrademark[]): NormalisedTrademark[] {
  const seen = new Set<string>();
  const out: NormalisedTrademark[] = [];
  for (const h of hits) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
  }
  return out;
}

function resolveClasses(req: AvailabilityRequest): { intended: number[]; detected: number[] } {
  const detected = detectClasses(
    `${req.productDescription || ""} ${req.candidate}`
  );
  const intended =
    req.intendedClasses && req.intendedClasses.length
      ? req.intendedClasses
      : detected.slice(0, 2);
  return { intended, detected };
}

export async function checkAvailability(
  req: AvailabilityRequest
): Promise<AvailabilityReport> {
  const variants = generateVariants(req.candidate);
  const { intended, detected } = resolveClasses(req);

  const useMock =
    req.forceMock === true || process.env.IPAU_MOCK_MODE === "true";

  const search = useMock ? mockSearchIPAU : searchIPAU;

  const warnings: string[] = [];
  let liveApiError: string | null = null;
  let actualSource: "live" | "mock" = useMock ? "mock" : "live";

  // Fan out variants in parallel. Cap concurrency by virtue of the
  // bounded query list inside generateVariants().
  const searchResults = await Promise.all(
    variants.queries.map(async (q) => {
      const r = await search(q);
      return { query: q, ...r };
    })
  );

  // If we're on live and EVERY query failed with the same "Invalid Client"
  // body, auto-fall-back to mock and surface the diagnostic. This keeps
  // the demo usable while Ben sorts the portal subscription.
  if (!useMock) {
    const allErr = searchResults.every((r) => r.error);
    const invalidClient = searchResults.some((r) =>
      (r.error || "").includes("Invalid Client")
    );
    if (allErr && invalidClient) {
      liveApiError =
        "IP Australia API rejected all requests with 403 'Invalid Client'. Token issued fine — but the client (b2b_ipLookup_prod) is not yet subscribed to the Trade Mark Search API product. Subscribe in the portal at portal.api.ipaustralia.gov.au → API Products. Falling back to demo data so you can see the prototype.";
      warnings.push(liveApiError);
      // Re-run with mock.
      const mockResults = await Promise.all(
        variants.queries.map(async (q) => {
          const r = await mockSearchIPAU(q);
          return { query: q, ...r };
        })
      );
      searchResults.length = 0;
      searchResults.push(...mockResults);
      actualSource = "mock";
    } else if (allErr) {
      // Different error — surface it but don't auto-mock.
      const errs = Array.from(
        new Set(searchResults.map((r) => r.error).filter(Boolean) as string[])
      );
      liveApiError = errs.join(" | ");
      warnings.push(`IP Australia API errors: ${liveApiError}`);
    }
  }

  const allHits = searchResults.flatMap((r) => r.results);
  const rawHitCount = allHits.length;
  const uniqueHits = dedupe(allHits);

  // Score every unique hit. Filter out MINIMAL-with-score-0 noise from
  // very weak matches that the search returned because the search engine
  // tokenises differently to our scorer.
  const findings = uniqueHits
    .map((tm) => scoreTrademark({ candidate: req.candidate, intendedClasses: intended }, tm))
    .filter((f) => f.score >= 5)
    .sort(compareFindings)
    .slice(0, MAX_FINDINGS);

  // Overall = worst level present, defaulting to MINIMAL if no findings.
  const overall: RiskLevel =
    findings.length === 0
      ? "MINIMAL"
      : findings.reduce<RiskLevel>(
          (worst, f) =>
            LEVEL_ORDER.indexOf(f.level) < LEVEL_ORDER.indexOf(worst) ? f.level : worst,
          "MINIMAL"
        );

  // Suggest alternative names — blocked tokens are the distinctive tokens
  // that show up in any HIGH+ finding's mark name.
  const blockedTokens = new Set<string>();
  for (const f of findings) {
    if (f.level === "CRITICAL" || f.level === "HIGH") {
      for (const w of f.trademark.markName.toLowerCase().split(/\s+/)) {
        const cleaned = w.replace(/[^a-z0-9]/g, "");
        if (cleaned.length >= 3) blockedTokens.add(cleaned);
      }
    }
  }
  const alternativeNames = generateAlternativeNames(req.candidate, blockedTokens);

  // Suggest safer classes — among the intended classes, count CRITICAL/
  // HIGH findings per class. If one class is hot and a related class is
  // cold, suggest the cold one. (Caveat: legally meaningful class shifts
  // require matching the actual goods/services — surface that in the UI.)
  const hotClasses = new Map<number, number>();
  for (const f of findings) {
    if (f.level !== "CRITICAL" && f.level !== "HIGH") continue;
    for (const c of f.trademark.niceClasses) {
      const n = parseInt(c, 10);
      if (Number.isNaN(n)) continue;
      hotClasses.set(n, (hotClasses.get(n) || 0) + 1);
    }
  }

  const saferClasses: AvailabilityReport["saferClasses"] = [];
  const seenSafer = new Set<number>();
  for (const ic of intended) {
    const hotInIntended = hotClasses.get(ic) || 0;
    if (hotInIntended === 0) continue;
    for (const rel of relatedClasses(ic)) {
      const hotInRel = hotClasses.get(rel) || 0;
      if (hotInRel < hotInIntended && !seenSafer.has(rel)) {
        const c = getNiceClass(rel);
        if (c) {
          seenSafer.add(rel);
          saferClasses.push({
            class: rel,
            heading: c.heading,
            reason: `Class ${ic} has ${hotInIntended} high-risk hit${hotInIntended === 1 ? "" : "s"}; Class ${rel} has ${hotInRel}. Consider whether your goods/services genuinely sit in Class ${rel} — class shift only works if the actual product description matches.`,
          });
        }
      }
    }
  }

  // Cap suggestions.
  saferClasses.splice(5);

  if (intended.length === 0 && detected.length === 0) {
    warnings.push(
      "No Nice class specified or detected. Risk scoring is name-only — class overlap is a major part of real-world TM risk, so add a product description or pick a class for sharper results."
    );
  }

  return {
    candidate: variants.primary,
    intendedClasses: intended,
    detectedClasses: detected,
    overall,
    findings,
    alternativeNames,
    saferClasses,
    searchedQueries: variants.queries,
    rawHitCount,
    source: actualSource,
    liveApiError,
    warnings,
  };
}
