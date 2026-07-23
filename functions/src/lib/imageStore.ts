// Image wave — where generated images land.
//
// Mirrors the audio helper: one deterministic path per artifact, and a
// long-lived download URL (Firebase download token, no expiry, no signing
// credentials). Paths are deterministic by design — a Cloud Tasks retry
// overwrites the same object instead of leaving an orphan behind.
import { uploadBuffer } from "./storage";

/** File extension per content type we accept. The model always returns PNG. */
const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Save an image at images/{jobId}/{name}.{ext} → long-lived download URL.
 * `name` identifies the artifact within the job (e.g. "scene-007",
 * "ref-<character>"), so re-running the same unit replaces it in place.
 *
 * `contentType` defaults to PNG — what the model returns. Hand-uploaded
 * references may be JPEG/WebP, so the extension follows the actual bytes rather
 * than being forced to .png.
 */
export async function uploadImage(
  jobId: string,
  name: string,
  buffer: Buffer,
  contentType = "image/png",
): Promise<string> {
  const ext = EXTENSIONS[contentType] ?? "png";
  return uploadBuffer(`images/${jobId}/${name}.${ext}`, buffer, contentType);
}

/**
 * Fetch a stored image back as bytes, for re-attaching a character reference to
 * a later scene call. The URLs carry their own download token, so this needs no
 * credentials. Returns null if the fetch fails — a missing reference costs face
 * consistency for one scene, which is not worth failing the whole run over.
 */
export async function downloadImage(
  url: string,
): Promise<{ data: Buffer; mimeType: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`Reference fetch failed (${response.status}): ${url}`);
      return null;
    }
    const data = Buffer.from(await response.arrayBuffer());
    return {
      data,
      mimeType: sniffImageType(data) ?? "image/png",
    };
  } catch (error) {
    console.warn(
      `Reference fetch threw: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Identify image bytes by magic number. Used to validate hand-uploaded
 * references — we trust the bytes, not a client-supplied content type.
 */
export function sniffImageType(buffer: Buffer): string | null {
  if (buffer.length >= 8 && buffer.toString("hex", 0, 8) === "89504e470d0a1a0a") {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer.toString("hex", 0, 3) === "ffd8ff") {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
