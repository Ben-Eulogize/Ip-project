import { NormalisedTrademark } from "./types";
import { editDistance, tokenSetSimilarity, distinctiveOf } from "./variants";
import { relatedClasses } from "./nice-classes";

export type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "MINIMAL";

export type RiskFinding = {
  trademark: NormalisedTrademark;
  level: RiskLevel;
  score: number; // 0–100 — higher = riskier collision
  reasons: string[];
  // Which dimensions drove the score, for the UI badges.
  nameMatch:
    | "exact"
    | "dominant-exact"
    | "phonetic-likely"
    | "close"
    | "contains"
    | "weak";
  classMatch: "same" | "related" | "different" | "unknown";
  statusWeight: "live" | "pending" | "expired" | "unknown";
};

// Status strings IPAU returns. The live API uses statusGroup uppercase
// values (REGISTERED / PENDING / REMOVED / REFUSED / NEVER_REGISTERED)
// joined with a human statusDetail ("Registered: registered/protected",
// "Under examination", etc). Matching is case-insensitive substring.
const LIVE_STATUSES = [
  "registered", // covers "REGISTERED" + "Registered: registered/protected"
  "live",
  "accepted",
  "advertised",
  "protected",
];

const PENDING_STATUSES = [
  "pending", // covers statusGroup PENDING
  "filed",
  "under examination",
  "examination",
  "indexed",
  "published",
];

const EXPIRED_STATUSES = [
  "expired",
  "lapsed",
  "withdrawn",
  "refused",        // statusGroup REFUSED
  "abandoned",
  "removed",        // statusGroup REMOVED
  "ceased",
  "never_registered", // statusGroup NEVER_REGISTERED
  "never registered",
];

function classifyStatus(s: string): "live" | "pending" | "expired" | "unknown" {
  const lw = s.toLowerCase().trim();
  // EXPIRED is checked first because "never_registered" contains the
  // substring "registered" and would otherwise be mis-classified as live.
  if (EXPIRED_STATUSES.some((x) => lw.includes(x))) return "expired";
  if (PENDING_STATUSES.some((x) => lw.includes(x))) return "pending";
  if (LIVE_STATUSES.some((x) => lw.includes(x))) return "live";
  return "unknown";
}

function normForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatchKind(
  candidate: string,
  mark: string
): RiskFinding["nameMatch"] {
  const a = normForCompare(candidate);
  const b = normForCompare(mark);
  if (!a || !b) return "weak";
  if (a === b) return "exact";

  // Dominant-element check FIRST — most legally meaningful comparison.
  // "Pauls Lemonade" vs "PAULS" share the same distinctive token set
  // ({pauls}) because "Lemonade" is a generic descriptor. Treat that as
  // an exact-equivalent match for risk purposes — but tag it
  // "dominant-exact" so the UI can show a more nuanced reason than
  // "Exact name match: PAULS".
  const da = distinctiveOf(candidate);
  const db = distinctiveOf(mark);
  if (da.length > 0 && db.length > 0) {
    const sa = new Set(da);
    const sb = new Set(db);
    const setEqual =
      sa.size === sb.size && Array.from(sa).every((t) => sb.has(t));
    if (setEqual) return "dominant-exact";

    // One distinctive set is a subset of the other and shares at least
    // one strong token → "phonetic-likely" (dominant element overlap).
    let shared = 0;
    for (const t of Array.from(sa)) if (sb.has(t)) shared++;
    const minSize = Math.min(sa.size, sb.size);
    if (shared > 0 && shared === minSize) return "phonetic-likely";
    if (shared > 0 && shared / Math.max(sa.size, sb.size) >= 0.5) return "close";
  }

  // Whole-string edit-distance for typo / spelling variants.
  const dist = editDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  const ratio = dist / maxLen;

  if (a.length >= 3 && b.length >= 3) {
    if (dist <= 1) return "phonetic-likely";
    if (a.includes(b) || b.includes(a)) {
      const shortLen = Math.min(a.length, b.length);
      if (shortLen / maxLen >= 0.5) return "phonetic-likely";
      return "contains";
    }
    if (ratio <= 0.25) return "close";
  }

  if (tokenSetSimilarity(candidate, mark) >= 0.5) return "close";
  return "weak";
}

function classMatchKind(
  intendedClasses: number[],
  markClasses: string[]
): RiskFinding["classMatch"] {
  if (!intendedClasses.length || !markClasses.length) return "unknown";
  const markNums = markClasses
    .map((c) => parseInt(c, 10))
    .filter((n) => !Number.isNaN(n));
  for (const ic of intendedClasses) {
    if (markNums.includes(ic)) return "same";
  }
  for (const ic of intendedClasses) {
    const rel = new Set(relatedClasses(ic));
    if (markNums.some((m) => rel.has(m))) return "related";
  }
  return "different";
}

