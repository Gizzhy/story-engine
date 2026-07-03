// Phase 3 — Hooks (TRAILER model). Reads the FINISHED story and cuts a cold-open
// montage that teases the most charged moments; each shot carries a voiceover
// line (preferring real story lines). Character descriptions injected separately.
// Verbatim per docs/hooks-thumbnail-metadata-rules.md.
import { BASE_RULES, WHISK_RULES } from "./blocks";

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
