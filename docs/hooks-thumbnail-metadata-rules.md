# Hooks · Thumbnail · Metadata — Rule Sets (Phases 3–5)

The three closing sections. All reuse patterns already built; the only new shared block is Style Block B (hooks). After this, every section of the engine is designed.

---

# Phase 3 — Hooks (Intro / Cold Open) — B2 model

The **cold open**: a montage that plays **before** the story's narration begins, to stop the scroll. It stands outside the script. The B2 model reads the **finished story** and produces **ONE flowing cold-open monologue** plus **backdrop shots anchored to it** — not a per-line trailer.

**Key points:**
- **Two outputs.** (1) A single continuous **monologue** (the cold-open VO script), and (2) **6–10 backdrop shots** that play under it.
- **The monologue** is ~40–80 words: opens on its most arresting line, builds to a final hook, is **woven from the story's own lines** (verbatim / lightly trimmed) with only minimal fresh connective phrasing, and is **spoiler-safe** (never reveals the ending). One continuous piece — not a list, not one line per shot.
- **Each shot anchors to an exact phrase from the monologue** (`anchor`), so we know which words it plays under. Shots cover the monologue in order.
- **Motion prompts**, not stills — each shot specifies camera movement (for the later image-to-video step).
- **Style Block B** (warmer, dramatic intro look), not Style Block A. Lean atmospheric; a character appears only when the moment calls for it.

## New shared block — `blocks.ts`

```ts
// Style Block B — Hook / Intro (warmer, more dramatic). Used ONLY by hooks.
export const STYLE_BLOCK_B = `
Cinematic lighting, high contrast, warm tones, dramatic shadows, ultra-realistic, 8K film still,
depth of field, emotional storytelling, volumetric light, richly colored.
`.trim();
```

## Module — `src/lib/prompts/hooks.ts`

```ts
export const hooksPrompt = {
  system: `${BASE_RULES}
You are writing the COLD OPEN for a finished faceless story video — the montage that plays BEFORE the
narration begins, engineered to stop the scroll. You have the FULL finished story below. Produce TWO
things: (1) ONE continuous cold-open MONOLOGUE, and (2) the backdrop SHOTS that play under it.

THE MONOLOGUE — a single, flowing voiceover of roughly 40-80 words, spoken across the whole cold open:
- OPEN on the most arresting line you can find, then build tension line to line to a final hook.
- Weave it from the STORY'S OWN LINES (verbatim or lightly trimmed); add only minimal FRESH connective
  phrasing so it flows as one piece. It should sound like the story speaking, not a summary.
- SPOILER-SAFE: tease, never resolve; NEVER reveal the ending.
- One continuous piece of writing — NOT a list, NOT one line per shot.

THE SHOTS — 6-10 backdrop images that play under the monologue as it is spoken:
- Each shot ANCHORS to an exact phrase FROM THE MONOLOGUE: copy that phrase verbatim into "anchor" so
  we know which words it plays under. Cover the monologue in order, start to finish.
- These are MOTION shots (for the later image-to-video step): give each a camera movement
  (slow push-in, drift, whip-pan, parallax…). Lean cinematic, high-contrast, dramatic.
- Lean atmospheric; a character may appear only when the moment genuinely calls for it.

${WHISK_RULES}
Do NOT write characters' physical appearance — injected separately. For each shot give only: the
anchor phrase, the shot, its motion, who is present (if any), and any present character's outfit.

Return ONLY this JSON:
{
  "monologue": "the full continuous cold-open voiceover",
  "suggestedShotCount": 8,
  "shots": [
    {
      "index": 1,
      "anchor": "the exact phrase from the monologue this shot plays under",
      "shot": "subject / setting / action",
      "motion": "camera movement",
      "present": ["Name", ...],
      "outfits": [ { "name": "Name", "outfit": "" } ]
    }
  ]
}`,
  buildUser: (i: {
    storyBrief: object; logline: string; cast: {name:string;role:string}[]; storyText: string;
  }) => `STORY CONTEXT:\n${JSON.stringify(i.storyBrief)}
