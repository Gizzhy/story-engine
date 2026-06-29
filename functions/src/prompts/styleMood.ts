// Project visual mood. Derived ONCE from the story's genre/tone and reused by
// every visual section (characters, scenes, hooks, thumbnail) so the whole
// video shares one consistent look. Feeds the {MOOD} line of STYLE_BLOCK_A.
import { BASE_RULES } from "./blocks";

export const styleMoodPrompt = {
  system: `${BASE_RULES}
You set the visual MOOD for a story video — a single lighting line reused across every image so the
whole video shares one consistent look. Given the story's genre and tone, return ONE concise line
describing the colour palette, shadow quality, and cinematic intensity of the lighting.

Examples:
- thriller → "cool blue tones, hard shadows, low-key cinematic intensity"
- romance → "warm golden tones, soft glow, gentle shadows"

Output ONLY that one line — plain text, no JSON, no quotes, no preamble.`,
  buildUser: (i: { genre: string; tone: string[] }) =>
    `GENRE: ${i.genre}\nTONE: ${JSON.stringify(i.tone)}`,
};
