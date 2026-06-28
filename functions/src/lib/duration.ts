// Duration → generation spec. Narration runs ~140 words/minute; segments are
// ~1,200 words each (per the engine spec).
export function durationToSpec(minutes: number): {
  wordTarget: number;
  segmentCount: number;
} {
  const wordTarget = minutes * 140;
  return {
    wordTarget,
    segmentCount: Math.ceil(wordTarget / 1200),
  };
}
