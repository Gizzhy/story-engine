# Script Section — Rule Set (Phase 0)

The real prompts behind the blueprint wave. Covers three Claude calls: **DNA extraction** (Stage 1), **Blueprint** (Stage 2, = your bank's Phase 0 outline gate), and **Segment narration** (Stage 3). Your bank's `[Script Rules]` and the Approach-A/B logic are folded in; the Story Brief is now *generated*, not hand-filled.

How the layers combine per call: `BASE_RULES` (global) + the section's own system prompt + the named blocks that section needs + the variable input. For the Script section the only block in play is `SCRIPT_RULES`; Style/Whisk blocks enter in the visual sections later.

---

## Shared constants — `src/lib/prompts/blocks.ts`

```ts
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
```

---

## Premise-distance mapping (the A/B dial)

Stage 2 injects the line matching the user's dial level. Level 1 = your Approach A; level 5 = your Approach B; 2–4 fill the middle your binary couldn't reach.

```ts
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
```

---

## Module 1 — DNA Extraction · `src/lib/prompts/dna.ts`

**Purpose:** read transcript + title, output the *abstracted* pattern that made the source work — never its specifics. This is the safeguard that keeps everything downstream original.

```ts
export const dnaPrompt = {
  system: `${BASE_RULES}
You are a story analyst. Extract the reusable STRUCTURAL DNA of the source — the pattern,
not the story. CRITICAL: abstract everything. If you name the source's specific characters
or events, you are doing it wrong.

Return ONLY this JSON:
{
  "genre": "",
  "subgenre": "",
  "premiseArchetype": "the ABSTRACT shape, e.g. 'a trusted figure is revealed to have
                       betrayed the protagonist' — never the specific betrayal",
  "hookMechanism": "what makes the opening grab attention",
  "titleFormula": "the CLICK pattern of the title as a reusable template, not the title",
  "narrativePOV": "first-person / third-person / etc.",
  "tone": ["3-5 tone tags"],
  "pacingStyle": "how tension builds and releases",
  "emotionalArc": ["beat-level emotional journey, abstracted"],
  "audience": ""
}`,
  buildUser: (i: { sourceTitle: string; sourceTranscript: string }) =>
    `TITLE: ${i.sourceTitle}\n\nTRANSCRIPT:\n${i.sourceTranscript}`,
};
```

---

## Module 2 — Blueprint · `src/lib/prompts/blueprint.ts`

**Purpose:** turn the DNA + the user's knobs into the new story's plan. **This output IS the gate your bank runs first** ("tell me how the story would go") — it's what the user approves in the blueprint-review screen before the expensive writing. It also auto-produces the Story Brief.

```ts
export const blueprintPrompt = {
  system: `${BASE_RULES}
${SCRIPT_RULES}
You are a story architect for long-form narrated faceless videos. Using the provided DNA
as a creative template, design a COMPLETELY ORIGINAL story plan.

Honor the premise-distance instruction exactly. Distribute the classic arc
(setup → inciting incident → rising action → midpoint → escalation → climax → resolution)
across the planned segments. Front-load a strong narrative hook in segment 1; do not let
the middle sag; give the climax room and the ending a real payoff — never rushed.

RETENTION & PROPULSION:
- Momentum above all. Hook hard in segment 1 and re-hook constantly.
- Every segment's "endsOn" must be a real cliffhanger / burning question (a reveal, threat,
  betrayal, ultimatum, or "wait, what?") — never a quiet, contemplative ending.
- Front-load tension and revelations; don't save everything for the climax.
- Favor concrete, high-stakes turns over introspective or atmospheric passages.
- Keep the stakes loud and legible.

Define the full cast up front with fixed names, ages, roles, relationships and traits;
these stay consistent for the whole story. (Names are for the SCRIPT only.)

Adopt the point of view and tense indicated by the DNA's narrativePOV, and record it in
storyBrief.narrativePOV so every segment narrates in the same voice.

