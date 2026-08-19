import { NormalisedTrademark } from "./types";
import { searchAdvanced, AdvancedStatus } from "./ipau";
import { mockSearchIPAU } from "./mock-data";
import { generateAlternativeNames, distinctiveOf } from "./variants";
import {
  scoreTrademark,
  RiskFinding,
  compareFindings,
  LEVEL_ORDER,
  RiskLevel,
} from "./risk";
import { detectClasses, getNiceClass, relatedClasses } from "./nice-classes";

export type AvailabilityRequest = {
  candidate: string;
  intendedClasses?: number[];
  productDescription?: string;
  // Visual-element keywords for figurative-mark search. Comma-separated
  // Vienna-style descriptors — e.g. "STAR,CIRCLE,RED". When set, an
  // additional image-search row is added to the advanced query.
  imageKeywords?: string;
  // When false, NO class auto-detection happens: the caller's
  // intendedClasses (possibly empty = unrestricted) are used as-is.
  // Defaults to true so the CLI and batch-check keep their detection.
  autoDetectClasses?: boolean;
  forceMock?: boolean;
};

export type AvailabilityReport = {
  candidate: string;
  intendedClasses: number[];
  detectedClasses: number[];
  overall: RiskLevel;
  findings: RiskFinding[];
  alternativeNames: string[];
  saferClasses: { class: number; heading: string; reason: string }[];
  // Diagnostics surfaced in the UI.
  searchedClasses: number[];
  totalAvailable: number; // total hits across all per-class queries (pre-pagination)
  fetched: number; // count actually pulled
  source: "live" | "mock";
  liveApiError: string | null;
  warnings: string[];
};

// Max records to score per check. Higher = more thorough, more risk-list
// noise. 100 is generous and the /page/advanced endpoint can return all
// of them in one call (no N+1).
const MAX_FINDINGS = 80;
const PAGE_SIZE_PER_CLASS = 50;

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

function resolveClasses(req: AvailabilityRequest): {
  intended: number[];
  detected: number[];
} {
  const detected = detectClasses(
    `${req.productDescription || ""} ${req.candidate}`
  );
  if (req.autoDetectClasses === false) {
    // Manual mode: what the user ticked is what gets searched. Empty
    // means unrestricted, never a guess.
    return { intended: req.intendedClasses ?? [], detected };
  }
  const intended =
    req.intendedClasses && req.intendedClasses.length
      ? req.intendedClasses
      : detected.slice(0, 2);
  return { intended, detected };
}

