// Shared prompt building blocks. BASE_RULES is prepended to every system
// prompt; SCRIPT_RULES enters the script-section calls; PREMISE_DISTANCE is the
// A/B dial line injected into the blueprint. Verbatim per docs/script-section-rules.md.

// Prepended to EVERY system prompt in the pipeline. Global, non-negotiable.
export const BASE_RULES = `
You are part of an automated story-production pipeline. Rules that always apply:
- The source video is RESEARCH ONLY. Never reuse its exact wording, specific plot
  events, names, or distinctive phrasings. Avoid plagiarism and close similarity.
- When asked for JSON, output ONLY valid JSON — no preamble, no markdown fences, no commentary.
- Write in natural, fluent English suited to spoken narration.
`;

// Your bank's Script Rules, verbatim in spirit.
export const SCRIPT_RULES = `
Script rules:
- Each character's identity, traits and relationships are fixed up front and stay
  consistent for the whole story.
- This is a VOICEOVER narration script: output ONLY the words the narrator speaks.
  Continuous prose, written for the ear, flowing and easy to read aloud top to bottom.
- No headings or subheadings. No screenplay formatting whatsoever — no scene headers,
  no stage directions, no "[pause]" or camera/visual cues, no character-name speaker labels.
- Weave any dialogue naturally into the narration; never lay it out like a play script.
- No call-to-action or subscribe prompts anywhere — pure story only.
- Never word-for-word with the source; the prose must be original.
- Narration register: punchy and propulsive, built to hold a scrolling audience. Short, direct
  sentences with momentum; concrete, vivid, dramatic word choice; stakes and emotions stated plainly.
  Avoid literary abstraction, ornate metaphor, and slow contemplative phrasing — every line should
  pull the listener to the next. Heightened and gripping, but grounded and believable.
`;

export const PREMISE_DISTANCE: Record<number, string> = {
  1: `FAITHFUL REWRITE. Keep the same core storyline, structure, and beats as the
      research. Re-tell it in entirely original wording with fresh phrasing. Same bones,
      new words. (No word-for-word.)`,
  2: `SAME PREMISE, NEW SPECIFICS. Keep the same kind of story and emotional engine,
      but invent new characters, names, and concrete details throughout.`,
  3: `SAME LANE, NEW STORY. Stay in the source's genre and emotional territory, but
      build a genuinely different premise that rhymes with it rather than copies it.`,
  4: `STRUCTURE-ONLY. Borrow the source's pacing and structural shape, but the premise,
      cast, and events are unrelated to it.`,
  5: `ORIGINAL FROM TITLE. Keep only the title formula and beat structure. Invent a
      completely original story; do not let the source's content show through at all.`,
};

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

export const CLOTHING_RULES = `
Clothing & styling rules:
- Every scene specifies each present character's outfit, appropriate to that scene.
- Outfits change with the day, location, or context (work clothes at work, home clothes at home,
  casual when out, formal for events) — the way real people re-dress.
- Style each character to fit their personality, status, and the story's setting and era; reach
  for current, on-trend looks unless the story dictates otherwise.
- If the story specifies an outfit, use it; otherwise dress them for the scene rather than
  repeating one look.
`;

// Style Block B — Hook / Intro (warmer, more dramatic). Used ONLY by hooks.
export const STYLE_BLOCK_B = `
Cinematic lighting, high contrast, warm tones, dramatic shadows, ultra-realistic, 8K film still,
depth of field, emotional storytelling, volumetric light, richly colored.
`.trim();
