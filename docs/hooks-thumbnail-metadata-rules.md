# Hooks · Thumbnail · Metadata — Rule Sets (Phases 3–5)

The three closing sections. All reuse patterns already built; the only new shared block is Style Block B (hooks). After this, every section of the engine is designed.

---

# Phase 3 — Hooks (Intro / Cold Open)

The **cold open**: a 5–15 second montage that plays **before** the story's narration begins, to stop the scroll. It stands outside the script — no segment narration runs under it.

**Key differences from scenes:**
- **Generated as ONE coherent sequence**, not isolated shots. If multiple shots are suggested, they must flow as an escalating montage (wide atmospheric establishing → tighter tension → a final unanswered-question beat), or they'll feel random.
- **Count is AI-suggested but capped low (1–3)** — the whole intro is only ~5–15s, so more shots = faster cuts in the same window, not a longer intro.
- **One teaser line for the whole montage** — a single dramatic sentence (not from the story's narration) voiced across the intro to bait curiosity. One line, not one per shot.
- **Motion prompts**, not stills — each shot specifies camera movement (for the later image-to-video step).
- **Style Block B** (warmer, dramatic intro look), not Style Block A.
- **Leans atmospheric** (no characters) to build mystery; a character may appear if it strengthens the hook, using verbatim identity injection like scenes.

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
You are designing the COLD OPEN for a faceless story video — the 5–15 second intro montage that
plays BEFORE the story's narration begins. Generate it as ONE coherent sequence, not isolated shots.

Decide how many shots the intro needs (1–3) and design them to FLOW as an escalating montage —
e.g. a wide atmospheric establishing shot → a tighter tension shot → a final beat that poses an
unanswered question. The shots must connect into one designed sequence, never random.

Lean atmospheric (no characters) to build mystery; a character may appear only if it strengthens
the hook. These are MOTION shots: for each, give the camera movement (slow push-in, drift, parallax…).

Also write ONE teaser line — a single dramatic sentence (NOT from the story's narration) voiced
across the whole intro, baiting curiosity without spoiling. One line for the whole montage.

${WHISK_RULES}
Do NOT write characters' physical appearance — injected separately. Give only: the shot, its motion,
who is present (if any), and any present character's outfit.

Return ONLY this JSON:
{
  "suggestedHookCount": 2,
  "teaserLine": "",
  "hooks": [
    { "index": 1, "shot": "subject / setting / action", "motion": "camera movement",
      "present": ["Name", ...], "outfits": [ { "name": "Name", "outfit": "" } ] }
  ]
}`,
  buildUser: (i: { storyBrief: object; logline: string; cast: {name:string;role:string}[] }) =>
    `STORY CONTEXT:\n${JSON.stringify(i.storyBrief)}\nLOGLINE: ${i.logline}\nCAST: ${JSON.stringify(i.cast)}`,
};
```

## Assembly (code)
```ts
hook.imagePrompt =
  `${hook.shot}.` +
  presentBlock(hook, characters) +          // verbatim identity + outfit, no names (empty if atmospheric)
  `\n\n${STYLE_BLOCK_B}`;
// hook.motion stays separate — it feeds the image-to-video step, not the still prompt.
```

## Locked decisions
1. Teaser line: **yes** — one line per intro, voiced across the montage. ✅
2. Count: AI-suggested, **capped 1–3**. ✅
3. Multiple hooks: **sequenced, coherent montage** (single call), not isolated shots. ✅
4. Look: **Style Block B**, atmospheric-leaning. ✅

---

# Phase 4 — Thumbnail

One standalone, high-CTR cover image. **The only place Camera-Realism is used** — it can break from the story's render look because it's not part of the narrated sequence.

## Module — `src/lib/prompts/thumbnail.ts`

```ts
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
