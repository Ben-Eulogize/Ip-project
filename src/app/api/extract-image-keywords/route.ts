import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 30;

// Vision-driven image-element extraction. Takes an uploaded image (base64
// data URL) and asks Claude Haiku to identify the visual elements in
// IPAU's "image description" style — comma-separated, plain-English
// keywords like the ones found in trade mark records (e.g. "STAR,
// CIRCLE, CROWN, WREATH"). These keywords are then fed into the IPAU
// advanced search image.text field for visual-element matching.

const SYSTEM_PROMPT = `You analyze logos and brand images for an Australian trademark availability checker. The IP Australia Trade Mark Search indexes figurative marks with comma-separated visual-element keywords drawn from the WIPO Vienna Classification system — plain English nouns describing what is visually present.

Your job: look at the supplied image and produce 5–15 short, uppercase, comma-separated visual element keywords that match how IP Australia describes figurative marks. Examples of the style you must produce:

- "STAR, CIRCLE, CROWN, WREATH, LION"
- "WAVE, SUN, MOUNTAIN, BLUE, ORANGE"
- "WHALE, FLAG, HARPOON, BROKEN LINES"
- "SHIELD, KEYS, CROSS, TIARA"

Rules:
- Each keyword is 1–2 words, uppercase, English.
- Include dominant SHAPES (circle, square, triangle, hexagon, ribbon, shield).
- Include OBJECTS (animal, plant, tool, building, weapon, flag, etc).
- Include COLORS (red, blue, gold, green, etc) — useful for retrieval even though IPAU encodes them separately.
- Include any LETTERS or stylized text shapes ("LTR A", "MONOGRAM").
- DO NOT include the brand text itself as a word — that's word-mark territory.
- DO NOT include adjectives that aren't perceptual (no "modern", "professional").
- Output ONLY the comma-separated keyword list. No preamble, no quotes, no markdown.`;

type Body = {
  // Data URL: "data:image/png;base64,iVBORw0KGgo..." OR raw base64.
  imageBase64: string;
  // Optional mime hint when raw base64 supplied. Defaults to image/png.
  mediaType?: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
};

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Vision auto-extraction is not configured on this deployment. Set ANTHROPIC_API_KEY in Vercel env vars to enable image-based search. You can still type visual-element keywords manually.",
      },
      { status: 503 }
    );
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.imageBase64 || typeof body.imageBase64 !== "string") {
    return NextResponse.json(
      { error: "Field 'imageBase64' (data URL or raw base64) is required." },
      { status: 400 }
    );
  }

  // Extract media type + raw base64 from data URL if present.
  let mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" =
    body.mediaType ?? "image/png";
  let data = body.imageBase64;
  const dataUrlMatch = body.imageBase64.match(/^data:(image\/(png|jpeg|jpg|gif|webp));base64,(.+)$/);
  if (dataUrlMatch) {
    const detected = dataUrlMatch[1];
    if (detected === "image/jpg") {
      mediaType = "image/jpeg";
    } else if (
      detected === "image/png" ||
      detected === "image/jpeg" ||
      detected === "image/gif" ||
      detected === "image/webp"
    ) {
      mediaType = detected;
    }
    data = dataUrlMatch[3];
  }

  // Strict ~4 MB cap on the raw base64 (Anthropic limit is 5 MB total
  // post-encoding; leave headroom for JSON overhead).
  if (data.length > 4_200_000) {
    return NextResponse.json(
      { error: "Image too large. Please use an image under ~3 MB." },
      { status: 413 }
    );
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Cache the system prompt so repeated extractions are cheaper.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data },
            },
            {
              type: "text",
              text: "Visual elements (comma-separated, uppercase, IP Australia style):",
            },
          ],
        },
      ],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    const keywordsRaw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const keywords = keywordsRaw
      .replace(/^[\s"']+|[\s"'.]+$/g, "")
      .replace(/\n+/g, ", ")
      .toUpperCase();

    return NextResponse.json({
      keywords,
      model: resp.model,
      usage: {
        input: resp.usage.input_tokens,
        cache_read: resp.usage.cache_read_input_tokens ?? 0,
        cache_creation: resp.usage.cache_creation_input_tokens ?? 0,
        output: resp.usage.output_tokens,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[extract-image-keywords] error:", msg);
    return NextResponse.json(
      { error: `Vision API error: ${msg}` },
      { status: 502 }
    );
  }
}
