import { NextRequest, NextResponse } from "next/server";
import { runWatchSweep } from "@/lib/watch";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: {
    keywords?: unknown;
    days?: unknown;
    classes?: unknown;
    forceMock?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!Array.isArray(body.keywords) || body.keywords.length === 0) {
    return NextResponse.json(
      { error: "Provide 'keywords' as a non-empty array of strings." },
      { status: 400 }
    );
  }
  const keywords = body.keywords
    .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
    .slice(0, 15);
  if (keywords.length === 0) {
    return NextResponse.json(
      { error: "No usable keywords supplied." },
      { status: 400 }
    );
  }

  const report = await runWatchSweep({
    keywords,
    days: typeof body.days === "number" ? body.days : 7,
    classes: Array.isArray(body.classes)
      ? body.classes.filter((n): n is number => typeof n === "number")
      : undefined,
    forceMock: body.forceMock === true,
  });

  return NextResponse.json(report);
}
