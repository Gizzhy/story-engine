// Module 3 — Segment Narration. Writes one segment of prose, in order,
// threading the state ledger so a long story stays consistent. Called N times.
// Verbatim per docs/script-section-rules.md.
import { BASE_RULES, SCRIPT_RULES } from "./blocks";

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
