// Zod schemas validating the JSON returned by the DNA and Blueprint calls.
// Shapes mirror docs/script-section-rules.md.
import { z } from "zod";

export const DnaSchema = z.object({
  genre: z.string(),
  subgenre: z.string(),
  premiseArchetype: z.string(),
  hookMechanism: z.string(),
  titleFormula: z.string(),
  narrativePOV: z.string(),
  tone: z.array(z.string()),
  pacingStyle: z.string(),
  emotionalArc: z.array(z.string()),
  audience: z.string(),
});

export const BlueprintSchema = z.object({
  storyBrief: z.object({
    genre: z.string(),
    setting: z.string(),
    narrativePOV: z.string(),
    premise: z.string(),
  }),
  titleOptions: z.array(z.string()).length(5),
  logline: z.string(),
  characters: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      age: z.string(),
      relationship: z.string(),
      traits: z.string(),
      arc: z.string(),
    }),
  ),
  segments: z.array(
    z.object({
      index: z.number(),
      title: z.string(),
      beat: z.string(),
      wordTarget: z.number(),
      goal: z.string(),
      endsOn: z.string(),
    }),
  ),
});

// Stage 4 continuity ledger — threaded into each segment call. The segment
// output itself is plain prose (a string), so it has no schema.
export const StateLedgerSchema = z.object({
  summarySoFar: z.string(),
  characters: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      traits: z.string(),
      status: z.string(),
    }),
  ),
  establishedFacts: z.array(z.string()),
  openThreads: z.array(z.string()),
  currentScene: z.object({
    location: z.string(),
    timeframe: z.string(),
    moodAtSegmentEnd: z.string(),
  }),
  lastParagraph: z.string(),
});

export type Dna = z.infer<typeof DnaSchema>;
export type Blueprint = z.infer<typeof BlueprintSchema>;
export type StateLedger = z.infer<typeof StateLedgerSchema>;
