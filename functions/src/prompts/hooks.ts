// Phase 3 — Hooks (cold open). One coherent 5–15s intro montage as motion
// shots, plus a single teaser line. Character descriptions injected separately.
// Verbatim per docs/hooks-thumbnail-metadata-rules.md.
import { BASE_RULES, WHISK_RULES } from "./blocks";

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
