# Characters Section — Rule Set (Phase 1)

Turns the blueprint's fixed cast into **reference-image prompts** — one full visual description per character that locks their face/identity so it holds across every later scene. This is where your **Style Block A** and **Whisk Consistency Rules** enter the pipeline as composed constants.

**Builds on Phase 0:** the cast already exists (`blueprint.characters`). Your bank's "Step 1 — identify the cast" is done; this section is "Step 2 — generate consistent character sheets."

**Two-stage reality (unchanged from your bank):** this section makes Claude *write* the prompts. *You* (later, manually) paste each finished prompt into Whisk to render the image. Only the Style Block text actually lands inside Whisk.

---

## New shared blocks — added to `src/lib/prompts/blocks.ts`

```ts
// Style Block A — Default Cinematic Realism (characters + scenes).
// {MOOD} is the one line that gets swapped per project to retheme the look.
export const STYLE_BLOCK_A = (mood: string) => `
Style: photorealistic, ultra-cinematic, shot in 16:9 widescreen.
Camera & Composition — eye-level perspective; balanced cinematic composition; appropriate
wide or medium framing; shallow depth of field; sharp focus on the characters; no lens distortion.
Lighting — ${mood}.
Rendering & Quality — ultra-realistic, 8K, ultra-sharp detail; photorealistic skin texture;
realistic fabric folds; clean, well-composed environment; neutral color grading; high-end photography.
`.trim();

export const WHISK_RULES = `
Whisk consistency rules:
- Facial features stay identical across every image; preserve each character's distinct
  physical and ethnic features exactly as defined.
- Whisk has no memory: re-describe every character in full every time. Never summarize or
  refer back ("the man from before").
- Never include character names in image prompts.
- Include only the characters actually present in the scene, not the whole cast.
- Write prompts that pass Whisk's content guidelines.
`;

// "Real photo, no-CGI" aesthetic — RESERVED FOR THE THUMBNAIL ONLY. Characters and scenes
// always use Style Block A; mixing the two looks inside the story body breaks consistency.
export const CAMERA_REALISM = `
Shot on Sony A7R V, 85mm f/1.4 lens, real-location photography. No CGI, no rendering, no
cartoon, no 3D modeling, no artificial smoothing. Real human faces, natural skin texture,
authentic expressions.
`;
```

---

## Project visual mood (set once, reused everywhere)

So the whole video shares one consistent look, the `{MOOD}` line is decided **once** and reused by Characters, Scenes, Hooks, and Thumbnail. It's derived from the story's genre/tone — e.g. thriller → "cool blue tones, hard shadows, low-key cinematic intensity"; romance → "warm golden tones, soft glow, gentle shadows".

```ts
// Persisted on the job once the visual phase starts; every visual section reads it.
job.styleMood   // e.g. "cool blue tones, hard shadows, low-key cinematic intensity"
```

Generate it from genre/tone (a one-line Claude call when the visual phase begins, or a small field added to the blueprint). One source of truth = visual consistency.

---

## Module — Character Reference Prompts · `src/lib/prompts/characters.ts`

**Purpose:** one detailed reference description per character, names stripped, distinct features emphasised. Claude writes the *description only*; code appends the Style Block — so the fixed block text never gets reworded.

```ts
export const charactersPrompt = {
  system: `${BASE_RULES}
You are a character designer writing REFERENCE-IMAGE descriptions for an image generator (Whisk).
For each character in the cast, write a detailed visual description that locks their identity so
the exact same face can be reproduced across many later scene images.

${WHISK_RULES}

For these reference images specifically:
- One character per description, shown alone (a clean character sheet / portrait), neutral background.
- "identity" = the IMMUTABLE physical description, with NO clothing: apparent age, gender,
  ethnicity and skin tone, face shape and distinct facial features, eyes, hair (colour, length,
  style), build, and any distinguishing marks. This exact text is reused VERBATIM in every future
  scene, so it must fully lock the face and physique on its own.
- "baselineOutfit" = a representative outfit fitting their personality, status, and the story's
  setting/era — for the reference portrait only. (Scene outfits override this later.)
- Make characters visually distinct from one another so they can never be confused.
- NEVER use a character's name. Do NOT append any style block — that is added separately.

Return ONLY this JSON:
{ "characters": [ { "name": "<cast name, for keying only — never used in prompt text>", "identity": "", "baselineOutfit": "" } ] }`,
  buildUser: (i: { storyBrief: object; characters: object[] }) =>
    `STORY CONTEXT:\n${JSON.stringify(i.storyBrief)}

CAST (write one reference description per character):\n${JSON.stringify(i.characters)}`,
};
```

---

## How the final Whisk-ready prompt is assembled (in code)

```ts
const finalReferencePrompt =
  identity + " Wearing " + baselineOutfit + "."
  + "\n\n" + STYLE_BLOCK_A(job.styleMood);
// `identity` (the clothing-free physical lock) is reused VERBATIM in every scene later.
// `baselineOutfit` is only for this reference portrait; scene outfits replace it.
// Characters + scenes ALWAYS use Style Block A only — Camera-Realism is thumbnail-only.
```

So Claude owns the *who* (the description); code owns the *look* (the fixed blocks). The result is what the user pastes into Whisk. The blueprint character object gains a `referencePrompt` field; this is the data your VISUALS → Characters subsection already renders.

**Whisk-side note (manual, later):** when generating, attach the rendered reference image as a *subject* alongside the text — image + full description together gives the most stable faces. And render **one character per image** (locks each face cleanly), even though Claude wrote all the prompts in one pass.

---

## How this maps to your bank
- **Phase 1 Step 1 (identify cast)** → already done by the blueprint's `characters` array.
- **Phase 1 Step 2 (one prompt per character)** → this module.
- **Apply: [Style Block A] + [Whisk Consistency Rules]** → `STYLE_BLOCK_A(mood)` + `WHISK_RULES`, composed in code.
- **Camera-Realism add-on** → reserved for the **thumbnail only** (not characters/scenes).
- **"One character per reference image"** → a Whisk *rendering* rule (manual step), not a prompt-writing rule.

---

## Locked decisions for this section
1. **House aesthetic:** Style Block A for characters + scenes (one consistent look across the story body). Camera-Realism is reserved for the **thumbnail only**. ✅
2. **Style mood:** auto-derived once from genre/tone, reused across all visual sections. ✅
3. **Reference outfit:** character splits into `identity` (clothing-free, reused verbatim in every scene) + `baselineOutfit` (representative, for the reference portrait only; scene outfits override). ✅
4. **Generation:** one Claude call returns all character descriptions (keeps them visually distinct, cheaper). Whisk *rendering* stays one character per image. ✅
