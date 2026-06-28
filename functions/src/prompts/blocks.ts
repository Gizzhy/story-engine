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
