import { NextRequest, NextResponse } from "next/server";
import { searchIPAU } from "@/lib/ipau";
import { searchEUIPO } from "@/lib/euipo";
import { SearchResult, SourceStatus } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const terms: string[] = body.terms;

    if (!Array.isArray(terms) || terms.length === 0) {
      return NextResponse.json(
        { error: "Provide an array of search terms" },
        { status: 400 }
      );
    }

    // Cap at 20 terms
    const trimmedTerms = terms.slice(0, 20);

    const searchResults: SearchResult[] = await Promise.all(
      trimmedTerms.map(async (term) => {
        const [ipau, euipo] = await Promise.all([
          searchIPAU(term),
          searchEUIPO(term),
        ]);

        const errors: string[] = [];
        if (ipau.error) errors.push(ipau.error);
        if (euipo.error) errors.push(euipo.error);

        return {
          term,
          results: [...ipau.results, ...euipo.results],
          errors,
        };
      })
    );

    const sourceStatuses: SourceStatus[] = [
      {
        source: "IP Australia",
        status: "ok",
        count: searchResults.reduce(
          (sum, r) => sum + r.results.filter((x) => x.source === "IPAU").length,
          0
        ),
      },
      {
        source: "EUIPO",
        status: searchResults.some((r) =>
          r.errors.some((e) => e.includes("not configured"))
        )
          ? "not_configured"
          : searchResults.some((r) =>
              r.errors.some((e) => e.includes("EUIPO"))
            )
          ? "error"
          : "ok",
        count: searchResults.reduce(
          (sum, r) => sum + r.results.filter((x) => x.source === "EUIPO").length,
          0
        ),
        message: searchResults
          .flatMap((r) => r.errors)
          .find((e) => e.includes("EUIPO")),
      },
    ];

    return NextResponse.json({ results: searchResults, sources: sourceStatuses });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal server error" },
      { status: 500 }
    );
  }
}
