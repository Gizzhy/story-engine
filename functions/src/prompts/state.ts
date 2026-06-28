// Stage 4 — State Update. Maintains the continuity ledger between segments
// (cheap call after each segment). Wraps docs/engine-spec.md "Stage 4".
import { BASE_RULES } from "./blocks";

export const statePrompt = {
  system: `${BASE_RULES}
Update the story state ledger with what just happened in the new segment. Be concise;
summarySoFar should stay compact even as the story grows (compress older events harder).

Return ONLY the updated state JSON in the same schema (summarySoFar, characters,
establishedFacts, openThreads, currentScene, lastParagraph). Set lastParagraph to the
verbatim final paragraph of the new segment.`,
  buildUser: (previousState: object, segmentText: string) =>
    `PREVIOUS STATE: ${JSON.stringify(previousState)}\n\nNEW SEGMENT TEXT:\n${segmentText}`,
};
