// Phase 4 — Thumbnail. One standalone high-CTR cover prompt. The only place
// Camera-Realism is used (appended by code). Character descriptions injected separately.
// Verbatim per docs/hooks-thumbnail-metadata-rules.md.
import { BASE_RULES } from "./blocks";

export const thumbnailPrompt = {
  system: `${BASE_RULES}
You are writing ONE high-CTR YouTube thumbnail prompt — a standalone cover engineered to maximize
clicks. Not part of the narrated sequence.

Compose every thumbnail as a SINGLE-SUBJECT, high-emotion, power-contrast image — never a balanced
split-screen:
- ONE dominant subject whose face fills most of the frame, caught at the PEAK of a single raw emotion
  (devastation, realization, fury, heartbreak) — extreme close-up energy. The face is the whole image.
- Stage the story's power dynamic through COMPOSITION, not a split layout: place the other key character
  small, behind, and thrown out of focus in the background, so their size / focus / lighting contrast
  tells the relationship at a glance (victim vs the one in control, etc.).
- Use lighting contrast between the two — warm light on the emotional lead falling to cold shadow toward
  the other — to reinforce the dynamic.
- TEASE, never spoil: show the emotional aftermath / reaction, not the reveal itself.
- Do NOT use split-screen, balanced two-shot, or side-by-side layouts unless the story genuinely has no
  single emotional focal point — a single dominant subject is strongly preferred.
- Keep clear negative space (usually the upper third) for a bold title text overlay.
- Instantly readable as a tiny image; strong contrast and composition.
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
