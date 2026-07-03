# Hooks · Thumbnail · Metadata — Rule Sets (Phases 3–5)

The three closing sections. All reuse patterns already built; the only new shared block is Style Block B (hooks). After this, every section of the engine is designed.

---

# Phase 3 — Hooks (Intro / Cold Open) — TRAILER model

The **cold open**: a montage that plays **before** the story's narration begins, to stop the scroll. It stands outside the script. Unlike the old atmospheric intro, hooks now read the **finished story** and cut a **trailer** — teasing the most charged moments, each carrying a voiceover line.

**Key points:**
- **Cut from the FINISHED story** — the full narration is fed in; hooks mine it for its most gripping moments (reveals, threats, betrayals, turning points), not vague atmosphere.
- **6–10 charged moments**, ordered as an **escalating montage** that tightens shot to shot and ends on the sharpest unanswered question.
- **Spoiler control:** tease, never resolve; never reveal the ending. Curiosity, not payoff.
- **Each shot carries a VOICEOVER line** — one line per shot. **Strongly prefer a real line lifted from the story** (verbatim, or lightly trimmed); fuller lines welcome; write a **fresh** line only when nothing in the story is punchy enough. Each line is tagged `voiceoverSource: "story" | "fresh"`.
- **Motion prompts**, not stills — each shot specifies camera movement (for the later image-to-video step).
- **Style Block B** (warmer, dramatic intro look), not Style Block A.
- Characters may appear when a moment calls for them, using verbatim identity injection like scenes.

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
You are cutting the TRAILER for a finished faceless story video — the cold-open montage that plays
BEFORE the narration begins, engineered to stop the scroll. You have the FULL finished story below;
mine it for its most charged MOMENTS and tease them like a movie trailer.

Pull 6-10 of the story's most gripping moments — reveals, threats, betrayals, turning points, the
lines that make a viewer NEED to know what happens next. Order them as an ESCALATING montage that
tightens shot to shot and ends on the sharpest unanswered question.

SPOILER CONTROL: tease, never resolve. Convey the charge of a moment without giving away how it turns
out, and NEVER reveal the ending. Curiosity, not payoff.

These are MOTION shots (for the later image-to-video step): for each, give the camera movement
(slow push-in, drift, whip-pan, parallax…). Lean cinematic, high-contrast, dramatic.

Each shot carries a VOICEOVER line — the words spoken over that beat. STRONGLY PREFER a real line
lifted from the story itself (verbatim, or lightly trimmed for length); fuller, meatier lines are
welcome when they hit harder. Only write a FRESH line when nothing in the story is punchy enough for
that beat. Mark each line's source: "story" if taken or adapted from the narration, "fresh" if newly
written. Never resolve the ending in a voiceover.

${WHISK_RULES}
Do NOT write characters' physical appearance — injected separately. For each shot give only: the
moment it teases, the shot, its motion, the voiceover (+ its source), who is present (if any), and
any present character's outfit.

Return ONLY this JSON:
{
  "suggestedHookCount": 8,
  "hooks": [
    {
      "index": 1,
      "moment": "the charged story beat this shot teases",
      "shot": "subject / setting / action",
      "motion": "camera movement",
      "voiceover": "the line spoken over this shot",
      "voiceoverSource": "story | fresh",
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
hook.imagePrompt =
  `${hook.shot}.` +
  presentBlock(hook, characters) +          // verbatim identity + outfit, no names (empty if atmospheric)
  `\n\n${STYLE_BLOCK_B}`;
// hook.motion, hook.voiceover, hook.voiceoverSource and hook.moment are persisted alongside
// imagePrompt. motion + voiceover feed the later video / VO steps, not the still prompt.
```

## Locked decisions
1. Trailer model: hooks are cut from the **finished story**, teasing its **charged moments**. ✅
2. Voiceover per shot: one line each, **preferring real story lines** (tagged story/fresh). ✅
3. Count: AI-suggested, **6–10 moments**, escalating montage (single call). ✅
4. Spoiler control: **tease, never resolve**; never reveal the ending. ✅
5. Look: **Style Block B**. ✅

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
