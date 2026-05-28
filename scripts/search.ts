#!/usr/bin/env tsx
import { writeFileSync } from "node:fs";
import { searchIPAU } from "../src/lib/ipau";
import { toCSV, toJSON } from "../src/lib/export";
import { NormalisedTrademark } from "../src/lib/types";

function parseArgs(argv: string[]): { terms: string[]; out: string; format: "csv" | "json" } {
  const args = argv.slice(2);
  const terms: string[] = [];
  let out = "tm-results.csv";
  let format: "csv" | "json" = "csv";

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--out" || a === "-o") {
      out = args[++i];
    } else if (a === "--json") {
      format = "json";
      if (out === "tm-results.csv") out = "tm-results.json";
    } else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      terms.push(a);
    }
  }
  return { terms, out, format };
}

function printHelp() {
  console.log(`Usage: npm run search -- [options] <term> [term...]

Options:
  -o, --out <file>   Output file (default: tm-results.csv or tm-results.json)
      --json         Emit JSON instead of CSV
  -h, --help         Show this help

Examples:
  npm run search -- nike apple bmw
  npm run search -- --json "blue mountain" "sunrise ip"
  npm run search -- -o nike.csv nike

Requires IPAU_CLIENT_ID and IPAU_CLIENT_SECRET in .env`);
}

async function main() {
  const { terms, out, format } = parseArgs(process.argv);

  if (terms.length === 0) {
    printHelp();
    process.exit(1);
  }

  if (!process.env.IPAU_CLIENT_ID || !process.env.IPAU_CLIENT_SECRET) {
    console.error("Error: IPAU_CLIENT_ID and IPAU_CLIENT_SECRET must be set in .env");
    process.exit(1);
  }

  console.error(`Searching ${terms.length} term${terms.length === 1 ? "" : "s"}...`);

  const all: NormalisedTrademark[] = [];
  let hadError = false;

  await Promise.all(
    terms.map(async (term) => {
      const { results, error } = await searchIPAU(term);
      if (error) {
        console.error(`  [${term}] ${error}`);
        hadError = true;
      } else {
        console.error(`  [${term}] ${results.length} result${results.length === 1 ? "" : "s"}`);
      }
      all.push(...results);
    })
  );

  if (all.length === 0) {
    console.error(hadError ? "No results (errors above)." : "No results.");
    process.exit(hadError ? 1 : 0);
  }

  const body = format === "json" ? toJSON(all) : toCSV(all);
  writeFileSync(out, body);
  console.error(`Wrote ${all.length} record${all.length === 1 ? "" : "s"} to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
