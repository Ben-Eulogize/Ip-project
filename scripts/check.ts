#!/usr/bin/env tsx
import { checkAvailability } from "../src/lib/availability";
import { LEVEL_ORDER, RiskLevel } from "../src/lib/risk";
import { formatClass } from "../src/lib/nice-classes";

function parseArgs(argv: string[]): {
  candidate: string;
  classes: number[];
  product: string;
  json: boolean;
  forceMock: boolean;
} {
  const args = argv.slice(2);
  let candidate = "";
  const classes: number[] = [];
  let product = "";
  let json = false;
  let forceMock = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--class" || a === "-c") {
      const v = args[++i];
      for (const part of v.split(",")) {
        const n = parseInt(part.trim(), 10);
        if (!Number.isNaN(n)) classes.push(n);
      }
    } else if (a === "--product" || a === "-p") {
      product = args[++i];
    } else if (a === "--json") {
      json = true;
    } else if (a === "--mock") {
      forceMock = true;
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else if (!candidate) {
      candidate = a;
    } else {
      // Allow multi-word candidate without quotes: "npm run check -- Pauls Lemonade"
      candidate += " " + a;
    }
  }
  return { candidate, classes, product, json, forceMock };
}

function printHelp() {
  console.log(`Usage: npm run check -- "<candidate name>" [options]

Options:
  -c, --class <n>      Nice class(es), comma-separated (e.g. -c 32 or -c 32,33)
  -p, --product <txt>  Product description for auto class-detect
      --json           Emit JSON to stdout instead of pretty report
      --mock           Force demo-fixture mode (skip live IPAU calls)
  -h, --help           Show this help

Examples:
  npm run check -- "Pauls Lemonade"
  npm run check -- "Pauls Lemonade" -c 32 -p "non-alcoholic drinks"
  npm run check -- "Sutton Coffee" --json
  npm run check -- "Pauls Lemonade" --mock

Requires IPAU_CLIENT_ID and IPAU_CLIENT_SECRET in .env.local for live mode.`);
}

const LEVEL_BADGE: Record<RiskLevel, string> = {
  CRITICAL: "\x1b[41m\x1b[37m CRITICAL \x1b[0m",
  HIGH: "\x1b[48;5;208m\x1b[37m   HIGH   \x1b[0m",
  MEDIUM: "\x1b[43m\x1b[30m  MEDIUM  \x1b[0m",
  LOW: "\x1b[103m\x1b[30m   LOW    \x1b[0m",
  MINIMAL: "\x1b[47m\x1b[30m MINIMAL  \x1b[0m",
};

async function main() {
  const { candidate, classes, product, json, forceMock } = parseArgs(process.argv);

  if (!candidate) {
    printHelp();
    process.exit(1);
  }

  // tsx --env-file=.env.local already loads env vars before this script
  // runs (see package.json "check" script). No dynamic dotenv import.

  if (!forceMock && !process.env.IPAU_MOCK_MODE) {
    if (!process.env.IPAU_CLIENT_ID || !process.env.IPAU_CLIENT_SECRET) {
      console.error(
        "Warning: IPAU_CLIENT_ID / IPAU_CLIENT_SECRET not set — falling back to demo data."
      );
      process.env.IPAU_MOCK_MODE = "true";
    }
  }

  if (!json) {
    process.stderr.write(`Checking "${candidate}"...\n`);
  }

  const report = await checkAvailability({
    candidate,
    intendedClasses: classes.length ? classes : undefined,
    productDescription: product || undefined,
    forceMock,
  });

  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  // Pretty report.
  const bar = "=".repeat(70);
  console.log("");
  console.log(bar);
  console.log(`  Trade-mark availability report: "${report.candidate}"`);
  console.log(bar);
  console.log(`  Overall:           ${LEVEL_BADGE[report.overall]}  ${report.overall}`);
  console.log(`  Intended class(es):${report.intendedClasses.length ? " " + report.intendedClasses.map(formatClass).join("\n                     ") : " (none specified)"}`);
  if (report.detectedClasses.length && JSON.stringify(report.detectedClasses) !== JSON.stringify(report.intendedClasses)) {
    console.log(`  Auto-detected:     ${report.detectedClasses.map((c) => `Class ${c}`).join(", ")}`);
  }
  console.log(`  Data source:       ${report.source === "live" ? "IP Australia (live)" : "Demo fixtures"}`);
  console.log(`  IPAU coverage:     ${report.totalAvailable} total matches in IPAU, ${report.fetched} fetched, ${report.findings.length} scored`);
  if (report.warnings.length) {
    console.log("");
    console.log("  Warnings:");
    for (const w of report.warnings) {
      console.log(`    - ${w}`);
    }
  }
  console.log("");

  // Findings grouped by level.
  for (const level of LEVEL_ORDER) {
    const inLevel = report.findings.filter((f) => f.level === level);
    if (inLevel.length === 0) continue;
    console.log(`  ${LEVEL_BADGE[level]}  (${inLevel.length})`);
    for (const f of inLevel) {
      console.log(`    ${f.trademark.markName}  [${f.trademark.status}]  Cl. ${f.trademark.niceClasses.join(", ") || "?"}  — ${f.trademark.owner}`);
      console.log(`      ${f.reasons.join(" | ")}`);
      if (f.trademark.externalUrl) {
        console.log(`      ${f.trademark.externalUrl}`);
      }
    }
    console.log("");
  }

  if (report.findings.length === 0) {
    console.log("  No meaningful conflicts found.\n");
  }

  if (report.alternativeNames.length) {
    console.log("  Alternative name suggestions:");
    for (const a of report.alternativeNames) console.log(`    - ${a}`);
    console.log("");
  }

  if (report.saferClasses.length) {
    console.log("  Class-change suggestions:");
    for (const s of report.saferClasses) {
      console.log(`    - ${formatClass(s.class)}`);
      console.log(`      ${s.reason}`);
    }
    console.log("");
  }

  console.log(`  Classes searched: ${report.searchedClasses.join(", ") || "(any)"}`);
  console.log(bar);
  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
