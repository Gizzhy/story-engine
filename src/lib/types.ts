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

/** Auto-generated brief carried from the blueprint into every segment. */
export interface StoryBrief {
  genre: string;
  setting: string;
  /** POV + tense inherited from the source DNA, e.g. "first-person past tense". */
  narrativePOV: string;
  premise: string;
}

/** A cast member defined up front in the blueprint; names are for the script only. */
export interface BlueprintCharacter {
  name: string;
  /** "lead" | "supporting". */
  role: string;
  age: string;
  relationship: string;
  traits: string;
  arc: string;
}

/** Stage 2 output: the cheap-to-regenerate plan the user reviews before writing. */
export interface Blueprint {
  storyBrief: StoryBrief;
  titleOptions: string[];
  logline: string;
  characters: BlueprintCharacter[];
  segments: SegmentPlan[];
}

/** Stage 1 output: the abstracted structural pattern of the source. */
export interface Dna {
  genre: string;
  subgenre: string;
  premiseArchetype: string;
  hookMechanism: string;
  titleFormula: string;
  narrativePOV: string;
  tone: string[];
  pacingStyle: string;
  emotionalArc: string[];
  audience: string;
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

/** A cast member's locked visual identity for the image pipeline (Phase 1). */
export interface Character {
  /** Cast name — for keying only; never appears in prompt text. */
  name: string;
  /** "lead" | "supporting", carried from the blueprint cast. */
  role?: string;
  /** Immutable, clothing-free physical lock — reused verbatim in every scene. */
  identity: string;
  /** Representative outfit for the reference portrait only (scenes override). */
  baselineOutfit: string;
  /** Assembled Whisk-ready reference prompt (identity + outfit + Style Block A). */
  referencePrompt: string;
}

/** A visual moment split from the narration; one image per scene (Phase 2). */
export interface Scene {
  /** Global running index across the whole story. */
  index: number;
  /** "narrated" | "bridge". */
  type: string;
  /** "ambient" | "animate". */
  motionPriority: string;
  /** For 'animate' scenes only — what moves and how; empty otherwise. */
  motion: string;
  /** The narration line(s) this illustrates (empty for a bridge shot). */
  narrationExcerpt: string;
  setting: string;
  action: string;
  /** Cast names present — for keying only. */
  present: string[];
  outfits: { name: string; outfit: string }[];
  /** Assembled Whisk-ready scene prompt (setting + action + identities + Style Block A). */
  imagePrompt: string;
}

/** A trailer beat for the cold open — a charged story moment with a voiceover line. */
export interface HookScene {
  index: number;
  /** The charged story beat this shot teases. */
  moment: string;
  /** The voiceover line spoken over this shot. */
  voiceover: string;
  /** Whether the voiceover was lifted/adapted from the story or freshly written. */
  voiceoverSource: "story" | "fresh";
  /** Assembled Whisk-ready image prompt for the shot (Style Block B). */
  imagePrompt: string;
  /** Camera movement for the image-to-video step (kept separate from the still). */
  motion?: string;
}

/** Stage 5 deliverable. `scenes` is reserved for the future scene-splitter pass. */
export interface Generation {
  title: string;
  titleOptions: string[];
  durationMinutes: Duration;
  wordCount: number;
  segments: StorySegment[];
  /** Reusable character references for the image pipeline. */
  characters: Character[];
  /** Trailer beats for the cold open — charged story moments with voiceover. */
  hooks: HookScene[];
  /** The AI's recommendation for how many intro motion scenes suit this story. */
  suggestedHookCount: number;
  /** Click-optimised prompt for the video thumbnail image. */
  thumbnailPrompt: string;
  /** Scenes split from the narration by the Phase 2 splitter pass. */
  scenes: Scene[];
  description?: string;
  /** SEO keyword tags. */
  tags?: string[];
  /** Social #hashtags (kept separate from `tags`). */
  hashtags: string[];
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

/** One finished narration segment as written by the pipeline (prose only). */
export interface JobSegment {
  index: number;
  text: string;
}

/** Stage 4 continuity ledger, threaded between segments to keep a long story consistent. */
export interface StateLedger {
  summarySoFar: string;
  characters: { name: string; role: string; traits: string; status: string }[];
  establishedFacts: string[];
  openThreads: string[];
  currentScene: { location: string; timeframe: string; moodAtSegmentEnd: string };
  lastParagraph: string;
}

/**
 * The live Firestore job document the client subscribes to. Artifacts fill in
 * as the pipeline advances: `dna` after analyzing, `blueprint` after planning,
 * then the writing stage streams `segments` (tracked by `writeProgress`) and
 * maintains the `ledger`, finally assembling `generation`.
 */
export interface Job {
  id?: string;
  status: JobStatus;
  input: GenerationInput;
  dna?: Dna;
  blueprint?: Blueprint;
  /** The title the user picked in blueprint review, flowed downstream. */
  chosenTitle?: string;
  /**
   * Segments written during the writing stage, keyed by index (a map, not an
   * array) so Cloud Tasks retries overwrite the same key instead of appending.
   * The canonical ordered array lives on `generation.segments` once done.
   */
  segmentsByIndex?: Record<string, JobSegment>;
  /** Running continuity ledger maintained after each segment. */
  ledger?: StateLedger;
  /** Writing progress for the live "Segment X of N" view. */
  writeProgress?: { current: number; total: number };
  /** Project visual mood, derived once and reused by every visual section. */
  styleMood?: string;
  /** Lifecycle of the visual phase (characters → scenes → … → metadata). */
  visualStatus?: VisualStatus;
  /** Scene-splitting progress (per segment) for a live "Scene X of N" view. */
  sceneProgress?: { current: number; total: number };
  /** Scenes keyed by segment index — one splitter call's output per segment. */
  scenesBySegment?: Record<string, Scene[]>;
  /** The finished deliverable; the visual fields land here as they're produced. */
  generation?: Generation;
  error?: string;
}

/** Lifecycle of the visual phase, mirroring the section order. */
export type VisualStatus =
  | 'styling'
  | 'characters'
  | 'scenes'
  | 'hooks'
  | 'thumbnail'
  | 'metadata'
  | 'done'
  | 'error';
