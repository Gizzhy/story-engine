// Claude model ids per pipeline stage. DNA extraction is cheap/fast (Haiku);
// the blueprint needs stronger architecture reasoning (Sonnet).
export const MODELS = {
  dna: "claude-haiku-4-5-20251001",
  blueprint: "claude-sonnet-4-6",
  segment: "claude-sonnet-4-6",
  state: "claude-haiku-4-5-20251001",
} as const;
