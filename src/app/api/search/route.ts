import { NextRequest, NextResponse } from "next/server";
import { searchIPAU } from "@/lib/ipau";
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

    const trimmedTerms = terms.slice(0, 20);

    const searchResults: SearchResult[] = await Promise.all(
      trimmedTerms.map(async (term) => {
        const ipau = await searchIPAU(term);
        const errors: string[] = [];
        if (ipau.error) errors.push(ipau.error);

        return {
          term,
          results: ipau.results,
          errors,
        };
      })
    );

    const notConfigured = searchResults.some((r) =>
      r.errors.some((e) => e.includes("not configured"))
    );
    const hasError = searchResults.some((r) => r.errors.length > 0);

    const sourceStatuses: SourceStatus[] = [
      {
        source: "IP Australia",
        status: notConfigured ? "not_configured" : hasError ? "error" : "ok",
        count: searchResults.reduce((sum, r) => sum + r.results.length, 0),
        message: searchResults.flatMap((r) => r.errors)[0],
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
