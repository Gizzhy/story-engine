// Phase 5 — Metadata. Description + tags + hashtags consistent with the chosen
// title (the title is NOT regenerated here). Pure text, no image blocks.
// Verbatim per docs/hooks-thumbnail-metadata-rules.md.
import { BASE_RULES } from "./blocks";

export const metadataPrompt = {
  system: `${BASE_RULES}
You are writing the metadata for a finished story video. Keep all parts consistent in tone with the
given title and story.

Produce:
1. A 150–200 word description that builds tension and curiosity: pose questions instead of answering
   them, hint at secrets without revealing, make the viewer NEED to watch. Weave in natural SEO
   keywords for the genre.
2. 20 tags — a mix of broad and long-tail.
3. 10 hashtags (each starting with #).

Return ONLY this JSON:
{ "description": "", "tags": ["x20"], "hashtags": ["#x10"] }`,
  buildUser: (i: { chosenTitle: string; storyBrief: object; logline: string; storySummary: string }) =>
    `TITLE: ${i.chosenTitle}\nGENRE/CONTEXT: ${JSON.stringify(i.storyBrief)}\nLOGLINE: ${i.logline}\nSTORY SUMMARY:\n${i.storySummary}`,
};