export type ScoreInput = {
  candidate: string;
  intendedClasses: number[];
};

export function scoreTrademark(
  input: ScoreInput,
  tm: NormalisedTrademark
): RiskFinding {
  const nameMatch = nameMatchKind(input.candidate, tm.markName);
  const classMatch = classMatchKind(input.intendedClasses, tm.niceClasses);
  const statusWeight = classifyStatus(tm.status);

  // Base name score (higher = worse).
  const nameWeight: Record<RiskFinding["nameMatch"], number> = {
    exact: 60,
    "dominant-exact": 55,
    "phonetic-likely": 45,
    close: 30,
    contains: 25,
    weak: 8,
  };

  const classWeight: Record<RiskFinding["classMatch"], number> = {
    same: 30,
    related: 18,
    different: 4,
    unknown: 10,
  };

  const statusMultiplier: Record<RiskFinding["statusWeight"], number> = {
    live: 1.0,
    pending: 0.85,
    expired: 0.2,
    unknown: 0.7,
  };

  const baseScore = (nameWeight[nameMatch] + classWeight[classMatch]) * statusMultiplier[statusWeight];
  const score = Math.min(100, Math.round(baseScore));

  const strongName =
    nameMatch === "exact" || nameMatch === "dominant-exact";

  let level: RiskLevel;
  if (strongName && classMatch === "same" && statusWeight === "live") {
    level = "CRITICAL";
  } else if (
    (strongName && (classMatch === "same" || classMatch === "related") && statusWeight !== "expired") ||
    (nameMatch === "phonetic-likely" && classMatch === "same" && statusWeight === "live")
  ) {
    level = "HIGH";
  } else if (
    (nameMatch === "phonetic-likely" && classMatch !== "different") ||
    (nameMatch === "close" && classMatch === "same") ||
    (strongName && classMatch === "different" && statusWeight === "live")
  ) {
    level = "MEDIUM";
  } else if (
    score >= 20 ||
    (nameMatch !== "weak" && classMatch !== "different")
  ) {
    level = "LOW";
  } else {
    level = "MINIMAL";
  }

  // Expired marks never escalate past LOW — they no longer block
  // registration, only signal historical use.
  if (statusWeight === "expired" && level !== "MINIMAL") {
    level = level === "LOW" ? "LOW" : "MINIMAL";
  }

  const reasons: string[] = [];
  reasons.push(
    {
      exact: `Identical mark: "${tm.markName}"`,
      "dominant-exact": `Same dominant element — "${tm.markName}" shares all distinctive words after descriptors are removed`,
      "phonetic-likely": `Phonetically/visually close to "${tm.markName}"`,
      close: `Similar name: "${tm.markName}"`,
      contains: `Shared dominant element with "${tm.markName}"`,
      weak: `Distant name resemblance to "${tm.markName}"`,
    }[nameMatch]
  );
  if (classMatch === "same") {
    reasons.push(`Registered in your intended Nice class (${tm.niceClasses.join(", ")})`);
  } else if (classMatch === "related") {
    reasons.push(`Registered in a related Nice class (${tm.niceClasses.join(", ")})`);
  } else if (classMatch === "different") {
    reasons.push(`Registered in a different class (${tm.niceClasses.join(", ") || "n/a"})`);
  } else if (classMatch === "unknown") {
    reasons.push(`No class overlap evaluated (intended class not specified)`);
  }
  reasons.push(
    {
      live: "Status: live / registered",
      pending: "Status: pending application",
      expired: "Status: expired / lapsed — historical only",
      unknown: `Status: "${tm.status}" (unclassified)`,
    }[statusWeight]
  );

  return {
    trademark: tm,
    level,
    score,
    reasons,
    nameMatch,
    classMatch,
    statusWeight,
  };
}

export const LEVEL_ORDER: RiskLevel[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "MINIMAL",
];

export function compareFindings(a: RiskFinding, b: RiskFinding): number {
  const la = LEVEL_ORDER.indexOf(a.level);
  const lb = LEVEL_ORDER.indexOf(b.level);
  if (la !== lb) return la - lb;
  return b.score - a.score;
}

export const LEVEL_COLORS: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  CRITICAL: { bg: "bg-red-600", text: "text-white", label: "Critical risk" },
  HIGH: { bg: "bg-orange-500", text: "text-white", label: "High risk" },
  MEDIUM: { bg: "bg-amber-400", text: "text-black", label: "Medium risk" },
  LOW: { bg: "bg-yellow-200", text: "text-black", label: "Low risk" },
  MINIMAL: { bg: "bg-slate-200", text: "text-slate-700", label: "Minimal" },
};
