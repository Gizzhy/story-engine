// Image wave — pinned, swappable config.
//
// Proven by functions/scripts/image-spike.ts: `gemini-3-pro-image-preview`
// renders photoreal humans, holds a face across scenes when the reference image
// is attached as a subject, and clears tense/threatening story content with
// safetySettings at BLOCK_NONE.
//
// Cost is the dominant expense of this wave (~$2.80/video at 1K vs ~$0.80
// audio), so resolution is deliberately split: bulk scenes render cheap at 1K,
// and only the few hero images (thumbnail + hook shots) pay for 2K. Flipping
// scenes to 2K later is a one-line change here (~$9.40/video).
import { HarmCategory, HarmBlockThreshold } from "@google/genai";

export const IMAGE_CONFIG = {
  model: "gemini-3-pro-image-preview",
  sceneResolution: "1K", // bulk scenes — cheap
  heroResolution: "2K", // thumbnail + hook shots — crisp
  maxAttemptsPerImage: 2, // hard retry cap
  maxImagesPerJob: 120, // absolute budget ceiling per job
  costPerImage: { "1K": 0.04, "2K": 0.134 },
} as const;

/** The resolutions we price and render at. */
export type ImageResolution = keyof typeof IMAGE_CONFIG.costPerImage;

/** Every image is a 16:9 widescreen still, matching Style Block A. */
export const ASPECT_RATIO = "16:9";

/**
 * The model accepts a bounded number of attached subjects; scenes with a larger
 * cast attach only the first few references.
 */
export const MAX_REFERENCE_IMAGES = 5;

/**
 * Fictional story content (menace, threat, crime) trips content-safety false
 * positives that return a 200 with NO image. Set every adjustable filter to the
 * most permissive threshold — appropriate for this fictional-narration use case
 * — so legitimate scene prompts aren't silently blocked.
 *
 * Do NOT add `personGeneration`: it is Vertex/Enterprise-only and the Developer
 * API rejects the request outright (400). Permissiveness comes from these
 * safety settings alone.
 */
export const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }));

/** USD cost of one generated image at a given resolution. */
export function costOf(resolution: ImageResolution): number {
  return IMAGE_CONFIG.costPerImage[resolution];
}
