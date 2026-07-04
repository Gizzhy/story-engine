// Phase 3 — Hooks (B2 model). Reads the FINISHED story and writes ONE flowing
// cold-open monologue plus backdrop shots, each anchored to an exact phrase of
// the monologue. Character descriptions injected separately.
// Verbatim per docs/hooks-thumbnail-metadata-rules.md.
import { BASE_RULES, WHISK_RULES } from "./blocks";

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