export async function checkAvailability(
  req: AvailabilityRequest
): Promise<AvailabilityReport> {
  const { intended, detected } = resolveClasses(req);
  const useMock =
    req.forceMock === true || process.env.IPAU_MOCK_MODE === "true";

  const warnings: string[] = [];
  let liveApiError: string | null = null;
  let actualSource: "live" | "mock" = useMock ? "mock" : "live";

  const statuses: AdvancedStatus[] = ["REGISTERED", "PENDING"];

  // Strategy:
  //   - For each intended class: one advanced search with STEM word match
  //     + classNumber filter + status filter. Returns up to 50 full
  //     records inline. Catches Paul/Pauls/Paul's variants automatically.
  //   - Plus one unrestricted-class STEM search to surface any strong-
  //     name collisions in unrelated classes (the risk-scorer downgrades
  //     these to LOW automatically; we just want them visible).
  //   - Plus, if imageKeywords supplied, one image-search row.
  // Total API calls = (intended classes) + 1 + (image: 0 or 1). Typically
  // 2–4 calls per check.
  const searches: Array<Promise<{ results: NormalisedTrademark[]; total: number; error?: string }>> = [];
  const queryDescriptions: string[] = [];

  // IPAU's word search expects a SINGLE token, not a phrase. Extract the
  // distinctive tokens (drop descriptors like "Lemonade", "Drinks") and
  // run STEM searches per token. If the candidate has no distinctive
  // tokens after stripping (e.g. pure descriptor), fall back to the
  // whole candidate string — IPAU will return zero hits, which is the
  // correct signal for a generic name.
  const tokensForSearch = req.candidate.trim()
    ? distinctiveOf(req.candidate).length > 0
      ? distinctiveOf(req.candidate)
      : [req.candidate.trim().split(/\s+/)[0]]
    : [];

  if (useMock) {
    searches.push(mockSearchIPAU(req.candidate).then((r) => ({ ...r, total: r.results.length })));
    queryDescriptions.push(`mock("${req.candidate}")`);
  } else {
    // Per-token × per-class STEM searches.
    for (const token of tokensForSearch) {
      if (intended.length > 0) {
        for (const cls of intended) {
          searches.push(
            searchAdvanced({
              word: token,
              wordMatchType: "STEM",
              classes: [cls],
              statuses,
              pageSize: PAGE_SIZE_PER_CLASS,
            })
          );
          queryDescriptions.push(`STEM "${token}" in Cl ${cls}`);
        }
      }
      // Unrestricted class — catches strong-name conflicts in unrelated
      // classes (the risk-scorer downgrades these but they should be
      // visible).
      searches.push(
        searchAdvanced({
          word: token,
          wordMatchType: "STEM",
          statuses,
          pageSize: PAGE_SIZE_PER_CLASS,
        })
      );
      queryDescriptions.push(`STEM "${token}" (any class)`);
    }
    // Image-keyword search.
    if (req.imageKeywords && req.imageKeywords.trim()) {
      searches.push(
        searchAdvanced({
          imageKeywords: req.imageKeywords,
          classes: intended.length ? intended : undefined,
          statuses,
          pageSize: PAGE_SIZE_PER_CLASS,
        })
      );
      queryDescriptions.push(
        `image keywords "${req.imageKeywords.trim()}"${
          intended.length ? ` in Cl ${intended.join(", ")}` : ""
        }`
      );
    }
  }

  const searchResults = await Promise.all(searches);

  // Detect the "client not subscribed" 403 and auto-fallback to mock.
  if (!useMock) {
    const allErr = searchResults.every((r) => r.error);
    const invalidClient = searchResults.some((r) =>
      (r.error || "").includes("Invalid Client")
    );
    if (allErr && invalidClient) {
      liveApiError =
        "IP Australia API rejected all requests with 403 'Invalid Client'. The client is not subscribed to the Trade Mark Search API product. Subscribe in the portal at portal.api.ipaustralia.gov.au → API Products. Falling back to demo data.";
      warnings.push(liveApiError);
      const mockRes = await mockSearchIPAU(req.candidate);
      searchResults.length = 0;
      searchResults.push({ results: mockRes.results, total: mockRes.results.length });
      actualSource = "mock";
    } else if (allErr) {
      const errs = Array.from(
        new Set(searchResults.map((r) => r.error).filter(Boolean) as string[])
      );
      liveApiError = errs.join(" | ");
      warnings.push(`IP Australia API errors: ${liveApiError}`);
    }
  }

  const allHits = searchResults.flatMap((r) => r.results);
  const totalAvailable = searchResults.reduce((sum, r) => sum + (r.total || 0), 0);
  const uniqueHits = dedupe(allHits);
  const fetched = uniqueHits.length;

  const findings = uniqueHits
    .map((tm) =>
      scoreTrademark({ candidate: req.candidate, intendedClasses: intended }, tm)
    )
    .filter((f) => f.score >= 5)
    .sort(compareFindings)
    .slice(0, MAX_FINDINGS);

  const overall: RiskLevel =
    findings.length === 0
      ? "MINIMAL"
      : findings.reduce<RiskLevel>(
          (worst, f) =>
            LEVEL_ORDER.indexOf(f.level) < LEVEL_ORDER.indexOf(worst)
              ? f.level
              : worst,
          "MINIMAL"
        );

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
            reason: `Class ${ic} has ${hotInIntended} high-risk hit${hotInIntended === 1 ? "" : "s"}; Class ${rel} has ${hotInRel}. Class shift only works if your goods/services actually fit Class ${rel}.`,
          });
        }
      }
    }
  }
  saferClasses.splice(5);

  if (intended.length === 0 && detected.length === 0) {
    warnings.push(
      "No Nice class specified or detected. Risk scoring is name-only — class overlap is a major part of real-world TM risk, so add a product description or pick a class for sharper results."
    );
  }

  return {
    candidate: req.candidate.trim(),
    intendedClasses: intended,
    detectedClasses: detected,
    overall,
    findings,
    alternativeNames,
    saferClasses,
    searchedClasses: intended,
    totalAvailable,
    fetched,
    source: actualSource,
    liveApiError,
    warnings,
  };
}
