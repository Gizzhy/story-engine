// Image wave — the one shared model call.
//
// Every image in the pipeline (character references, scene stills, hero shots)
// goes through generateImage, so the call shape proven by
// functions/scripts/image-spike.ts exists in exactly one place.
//
// The important thing this helper owns is the BLOCKED-vs-ERROR distinction.
// The model reports a policy refusal in several different shapes — a
// promptFeedback.blockReason, a safety finishReason, a 200 carrying only a text
// explanation and no image, or an HTTP-level rejection whose body mentions
// policy. Downstream, that distinction decides whether to retry: an ERROR is
// worth another attempt, a BLOCKED never is (identical text blocks identically,
// and retrying it only spends money).
import { GoogleGenAI, Modality } from "@google/genai";
import {
  ASPECT_RATIO,
  IMAGE_CONFIG,
  MAX_REFERENCE_IMAGES,
  SAFETY_SETTINGS,
  type ImageResolution,
} from "./imageConfig";

/** A character reference attached to the call as a subject. */
export interface ReferenceImage {
  /** Raw image bytes. */
  data: Buffer;
  /** Defaults to image/png (what the model returns and what we store). */
  mimeType?: string;
  /**
   * Cast name, used only to phrase the "keep this face" instruction. Never
   * reaches the rendered image — image prompts themselves stay name-free.
   */
  name?: string;
}

/**
 * A generated image, or a typed failure. `blocked` means the model refused on
 * policy grounds; `error` means something broke (network, config, empty
 * response). Only `error` is worth retrying.
 */
export type ImageResult =
  | { ok: true; buffer: Buffer }
  | { ok: false; kind: "blocked" | "error"; reason: string };

export interface GenerateImageInput {
  /** An authenticated client (built at the call site from the Gemini secret). */
  ai: GoogleGenAI;
  /** The assembled prompt — scene/reference text plus its style block. */
  prompt: string;
  /** Character references to attach as subjects, for face consistency. */
  referenceImages?: ReferenceImage[];
  resolution: ImageResolution;
}

/**
 * finishReasons that mean "policy blocked" rather than "something broke".
 * Taken from the spike — the model uses both the plain and IMAGE_-prefixed
 * spellings depending on which stage refused.
 */
const POLICY_FINISH = new Set([
  "SAFETY",
  "IMAGE_SAFETY",
  "PROHIBITED_CONTENT",
  "IMAGE_PROHIBITED_CONTENT",
  "BLOCKLIST",
  "RECITATION",
  "IMAGE_RECITATION",
  "SPII",
]);

/** A thrown HTTP error can still be a policy refusal — detect it in the body. */
const POLICY_MESSAGE = /SAFETY|PROHIBITED|BLOCKED|policy/i;

/**
 * Tell the model to treat the attachments as the same people, not as loose
 * inspiration. The spike showed faces hold far better with this stated
 * explicitly alongside the attachment than with the attachment alone.
 */
function referenceInstruction(refs: ReferenceImage[]): string {
  const named = refs.map((r) => r.name).filter(Boolean) as string[];
  const who =
    named.length === refs.length && named.length > 0
      ? named.length === 1
        ? `the visual reference for ${named[0]}`
        : `the visual references, in order, for ${named.join(", ")}`
      : refs.length === 1
        ? "the visual reference for the person in this scene"
        : "the visual references for the people in this scene";
  return (
    `Use the attached ${refs.length === 1 ? "image" : "images"} as ${who}: ` +
    `keep the same face, the same person, consistent facial features and likeness.`
  );
}

/**
 * One image generation call. Never throws — every failure comes back as a typed
 * `ok: false` so callers can branch on `kind` instead of parsing errors.
 */
export async function generateImage({
  ai,
  prompt,
  referenceImages = [],
  resolution,
}: GenerateImageInput): Promise<ImageResult> {
  if (!prompt.trim()) {
    return { ok: false, kind: "error", reason: "empty prompt" };
  }

  const refs = referenceImages.slice(0, MAX_REFERENCE_IMAGES);
  if (referenceImages.length > refs.length) {
    console.warn(
      `generateImage: ${referenceImages.length} references supplied, ` +
        `attaching the first ${MAX_REFERENCE_IMAGES}.`,
    );
  }

  // References go in as inlineData parts BEFORE the text, then the explicit
  // "same face" instruction, then the prompt itself — the spike's exact order.
  const parts: object[] = refs.map((ref) => ({
    inlineData: {
      mimeType: ref.mimeType ?? "image/png",
      data: ref.data.toString("base64"),
    },
  }));
  const text = refs.length
    ? `${referenceInstruction(refs)}\n\n${prompt}`
    : prompt;
  parts.push({ text });

  try {
    const response = await ai.models.generateContent({
      model: IMAGE_CONFIG.model,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        safetySettings: SAFETY_SETTINGS,
        imageConfig: { imageSize: resolution, aspectRatio: ASPECT_RATIO },
      },
    });

    const candidate = response.candidates?.[0];
    const finishReason = String(candidate?.finishReason ?? "");
    const blockReason = String(response.promptFeedback?.blockReason ?? "");
    const outParts = candidate?.content?.parts ?? [];

    const image = outParts.find((part) => part?.inlineData?.data);
    if (image?.inlineData?.data) {
      return { ok: true, buffer: Buffer.from(image.inlineData.data, "base64") };
    }

    // No image. A refusal usually arrives as TEXT explaining why — keep it
    // verbatim, it's the only readable signal for hand-fixing the prompt later.
    const modelText = outParts
      .map((part) => part?.text)
      .filter(Boolean)
      .join(" ")
      .trim();

    if (blockReason !== "" || POLICY_FINISH.has(finishReason)) {
      return {
        ok: false,
        kind: "blocked",
        reason:
          `policy block (blockReason=${blockReason || "none"}, ` +
          `finishReason=${finishReason || "none"})` +
          (modelText ? ` — model said: ${modelText.slice(0, 300)}` : ""),
      };
    }
    return {
      ok: false,
      kind: "error",
      reason:
        `no image returned (finishReason=${finishReason || "none"})` +
        (modelText ? ` — model said: ${modelText.slice(0, 300)}` : ""),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const blocked = POLICY_MESSAGE.test(message);
    return {
      ok: false,
      kind: blocked ? "blocked" : "error",
      reason: `${blocked ? "policy block (HTTP)" : "API error"}: ${message.slice(0, 300)}`,
    };
  }
}
