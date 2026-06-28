// Module 1 — DNA Extraction. Reads transcript + title and returns the
// abstracted structural pattern of the source (never its specifics).
// Verbatim per docs/script-section-rules.md.
import { BASE_RULES } from "./blocks";

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
