// Core data contracts for the Story Engine pipeline.
// UI-only phase: these mirror the engine spec's output schema (docs/engine-spec.md)
// so later real-pipeline work is additive, never a rearchitecture.

/** Output length the user picks; drives word target + segment count. */
export type Duration = 30 | 45 | 60 | 75 | 90;

/** How far the new story travels from the source: 1 Twin → 5 Format-only. */
export type PremiseDistance = 1 | 2 | 3 | 4 | 5;

/** Everything captured on the left rail before a run starts. */
export interface GenerationInput {
  sourceTitle: string;
  sourceTranscript: string;
  durationMinutes: Duration;
  premiseDistance: PremiseDistance;
  /** Optional user idea to build the premise from. */
  premiseSeed?: string;
  /** Optional pasted narration sample to match the writing voice. */
  styleSample?: string;
}

/** One planned beat from Stage 2 (Story Architecture). */
export interface SegmentPlan {
  index: number;
  /** Internal label for the beat. */
  title: string;
  /** Which part of the arc this segment covers. */
  beat: string;
  wordTarget: number;
  /** What must happen in this segment. */
  goal: string;
  /** The hook/tension that pulls into the next segment. */
  endsOn: string;
}

/** Stage 2 output: the cheap-to-regenerate plan the user reviews before writing. */
export interface Blueprint {
  titleOptions: string[];
  logline: string;
  premise: string;
  setting: string;
  characters: {
    name: string;
    role: string;
    traits: string;
    arc: string;
  }[];
  segments: SegmentPlan[];
}

/**
 * One finished segment of narration prose from Stage 3. For now a segment maps
 * 1:1 to a scene, so it carries its own image-generation prompt (later this may
 * split into multiple scenes per segment via the scene-splitter pass).
 */
export interface StorySegment {
  index: number;
  text: string;
  /** Per-scene prompt for the image-generation pass. */
  imagePrompt: string;
}

/** Stage 5 deliverable. `scenes`/`description`/`tags` are reserved for later passes. */
export interface Generation {
  title: string;
  titleOptions: string[];
  durationMinutes: Duration;
  wordCount: number;
  segments: StorySegment[];
  /** LATER: a scene-splitter pass populates these with imagePrompts. */
  scenes: unknown[];
  description?: string;
  tags?: string[];
}

/** Lifecycle of a generation job; the right canvas is a state machine over this. */
export type JobStatus =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'blueprint_ready'
  | 'writing'
  | 'done'
  | 'error';
