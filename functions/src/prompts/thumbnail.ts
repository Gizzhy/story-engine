// Phase 4 — Thumbnail. One standalone high-CTR cover prompt. The only place
// Camera-Realism is used (appended by code). Character descriptions injected separately.
// Verbatim per docs/hooks-thumbnail-metadata-rules.md.
import { BASE_RULES } from "./blocks";

export const thumbnailPrompt = {
  system: `${BASE_RULES}
You are writing ONE high-CTR YouTube thumbnail prompt — a standalone cover engineered to maximize
clicks. Not part of the narrated sequence.

High-CTR rules:
- One bold focal point; clear, often heightened emotion on a human face.
- Strong contrast and composition; instantly readable as a tiny image.
- Leave clear negative space for a title text overlay.
- Capture the story's most clickable moment to spark curiosity — without spoiling the ending.
- Everything human and real — no cartoon, no animation.

If the protagonist is featured, they should be recognizably the story's lead. Do NOT write their
physical description — injected separately. Do NOT append any style block — added separately.

Return ONLY this JSON:
{ "concept": "the thumbnail scene / emotion / composition",
  "featured": ["Name", ...],
  "outfit": [ { "name": "Name", "outfit": "" } ] }`,
  buildUser: (i: { storyBrief: object; logline: string; cast: {name:string;role:string}[] }) =>
    `STORY CONTEXT:\n${JSON.stringify(i.storyBrief)}\nLOGLINE: ${i.logline}\nCAST: ${JSON.stringify(i.cast)}`,
};
