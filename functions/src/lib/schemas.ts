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

// ── Visual sections ─────────────────────────────────────────────────────────

const OutfitSchema = z.object({ name: z.string(), outfit: z.string() });

// Phase 1 — Characters.
export const CharactersSchema = z.object({
  characters: z.array(
    z.object({
      name: z.string(),
      identity: z.string(),
      baselineOutfit: z.string(),
    }),
  ),
});

// Phase 2 — Scenes (one splitter call per segment).
export const ScenesSchema = z.object({
  scenes: z.array(
    z.object({
      type: z.string(),
      motionPriority: z.string(),
      motion: z.string(),
      narrationExcerpt: z.string(),
      setting: z.string(),
      action: z.string(),
      present: z.array(z.string()),
      outfits: z.array(OutfitSchema),
    }),
  ),
  wardrobe: z.record(
    z.string(),
    z.object({ currentOutfit: z.string(), context: z.string() }),
  ),
});

// Phase 3 — Hooks (cold open).
export const HooksSchema = z.object({
  suggestedHookCount: z.number(),
  hooks: z.array(
    z.object({
      index: z.number(),
      moment: z.string(),
      shot: z.string(),
      motion: z.string(),
      voiceover: z.string(),
      voiceoverSource: z.enum(["story", "fresh"]),
      present: z.array(z.string()),
      outfits: z.array(OutfitSchema),
    }),
  ),
});

// Phase 4 — Thumbnail.
export const ThumbnailSchema = z.object({
  concept: z.string(),
  featured: z.array(z.string()),
  outfit: z.array(OutfitSchema),
});

// Phase 5 — Metadata.
export const MetadataSchema = z.object({
  description: z.string(),
  tags: z.array(z.string()).length(20),
  hashtags: z.array(z.string()).length(10),
});

export type Dna = z.infer<typeof DnaSchema>;
export type Blueprint = z.infer<typeof BlueprintSchema>;
export type StateLedger = z.infer<typeof StateLedgerSchema>;
export type Characters = z.infer<typeof CharactersSchema>;
export type Scenes = z.infer<typeof ScenesSchema>;
export type Hooks = z.infer<typeof HooksSchema>;
export type Thumbnail = z.infer<typeof ThumbnailSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
