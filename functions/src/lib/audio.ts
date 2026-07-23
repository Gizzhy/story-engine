// Voice wave — audio plumbing.
//
// Gemini TTS returns RAW PCM (16-bit signed, little-endian, mono at
// VOICE_CONFIG.sampleRate). We wrap it in a WAV container ourselves (no
// encoding lib needed): WAV stitches cleanly and imports into any editor.
// Every segment stays mono at the same sample rate so concatenation is
// seamless (mismatched rates cause clicks/glitches at the seams).
import { uploadBuffer } from "./storage";

const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
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

/** Save a WAV at an exact Storage path → long-lived, login-less download URL. */
export async function uploadWav(
  path: string,
  wavBuffer: Buffer,
): Promise<string> {
  return uploadBuffer(path, wavBuffer, "audio/wav");
}

/** Save a job's narration audio at audio/{jobId}/{name}.wav. */
export async function uploadAudio(
  jobId: string,
  name: string,
  wavBuffer: Buffer,
): Promise<string> {
  return uploadWav(`audio/${jobId}/${name}.wav`, wavBuffer);
}
