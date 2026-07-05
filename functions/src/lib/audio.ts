// Voice wave — audio plumbing.
//
// Gemini TTS returns RAW PCM (16-bit signed, little-endian, mono at
// VOICE_CONFIG.sampleRate). We wrap it in a WAV container ourselves (no
// encoding lib needed): WAV stitches cleanly and imports into any editor.
// Every segment stays mono at the same sample rate so concatenation is
// seamless (mismatched rates cause clicks/glitches at the seams).
import { randomUUID } from "node:crypto";
import { getStorage } from "firebase-admin/storage";

const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/**
 * The project's default Storage bucket. In the functions runtime,
 * getStorage().bucket() defaults to the legacy `<project>.appspot.com` name,
 * which newer projects never provision — the real default bucket is
 * `<project>.firebasestorage.app`. Resolve it explicitly (STORAGE_BUCKET env
 * override wins), so uploads land in the bucket that actually exists.
 */
function defaultBucketName(): string {
  if (process.env.STORAGE_BUCKET) return process.env.STORAGE_BUCKET;
  const projectId =
    JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId ??
    process.env.GCLOUD_PROJECT ??
    process.env.GCP_PROJECT;
  return `${projectId}.firebasestorage.app`;
}
const WAV_HEADER_BYTES = 44;

/** Prepend a canonical 44-byte PCM/WAV header to raw 16-bit mono PCM. */
export function pcmToWav(pcmBuffer: Buffer, sampleRate: number): Buffer {
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const blockAlign = NUM_CHANNELS * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataLen = pcmBuffer.length;

  const header = Buffer.alloc(WAV_HEADER_BYTES);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataLen, 4); // ChunkSize = 36 + data
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // Subchunk1Size (PCM)
  header.writeUInt16LE(1, 20); // AudioFormat = PCM
  header.writeUInt16LE(NUM_CHANNELS, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataLen, 40);

  return Buffer.concat([header, pcmBuffer]);
}

/**
 * Extract the raw PCM payload from a WAV buffer by locating its `data` chunk
 * (robust to header size variance, though our own headers are a fixed 44 bytes).
 */
function readWavData(wav: Buffer): { pcm: Buffer; sampleRate: number } {
  const sampleRate = wav.readUInt32LE(24);
  let offset = 12; // past "RIFF"<size>"WAVE"
  while (offset + 8 <= wav.length) {
    const chunkId = wav.toString("ascii", offset, offset + 4);
    const chunkSize = wav.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    if (chunkId === "data") {
      return { pcm: wav.subarray(bodyStart, bodyStart + chunkSize), sampleRate };
    }
    // Chunks are word-aligned: sizes get padded to even lengths.
    offset = bodyStart + chunkSize + (chunkSize % 2);
  }
  // Fallback: assume the canonical 44-byte header.
  return { pcm: wav.subarray(WAV_HEADER_BYTES), sampleRate };
}

/**
 * Stitch multiple mono WAVs into one continuous WAV: strip each header, concat
 * the raw PCM, then wrap with a single new header. Assumes a shared sample rate
 * (they all come from VOICE_CONFIG); the first file's rate is used.
 */
export function concatWav(wavBuffers: Buffer[]): Buffer {
  if (wavBuffers.length === 0) {
    throw new Error("concatWav: no WAV buffers provided");
  }
  const parts = wavBuffers.map(readWavData);
  const sampleRate = parts[0].sampleRate;
  const pcm = Buffer.concat(parts.map((p) => p.pcm));
  return pcmToWav(pcm, sampleRate);
}

/**
 * Save a WAV to Storage at audio/{jobId}/{name}.wav and return a long-lived,
 * login-less download URL. We attach a Firebase download token so the URL never
 * expires (no signing credentials or public-ACL dependency).
 */
export async function uploadAudio(
  jobId: string,
  name: string,
  wavBuffer: Buffer,
): Promise<string> {
  const bucket = getStorage().bucket(defaultBucketName());
  const path = `audio/${jobId}/${name}.wav`;
  const file = bucket.file(path);
  const token = randomUUID();

  await file.save(wavBuffer, {
    resumable: false,
    contentType: "audio/wav",
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  });

  return (
    `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
    `${encodeURIComponent(path)}?alt=media&token=${token}`
  );
}
