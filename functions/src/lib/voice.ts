// Voice/TTS wave — pinned, swappable config + FIXED craft rules.
//
// Every video uses the SAME voice, model, and craft direction — no per-story
// adaptation. YouTube story narration wants a plain, steady, audiobook-style
// read (confirmed against competitors + playground tests): emotional "acting"
// reads as overacting for this format, so the direction is deliberately
// restrained and identical for every story.
export const VOICE_CONFIG = {
  // Preferred voice: 3.1 Flash TTS. The live id needs the `-preview` suffix —
  // the bare `gemini-3.1-flash-tts` returns NOT_FOUND. Long single-request
  // outputs fade/degrade on this model (and 2.5), so synthSegment sub-chunks
  // every call to keep it in its good zone.
  model: "gemini-3.1-flash-tts-preview",
  // The 3.1 preview intermittently throws a spurious 400 INVALID_ARGUMENT on the
  // exact same (benign) request — a model bug, not a content/safety issue. The
  // stable 2.5 preview handles those reliably, so a sub-chunk that keeps failing
  // on the primary falls back to this model (same Algenib voice; per-chunk only).
  fallbackModel: "gemini-2.5-flash-preview-tts",
  voice: "Algenib",
  sampleRate: 24000,
} as const;

// Target length of ONE sub-chunk, in seconds of audio. The chunker converts this
// to a word budget (~2.5 words/sec) and splits on sentence boundaries. Shared by
// segment AND hook synthesis so tuning it here updates both. Larger = fewer TTS
// calls (fewer seams, less quota burn) but longer single outputs (more fade risk).
export const CHUNK_TARGET_SECONDS = 60;

// Fixed narration craft — plain, restrained, audiobook-style, at a subtly brisk
// pace. Used verbatim as the whole delivery direction for every segment (no
// emotional tone prepended).
export const NARRATION_CRAFT =
  "Narrate clearly and steadily, like a calm audiobook narrator, at a slightly " +
  "brisk, engaged pace that keeps moving — not slow or plodding, but never " +
  "rushed or hurried. Even and easy to listen to for a long time. Do NOT " +
  "overact, dramatize, or perform — let the words carry the story. Neutral, " +
  "grounded delivery.";

// Fixed cold-open hook craft — slightly more energy to open strong, still plain.
export const HOOK_CRAFT =
  "Narrate with clear, engaging delivery and a bit more energy to open strong " +
  "— but still grounded and natural, never theatrical. Steady pace, no drama.";
