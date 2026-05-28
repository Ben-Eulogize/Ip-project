import { NextRequest, NextResponse } from "next/server";
import { checkAvailability, AvailabilityRequest } from "@/lib/availability";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: AvailabilityRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body.candidate || typeof body.candidate !== "string") {
    return NextResponse.json(
      { error: "Field 'candidate' (string) is required." },
      { status: 400 }
    );
  }

  if (body.candidate.length > 120) {
    return NextResponse.json(
      { error: "Candidate too long (max 120 chars)." },
      { status: 400 }
    );
  }

  const report = await checkAvailability({
    candidate: body.candidate,
    intendedClasses: Array.isArray(body.intendedClasses)
      ? body.intendedClasses.filter((n) => typeof n === "number")
      : undefined,
    productDescription:
      typeof body.productDescription === "string"
        ? body.productDescription
        : undefined,
    forceMock: body.forceMock === true,
  });

  return NextResponse.json(report);
}
