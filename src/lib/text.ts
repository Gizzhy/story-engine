// Shared text helpers so the transcript word count (shown in the input panel)
// and the page-level `isValid` gate derive from the same rule and never drift.

/** Minimum transcript length before a generation can start. */
export const MIN_TRANSCRIPT_WORDS = 300;

/** Whitespace-delimited word count; empty/whitespace-only is 0. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
