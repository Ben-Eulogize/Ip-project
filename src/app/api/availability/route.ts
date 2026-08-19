import { NextRequest, NextResponse } from "next/server";
import { checkAvailability, AvailabilityRequest } from "@/lib/availability";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: AvailabilityRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.candidate && !body.imageKeywords) {
    return NextResponse.json(
      { error: "Provide either 'candidate' (string) or 'imageKeywords' (string)." },
      { status: 400 }
    );
  }

  if (body.candidate && body.candidate.length > 120) {
    return NextResponse.json(
      { error: "Candidate too long (max 120 chars)." },
      { status: 400 }
    );
  }

  if (body.imageKeywords && body.imageKeywords.length > 400) {
    return NextResponse.json(
      { error: "imageKeywords too long (max 400 chars)." },
      { status: 400 }
    );
  }

  const report = await checkAvailability({
    candidate: body.candidate || "",
    intendedClasses: Array.isArray(body.intendedClasses)
      ? body.intendedClasses.filter((n) => typeof n === "number")
      : undefined,
    productDescription:
      typeof body.productDescription === "string"
        ? body.productDescription
        : undefined,
    imageKeywords:
      typeof body.imageKeywords === "string" ? body.imageKeywords : undefined,
    autoDetectClasses: body.autoDetectClasses,
    forceMock: body.forceMock === true,
  });

  return NextResponse.json(report);
}