Return ONLY this JSON:
{
  "storyBrief": {
    "genre": "",
    "setting": "",
    "narrativePOV": "inherited from the DNA, e.g. first-person past tense",
    "premise": "1-3 sentence central conflict / hook"
  },
  "titleOptions": ["5 new titles in the source's title formula"],
  "logline": "",
  "characters": [
    { "name": "", "role": "lead | supporting", "age": "", "relationship": "", "traits": "", "arc": "" }
  ],
  "segments": [
    {
      "index": 1,
      "title": "internal label",
      "beat": "which part of the arc",
      "wordTarget": 1200,
      "goal": "what must happen here",
      "endsOn": "the tension that pulls into the next segment"
    }
  ]
}`,
  buildUser: (i: {
    dna: object; premiseDistanceInstruction: string;
    wordTarget: number; segmentCount: number;
    premiseSeed?: string;
  }) => `STORY DNA:\n${JSON.stringify(i.dna, null, 2)}

PREMISE DISTANCE: ${i.premiseDistanceInstruction}
${i.premiseSeed ? `USER PREMISE SEED (build from this): ${i.premiseSeed}` : ""}
LENGTH: target ${i.wordTarget} words across ${i.segmentCount} segments.`,
};
```

---

## Module 3 — Segment Narration · `src/lib/prompts/segment.ts`

**Purpose:** write one segment of prose, in order, threading the state ledger so a 90-minute story stays consistent. Called N times.

```ts
export const segmentPrompt = {
  system: `${BASE_RULES}
${SCRIPT_RULES}
You are writing ONE segment of a single continuous narrated story — immersive voiceover
prose meant to be read aloud, matching the established tone.

Rules for this segment:
- Narrate in the point of view and tense recorded in the story plan
  (storyBrief.narrativePOV); keep it consistent.
- Continue SEAMLESSLY from the previous segment's last paragraph. No recap, no "previously",
  no scene reset unless the brief calls for it.
- Hit the segment's word target within ±10%. Do NOT wrap up the whole story — only this beat.
- Stay 100% consistent with the characters, established facts, and open threads in the state.
- End on the tension described in "endsOn" so the next segment flows in.
- Segment 1 only: open with the strongest possible narrative hook.
- Output ONLY the narration prose. No headings, no labels, no JSON, no notes.`,
  buildUser: (i: {
    storyPlan: object; storyState: object; segmentBrief: object; segmentWordTarget: number;
  }) => `STORY PLAN:\n${JSON.stringify(i.storyPlan)}

STORY STATE SO FAR:\n${JSON.stringify(i.storyState)}

THIS SEGMENT'S BRIEF:\n${JSON.stringify(i.segmentBrief)}

Write ~${i.segmentWordTarget} words.`,
};
```

(The state ledger between segments is Stage 4 from the engine spec — `summarySoFar`, `characters`, `establishedFacts`, `openThreads`, `currentScene`, `lastParagraph`. Unchanged; it feeds `storyState` above.)

---

## How this maps to your bank
- **Session Setup** (paste rules once) → `BASE_RULES` + `SCRIPT_RULES` injected into every call automatically.
- **Phase 0 gate** ("tell me how the story would go") → the **Blueprint** output + the review screen.
- **Approach A / B** → premise-distance levels 1 and 5; you also gained 2–4.
- **Story Brief** (hand-filled in the bank) → generated by **Blueprint** (`storyBrief` + `characters`).

---

## Locked decisions for this section
1. **Title:** Blueprint proposes 5 `titleOptions`; the user picks one in the review screen, and the chosen title flows downstream to metadata. ✅
2. **CTA:** none. Scripts are pure story — no subscribe prompts or channel boilerplate. ✅
3. **Format:** voiceover narration only — spoken words, no screenplay formatting, scene/camera notes, speaker labels, or bracketed cues. Dialogue woven into the prose. ✅
4. **POV / tense:** auto-inherited from the source video's DNA (`narrativePOV`), carried through blueprint → every segment. No user control. ✅
5. **Word-target tolerance:** ±10% per segment, accepted as returned. No auto-retry. ✅
