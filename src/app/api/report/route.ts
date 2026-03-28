import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { NormalisedTrademark } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  const { term, results }: { term: string; results: NormalisedTrademark[] } =
    await req.json();

  if (!term) {
    return new Response(JSON.stringify({ error: "term is required" }), {
      status: 400,
    });
  }

  const summary = results
    .slice(0, 30)
    .map(
      (r) =>
        `• ${r.markName} (${r.source}, ${r.jurisdiction}) — Owner: ${r.owner}, Status: ${r.status}, Classes: ${r.niceClasses.join(", ") || "N/A"}`
    )
    .join("\n");

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: `You are a trademark law research assistant for an Australian IP lawyer.
Provide concise, professional landscape analysis. Use markdown formatting.
Focus on: risk assessment, key owners, class overlaps, and registration strategy recommendations.`,
    prompt: `Generate a trademark landscape report for the term "${term}".

Here are the search results from trademark databases:

${summary || "No results found across databases."}

Please provide:
1. **Executive Summary** — brief overview of the trademark landscape
2. **Key Findings** — notable existing marks, dominant owners, class coverage
3. **Risk Assessment** — potential conflicts or concerns for filing
4. **Recommendations** — strategic advice for the client`,
  });

  return result.toTextStreamResponse();
}