LOGLINE: ${i.logline}
CAST: ${JSON.stringify(i.cast)}

FULL STORY:\n${i.storyText}`,
};
```

## Assembly (code)
```ts
shot.imagePrompt =
  `${shot.shot}.` +
  presentBlock(shot, characters) +          // verbatim identity + outfit, no names (empty if atmospheric)
  `\n\n${STYLE_BLOCK_B}`;
// Persisted: generation.hooks = { monologue, suggestedShotCount, shots:[{ index, anchor, shot,
// motion, imagePrompt, present, outfits }] }. shot.motion feeds the later image-to-video step.
```

## Locked decisions
1. B2 model: ONE flowing cold-open **monologue** + **anchored backdrop shots** (replaces the per-line trailer). ✅
2. Monologue: ~40–80 words, woven from the story's own lines, spoiler-safe, opens on its strongest line. ✅
3. Shots: **6–10**, each anchored to an exact monologue phrase, covering it in order. ✅
4. Motion prompts per shot; **Style Block B**; atmospheric-leaning. ✅

---

# Phase 4 — Thumbnail

One standalone, high-CTR cover image. **The only place Camera-Realism is used** — it can break from the story's render look because it's not part of the narrated sequence.

## Module — `src/lib/prompts/thumbnail.ts`

```ts
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
```

## Assembly (code)
```ts
const finalThumbnailPrompt =
  thumb.concept +
  featuredBlock(thumb, characters) +        // verbatim identity + outfit if a lead is featured
  `\n\n${CAMERA_REALISM}`;                   // the ONE place Camera-Realism is appended
```
Note: thumbnail aesthetic (real photo) intentionally differs from the rendered story body — exact face-match to scenes isn't expected, recognizable likeness is enough.

## Locked decisions
1. Style: **high-CTR cinematic** (not the plain summary option). ✅
2. Aesthetic: **Camera-Realism**, photoreal — thumbnail only. ✅
3. Protagonist featured when it helps CTR; verbatim identity for likeness. ✅
4. Composition: **single dominant subject, extreme-close-up peak emotion**, with the power dynamic staged
   through size/focus/lighting contrast (the other character small, behind, out of focus). **No balanced
   split-screens / two-shots** unless there's genuinely no single emotional focal point. ✅

---

# Phase 5 — Metadata

Pure text — no Whisk, no image blocks. The **title is already chosen** by the user from the blueprint's 5 options, so this section does **not** regenerate it; it generates description + tags + hashtags consistent with that title.

## Module — `src/lib/prompts/metadata.ts`

```ts
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
```

**Input note:** feed the **story summary** (the final continuity-ledger `summarySoFar`) + logline, *not* the full 12k-word narration — enough for accurate, tension-building metadata without the token cost of the whole story.

## Locked decisions
1. Title: **reused from the blueprint selection**, not regenerated here. ✅
2. Counts: **20 tags, 10 hashtags** (per the bank). ✅
3. Input: **summary + logline**, not full text. ✅
4. Research-led description variant (study trending descriptions first): **parked** — needs web search wired in; a later enhancement, not v1. ✅

---

# Design phase complete

All sections now designed: Script (Phase 0), Characters (1), Scenes (2), Hooks (3), Thumbnail (4), Metadata (5), plus the shared `blocks.ts` (BASE_RULES, SCRIPT_RULES, STYLE_BLOCK_A, STYLE_BLOCK_B, WHISK_RULES, CLOTHING_RULES, CAMERA_REALISM).

**Next: implementation, in two waves.**
- **Blueprint wave** — Firebase setup, `startJob` running DNA + blueprint (Stages 1–2) on real Claude calls, writing to Firestore, blueprint-review screen reading the live doc. Proves real output before any queue.
- **Writing wave** — `writeSegment` chained via Cloud Tasks (segment loop + state ledger), then the visual passes (characters → scenes → hooks → thumbnail → metadata) reusing this same per-segment background-job machinery.
