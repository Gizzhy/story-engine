/**
 * Story Engine — Cloud Functions.
 *
 * startJob (onCall): validates input, creates jobs/{id} with status 'analyzing',
 *   and returns { jobId } immediately — no Claude work, so it never times out.
 * onJobCreated (Firestore onCreate trigger): runs the real pipeline in the
 *   background — Stage 1 (DNA) + Stage 2 (Blueprint) — writing live status
 *   updates the subscribed client sees. The writing stage is a later wave.
 */
import { setGlobalOptions } from "firebase-functions";
import { onCall, HttpsError } from "firebase-functions/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import {
  getFirestore,
  FieldValue,
  type DocumentReference,
} from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import Anthropic from "@anthropic-ai/sdk";
import {
  GoogleGenAI,
  Modality,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/genai";
import { z } from "zod";

import { dnaPrompt } from "./prompts/dna";
import { blueprintPrompt } from "./prompts/blueprint";
import { segmentPrompt } from "./prompts/segment";
import { statePrompt } from "./prompts/state";
import { styleMoodPrompt } from "./prompts/styleMood";
import { charactersPrompt } from "./prompts/characters";
import { scenesPrompt } from "./prompts/scenes";
import { hooksPrompt } from "./prompts/hooks";
import { thumbnailPrompt } from "./prompts/thumbnail";
import { metadataPrompt } from "./prompts/metadata";
import { PREMISE_DISTANCE } from "./prompts/blocks";
import { durationToSpec } from "./lib/duration";
import { parseJson } from "./lib/json";
import * as assemble from "./lib/assemble";
import {
  DnaSchema,
  BlueprintSchema,
  StateLedgerSchema,
  CharactersSchema,
  ScenesSchema,
  HooksSchema,
  ThumbnailSchema,
  MetadataSchema,
  type Dna,
  type Blueprint,
  type StateLedger,
  type Characters,
  type Scenes,
  type Hooks,
  type Thumbnail,
  type Metadata,
} from "./lib/schemas";
import { MODELS } from "./lib/models";
import {
  VOICE_CONFIG,
  NARRATION_CRAFT,
  HOOK_CRAFT,
  CHUNK_TARGET_SECONDS,
} from "./lib/voice";
import { pcmToWav, concatWav, uploadAudio, uploadWav } from "./lib/audio";

setGlobalOptions({ maxInstances: 10 });

initializeApp();
const db = getFirestore();

// Anthropic key lives in Secret Manager; the client is built per-invocation.
const anthropicKey = defineSecret("ANTHROPIC_API_KEY");
// Gemini key (voice/TTS wave) — must be a PAID Cloud Billing key: free-tier TTS
// output is not licensed for commercial use.
const geminiKey = defineSecret("GEMINI_API_KEY");

const REGION = "europe-west3";

/** What the client sends. Mirrors the Next-side GenerationInput. */
interface GenerationInput {
  sourceTitle: string;
  sourceTranscript: string;
  durationMinutes: number;
  premiseDistance: number;
  premiseSeed?: string;
  styleSample?: string;
  /** Scene density; controls words-per-scene for the splitter. */
  density?: "Tight" | "Medium" | "Full";
}

/** Words per scene by density (per docs/scenes-section-rules.md). */
function wordsPerScene(density: string | undefined): number {
  switch (density) {
    case "Tight":
      return 180;
    case "Full":
      return 75;
    case "Medium":
    default:
      return 120;
  }
}

/** Thrown when a JSON response was cut off at max_tokens (unparseable). */
export class TruncatedJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TruncatedJsonError";
  }
}

/** One Claude call; returns the joined text and the stop reason. */
async function createMessage(
  client: Anthropic,
  model: string,
  maxTokens: number,
  system: string,
  user: string,
): Promise<{ text: string; stopReason: string | null }> {
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  // Anthropic's stop_reason === "max_tokens" is the equivalent of a
  // finish_reason ceiling hit — the output was truncated.
  return { text, stopReason: response.stop_reason ?? null };
}

/**
 * Call Claude for JSON, parse and validate it. Retries once on any
 * call/parse/validate failure. If the failure was caused by the response
 * hitting the token ceiling, throws TruncatedJsonError (with clear logs);
 * otherwise rethrows the underlying error.
 */
async function generateJson<T>(
  client: Anthropic,
  model: string,
  maxTokens: number,
  system: string,
  user: string,
  schema: z.ZodType<T>,
): Promise<T> {
  let lastError: unknown;
  let truncated = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    let stopReason: string | null = null;
    let length = 0;
    try {
      const res = await createMessage(client, model, maxTokens, system, user);
      stopReason = res.stopReason;
      length = res.text.length;
      return schema.parse(parseJson(res.text));
    } catch (error) {
      lastError = error;
      const hitCeiling = stopReason === "max_tokens";
      if (hitCeiling) truncated = true;
      console.error(
        `generateJson failed (model=${model}, attempt=${attempt + 1}, ` +
          `stop_reason=${stopReason}, response_length=${length}, ` +
          `hit_token_ceiling=${hitCeiling}, max_tokens=${maxTokens}): ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }
  if (truncated) {
    throw new TruncatedJsonError(
      `Response truncated at max_tokens (${maxTokens}) for model ${model}.`,
    );
  }
  throw lastError;
}

/** Call Claude for free-form prose; returns the joined text (no JSON parse). */
async function generateText(
  client: Anthropic,
  model: string,
  maxTokens: number,
  system: string,
  user: string,
): Promise<string> {
  const { text, stopReason } = await createMessage(
    client,
    model,
    maxTokens,
    system,
    user,
  );
  if (stopReason === "max_tokens") {
    console.warn(
      `generateText hit max_tokens (${maxTokens}) for model ${model}; ` +
        `prose may be truncated (length=${text.length}).`,
    );
  }
  return text;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** A fresh, empty continuity ledger for the start of the writing stage. */
function emptyLedger(): StateLedger {
  return {
    summarySoFar: "",
    characters: [],
    establishedFacts: [],
    openThreads: [],
    currentScene: { location: "", timeframe: "", moodAtSegmentEnd: "" },
    lastParagraph: "",
  };
}

// Fully-qualified queue paths so tasks land in the europe-west3 queues.
const WRITE_SEGMENT_QUEUE = `locations/${REGION}/functions/writeSegment`;
const GENERATE_CHARACTERS_QUEUE = `locations/${REGION}/functions/generateCharacters`;
const SPLIT_SCENES_QUEUE = `locations/${REGION}/functions/splitScenes`;
const GENERATE_HOOKS_QUEUE = `locations/${REGION}/functions/generateHooks`;
const GENERATE_THUMBNAIL_QUEUE = `locations/${REGION}/functions/generateThumbnail`;
const GENERATE_METADATA_QUEUE = `locations/${REGION}/functions/generateMetadata`;
// Voice/TTS wave queues.
const PREPARE_AUDIO_QUEUE = `locations/${REGION}/functions/prepareAudio`;
const SYNTH_SEGMENT_QUEUE = `locations/${REGION}/functions/synthSegment`;
const SYNTH_HOOK_QUEUE = `locations/${REGION}/functions/synthHook`;
const STITCH_AUDIO_QUEUE = `locations/${REGION}/functions/stitchAudio`;

/**
 * Create a job and return fast. The heavy Claude work happens in onJobCreated,
 * so this resolves in well under a second and never hits the request timeout.
 */
export const startJob = onCall<GenerationInput>(
  { region: REGION },
  async (request) => {
    const input = request.data;

    if (
      !input ||
      typeof input.sourceTitle !== "string" ||
      typeof input.sourceTranscript !== "string" ||
      typeof input.durationMinutes !== "number" ||
      typeof input.premiseDistance !== "number"
    ) {
      throw new HttpsError("invalid-argument", "Invalid generation input.");
    }

    const jobRef = db.collection("jobs").doc();
    await jobRef.set({
      status: "analyzing",
      input,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { jobId: jobRef.id };
  },
);

/**
 * Background pipeline. Fires once when a job doc is created; its own status
 * UPDATES to the same doc do not re-trigger it (onCreate only).
 */
export const onJobCreated = onDocumentCreated(
  {
    document: "jobs/{jobId}",
    region: REGION,
    secrets: [anthropicKey],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const jobRef = snap.ref;
    const input = (snap.data() as { input: GenerationInput }).input;

    try {
      const anthropic = new Anthropic({ apiKey: anthropicKey.value() });

      // STAGE 1 — DNA extraction.
      const dna = await generateJson<Dna>(
        anthropic,
        MODELS.dna,
        2000,
        dnaPrompt.system,
        dnaPrompt.buildUser(input),
        DnaSchema,
      );

      await jobRef.update({
        status: "planning",
        updatedAt: FieldValue.serverTimestamp(),
      });

      const spec = durationToSpec(input.durationMinutes);
      const premiseDistanceInstruction = PREMISE_DISTANCE[input.premiseDistance];

      // STAGE 2 — Blueprint.
      const blueprint = await generateJson<Blueprint>(
        anthropic,
        MODELS.blueprint,
        8000,
        blueprintPrompt.system,
        blueprintPrompt.buildUser({
          dna,
          premiseDistanceInstruction,
          wordTarget: spec.wordTarget,
          segmentCount: spec.segmentCount,
          premiseSeed: input.premiseSeed,
        }),
        BlueprintSchema,
      );

      // Nest under `blueprint` (the UI reads blueprint.*); review can now render.
      await jobRef.update({
        status: "blueprint_ready",
        blueprint: {
          storyBrief: blueprint.storyBrief,
          titleOptions: blueprint.titleOptions,
          logline: blueprint.logline,
          characters: blueprint.characters,
          segments: blueprint.segments,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      const message =
        error instanceof TruncatedJsonError
          ? "The story plan was too long to generate — try a shorter duration or regenerate."
          : error instanceof Error
            ? error.message
            : "Generation failed.";
      await jobRef.set(
        {
          status: "error",
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

/**
 * Approve a blueprint and kick off the writing stage. Fast (no Claude): records
 * the chosen title, flips the job to 'writing', seeds an empty ledger, and
 * enqueues the first writeSegment task.
 */
export const approveJob = onCall<{ jobId: string; chosenTitle: string }>(
  { region: REGION },
  async (request) => {
    const { jobId, chosenTitle } = request.data;
    if (!jobId || typeof chosenTitle !== "string") {
      throw new HttpsError("invalid-argument", "Missing jobId or chosenTitle.");
    }

    const jobRef = db.collection("jobs").doc(jobId);
    const snap = await jobRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const data = snap.data() as { status: string; blueprint?: Blueprint };
    if (data.status !== "blueprint_ready") {
      throw new HttpsError(
        "failed-precondition",
        "Job is not awaiting approval.",
      );
    }

    const total = data.blueprint?.segments.length ?? 0;
    await jobRef.update({
      chosenTitle,
      status: "writing",
      // Segments live in a map keyed by index (idempotent on retry); there is
      // no top-level segments array during writing.
      segmentsByIndex: {},
      ledger: emptyLedger(),
      writeProgress: { current: 0, total },
      updatedAt: FieldValue.serverTimestamp(),
    });

    await getFunctions()
      .taskQueue(WRITE_SEGMENT_QUEUE)
      .enqueue({ jobId, segmentIndex: 0 });

    return { ok: true };
  },
);

type SegmentMap = Record<string, { index: number; text: string }>;

interface JobDoc {
  status: string;
  input: GenerationInput;
  blueprint?: Blueprint;
  chosenTitle?: string;
  segmentsByIndex?: SegmentMap;
  ledger?: StateLedger;
}

/** Sorted, deduped-by-index array view of the segment map. */
function orderedSegments(map: SegmentMap): { index: number; text: string }[] {
  const byIndex = new Map<number, { index: number; text: string }>();
  for (const seg of Object.values(map)) {
    if (seg && typeof seg.index === "number") byIndex.set(seg.index, seg);
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

/**
 * Write ONE segment, then chain to the next. Driven by Cloud Tasks so each
 * segment gets its own 300s budget. Idempotent by construction: segments are
 * stored in a map keyed by index, and a retry that finds its index already
 * present skips the (paid) Claude calls and just continues the chain.
 */
export const writeSegment = onTaskDispatched<{
  jobId: string;
  segmentIndex: number;
}>(
  {
    region: REGION,
    secrets: [anthropicKey],
    timeoutSeconds: 300,
    memory: "512MiB",
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 5 },
  },
  async (req) => {
    const { jobId, segmentIndex } = req.data;
    const jobRef = db.collection("jobs").doc(jobId);

    try {
      const snap = await jobRef.get();
      if (!snap.exists) return;

      const data = snap.data() as JobDoc;
      if (data.status !== "writing") return;

      const blueprint = data.blueprint;
      if (!blueprint) return;

      const total = blueprint.segments.length;
      const map = data.segmentsByIndex ?? {};

      // Idempotency guard: if this index already exists, skip generation
      // entirely and just continue the chain (protects against retries).
      if (!map[segmentIndex]) {
        const segmentBrief = blueprint.segments[segmentIndex];
        const storyState = data.ledger ?? emptyLedger();

        const anthropic = new Anthropic({ apiKey: anthropicKey.value() });

        // STAGE 3 — segment prose (plain text, no JSON).
        const text = await generateText(
          anthropic,
          MODELS.segment,
          3000,
          segmentPrompt.system,
          segmentPrompt.buildUser({
            storyPlan: blueprint,
            storyState,
            segmentBrief,
            segmentWordTarget: segmentBrief.wordTarget,
          }),
        );

        // STAGE 4 — state update. A ledger hiccup must not fail the job: retry
        // once (inside generateJson), else keep the previous ledger.
        let ledger: StateLedger = storyState;
        try {
          ledger = await generateJson<StateLedger>(
            anthropic,
            MODELS.state,
            2000,
            statePrompt.system,
            statePrompt.buildUser(storyState, text),
            StateLedgerSchema,
          );
        } catch {
          ledger = storyState;
        }

        // Write into the map at this index — overwrites on retry, never dupes.
        // The value always carries its own `index`.
        await jobRef.update({
          [`segmentsByIndex.${segmentIndex}`]: { index: segmentIndex, text },
          ledger,
          "writeProgress.current": segmentIndex + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Continue the chain.
      if (segmentIndex + 1 < total) {
        await getFunctions()
          .taskQueue(WRITE_SEGMENT_QUEUE)
          .enqueue({ jobId, segmentIndex: segmentIndex + 1 });
        return;
      }

      // Last segment — re-read the map and assemble the one canonical array.
      const fresh = (await jobRef.get()).data() as JobDoc;
      const allSegments = orderedSegments(fresh.segmentsByIndex ?? {});
      const wordCount = allSegments.reduce(
        (sum, s) => sum + countWords(s.text),
        0,
      );
      await jobRef.update({
        generation: {
          title: fresh.chosenTitle ?? "",
          titleOptions: blueprint.titleOptions,
          durationMinutes: fresh.input.durationMinutes,
          wordCount,
          segments: allSegments,
        },
        status: "done",
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Segment write failed.";
      await jobRef.set(
        {
          status: "error",
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

/**
 * Kick off the visual phase once the story is finished. Fast (no Claude):
 * flips the job into the visual lifecycle and enqueues the characters pass.
 */
export const generateVisuals = onCall<{ jobId: string }>(
  { region: REGION },
  async (request) => {
    const { jobId } = request.data;
    if (!jobId) {
      throw new HttpsError("invalid-argument", "Missing jobId.");
    }

    const jobRef = db.collection("jobs").doc(jobId);
    const snap = await jobRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const data = snap.data() as { status: string };
    if (data.status !== "done") {
      throw new HttpsError(
        "failed-precondition",
        "Story is not finished yet.",
      );
    }

    await jobRef.update({
      visualStatus: "characters",
      updatedAt: FieldValue.serverTimestamp(),
    });

    await getFunctions().taskQueue(GENERATE_CHARACTERS_QUEUE).enqueue({ jobId });

    return { ok: true };
  },
);

/**
 * Phase 1 — Characters. Derives the project style mood, writes one locked
 * reference prompt per character (identity injected verbatim downstream), then
 * hands off to the scene splitter. Idempotent: a retry that finds the reference
 * prompts already set skips straight to enqueuing scenes.
 */
export const generateCharacters = onTaskDispatched<{ jobId: string }>(
  {
    region: REGION,
    secrets: [anthropicKey],
    timeoutSeconds: 300,
    memory: "512MiB",
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 5 },
  },
  async (req) => {
    const { jobId } = req.data;
    const jobRef = db.collection("jobs").doc(jobId);

    try {
      const snap = await jobRef.get();
      if (!snap.exists) return;

      const data = snap.data() as {
        blueprint?: Blueprint;
        dna?: Dna;
        generation?: { characters?: { referencePrompt?: string }[] };
      };

      const blueprint = data.blueprint;
      if (!blueprint) return;
      const total = blueprint.segments.length;

      // Idempotency: characters already assembled? skip straight to scenes.
      const existing = data.generation?.characters;
      const alreadyDone =
        Array.isArray(existing) &&
        existing.length > 0 &&
        typeof existing[0]?.referencePrompt === "string" &&
        existing[0].referencePrompt.length > 0;

      if (!alreadyDone) {
        const anthropic = new Anthropic({ apiKey: anthropicKey.value() });

        // STYLE MOOD — one lighting line, reused by every visual section.
        const styleMood = (
          await generateText(
            anthropic,
            MODELS.styleMood,
            200,
            styleMoodPrompt.system,
            styleMoodPrompt.buildUser({
              genre: blueprint.storyBrief.genre,
              tone: data.dna?.tone ?? [],
            }),
          )
        ).trim();

        // CHARACTERS — one reference description per cast member.
        const ai = await generateJson<Characters>(
          anthropic,
          MODELS.characters,
          3000,
          charactersPrompt.system,
          charactersPrompt.buildUser({
            storyBrief: blueprint.storyBrief,
            characters: blueprint.characters.map((c) => ({
              name: c.name,
              role: c.role,
            })),
          }),
          CharactersSchema,
        );

        // Assemble the locked reference prompt per character (deterministic set).
        const characters = blueprint.characters.map((bc) => {
          const match = ai.characters.find((c) => c.name === bc.name);
          const identity = match?.identity ?? "";
          const baselineOutfit = match?.baselineOutfit ?? "";
          const referencePrompt = assemble.referencePrompt(
            identity,
            baselineOutfit,
            styleMood,
          );
          return { ...bc, identity, baselineOutfit, referencePrompt };
        });

        await jobRef.update({
          styleMood,
          "generation.characters": characters,
          visualStatus: "scenes",
          sceneProgress: { current: 0, total },
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await jobRef.update({
          visualStatus: "scenes",
          sceneProgress: { current: 0, total },
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await getFunctions()
        .taskQueue(SPLIT_SCENES_QUEUE)
        .enqueue({ jobId, segmentIndex: 0 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Character generation failed.";
      await jobRef.set(
        {
          visualStatus: "error",
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

interface AssembledScene {
  type: string;
  motionPriority: string;
  motion: string;
  narrationExcerpt: string;
  setting: string;
  action: string;
  present: string[];
  outfits: { name: string; outfit: string }[];
  imagePrompt: string;
}

interface SceneContext {
  storyBrief: object;
  cast: { name: string; role: string }[];
}

// Scenes are the largest JSON output in the pipeline (10-28+ per segment); give
// them generous headroom and split very dense segments so nothing truncates.
const SCENES_MAX_TOKENS = 8000;
const MAX_SCENES_PER_CALL = 16;

/**
 * One scene-splitter call. The doc's `{{targetScenes}}` placeholder is never
 * substituted, so we pass the real target in the user message — softly by
 * default, as a hard cap on the safety-valve retry to keep the payload small.
 */
async function callSceneSplitter(
  client: Anthropic,
  ctx: SceneContext,
  segmentText: string,
  wardrobe: object,
  targetScenes: number,
  hardCap: boolean,
): Promise<Scenes> {
  const user =
    scenesPrompt.buildUser({
      storyBrief: ctx.storyBrief,
      cast: ctx.cast,
      wardrobe,
      segmentText,
      targetScenes,
    }) +
    (hardCap
      ? `\n\nIMPORTANT: produce AT MOST ${targetScenes} scenes for this segment; do not exceed ${targetScenes}.`
      : `\n\nAim for roughly ${targetScenes} scenes for this segment.`);

  return generateJson<Scenes>(
    client,
    MODELS.scenes,
    SCENES_MAX_TOKENS,
    scenesPrompt.system,
    user,
    ScenesSchema,
  );
}

/** Split a chunk of narration into scenes, with a cap-retry safety valve. */
async function splitChunk(
  client: Anthropic,
  ctx: SceneContext,
  segmentText: string,
  wardrobe: object,
  targetScenes: number,
): Promise<Scenes> {
  try {
    return await callSceneSplitter(client, ctx, segmentText, wardrobe, targetScenes, false);
  } catch {
    // The JSON still failed (likely truncated). Re-ask for fewer scenes to keep
    // the response under the token ceiling, rather than failing the whole job.
    return callSceneSplitter(client, ctx, segmentText, wardrobe, targetScenes, true);
  }
}

/** Split text near the midpoint, preferring a paragraph or sentence boundary. */
function splitTextInHalf(text: string): [string, string] {
  const mid = Math.floor(text.length / 2);
  let cut = text.indexOf("\n\n", mid);
  if (cut === -1) {
    const dot = text.indexOf(". ", mid);
    cut = dot === -1 ? mid : dot + 1;
  }
  return [text.slice(0, cut).trim(), text.slice(cut).trim()];
}

/**
 * All scenes for one segment. Very dense segments (high targetScenes) are split
 * into two narration halves so neither response risks truncation; wardrobe is
 * threaded from the first half into the second.
 */
async function splitSegmentScenes(
  client: Anthropic,
  ctx: SceneContext,
  segmentText: string,
  wardrobe: object,
  targetScenes: number,
): Promise<Scenes> {
  if (targetScenes > MAX_SCENES_PER_CALL && segmentText.length > 400) {
    const [first, second] = splitTextInHalf(segmentText);
    const half = Math.ceil(targetScenes / 2);
    const a = await splitChunk(client, ctx, first, wardrobe, half);
    const b = await splitChunk(client, ctx, second, a.wardrobe, half);
    return { scenes: [...a.scenes, ...b.scenes], wardrobe: b.wardrobe };
  }
  return splitChunk(client, ctx, segmentText, wardrobe, targetScenes);
}

/**
 * Phase 2 — Scene splitter. One call per segment: turns that segment's
 * narration into assembled scene image prompts (identity injected verbatim),
 * threading wardrobe state across segments. Idempotent: a retry that finds this
 * segment's scenes already written skips generation and continues the chain. On
 * the last segment it flattens all scenes into generation.scenes with a running
 * global index, then hands off to the hooks pass.
 */
export const splitScenes = onTaskDispatched<{
  jobId: string;
  segmentIndex: number;
}>(
  {
    region: REGION,
    secrets: [anthropicKey],
    timeoutSeconds: 300,
    memory: "512MiB",
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 5 },
  },
  async (req) => {
    const { jobId, segmentIndex } = req.data;
    const jobRef = db.collection("jobs").doc(jobId);

    try {
      const snap = await jobRef.get();
      if (!snap.exists) return;

      const data = snap.data() as {
        input: GenerationInput;
        blueprint?: Blueprint;
        styleMood?: string;
        wardrobe?: Record<string, { currentOutfit: string; context: string }>;
        scenesBySegment?: Record<string, AssembledScene[]>;
        generation?: {
          segments?: { index: number; text: string }[];
          characters?: { name: string; role: string; identity: string }[];
        };
      };

      const blueprint = data.blueprint;
      if (!blueprint) return;
      const total = blueprint.segments.length;
      const map = data.scenesBySegment ?? {};

      // Idempotency: this segment's scenes already exist? skip generation.
      if (!map[segmentIndex]) {
        const characters = data.generation?.characters ?? [];
        const segments = [...(data.generation?.segments ?? [])].sort(
          (a, b) => a.index - b.index,
        );
        const segmentText = segments[segmentIndex]?.text ?? "";
        const styleMood = data.styleMood ?? "";
        const wardrobe = data.wardrobe ?? {};
        const targetScenes = Math.max(
          1,
          Math.round(countWords(segmentText) / wordsPerScene(data.input.density)),
        );

        const anthropic = new Anthropic({ apiKey: anthropicKey.value() });

        const parsed = await splitSegmentScenes(
          anthropic,
          {
            storyBrief: blueprint.storyBrief,
            cast: characters.map((c) => ({ name: c.name, role: c.role })),
          },
          segmentText,
          wardrobe,
          targetScenes,
        );

        const assembled: AssembledScene[] = parsed.scenes.map((scene) => ({
          type: scene.type,
          motionPriority: scene.motionPriority,
          // Motion only matters for 'animate' scenes (feeds image-to-video).
          motion: scene.motionPriority === "animate" ? scene.motion : "",
          narrationExcerpt: scene.narrationExcerpt,
          setting: scene.setting,
          action: scene.action,
          present: scene.present,
          outfits: scene.outfits,
          imagePrompt: assemble.scenePrompt(scene, characters, styleMood),
        }));

        await jobRef.update({
          [`scenesBySegment.${segmentIndex}`]: assembled,
          wardrobe: parsed.wardrobe,
          "sceneProgress.current": segmentIndex + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Continue the chain.
      if (segmentIndex + 1 < total) {
        await getFunctions()
          .taskQueue(SPLIT_SCENES_QUEUE)
          .enqueue({ jobId, segmentIndex: segmentIndex + 1 });
        return;
      }

      // Last segment — flatten in segment order with a running global index.
      const fresh = (await jobRef.get()).data() as {
        scenesBySegment?: Record<string, AssembledScene[]>;
      };
      const freshMap = fresh.scenesBySegment ?? {};
      const allScenes: (AssembledScene & { index: number })[] = [];
      let globalIndex = 0;
      for (let i = 0; i < total; i++) {
        const segScenes = freshMap[String(i)] ?? [];
        for (const scene of segScenes) {
          allScenes.push({ ...scene, index: globalIndex++ });
        }
      }

      await jobRef.update({
        "generation.scenes": allScenes,
        visualStatus: "hooks",
        updatedAt: FieldValue.serverTimestamp(),
      });

      await getFunctions().taskQueue(GENERATE_HOOKS_QUEUE).enqueue({ jobId });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Scene splitting failed.";
      await jobRef.set(
        {
          visualStatus: "error",
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

// Shared options for the closing visual passes.
const VISUAL_TASK_OPTS = {
  region: REGION,
  secrets: [anthropicKey],
  timeoutSeconds: 300,
  memory: "512MiB" as const,
  retryConfig: { maxAttempts: 3, minBackoffSeconds: 5 },
};

/** Cast members carrying both the keying fields and the verbatim identity. */
interface VisualCharacter {
  name: string;
  role: string;
  identity: string;
}

/**
 * Phase 3 — Hooks (cold open). Designs the intro montage as one coherent
 * sequence, assembles each shot's image prompt (Style Block B), keeps motion
 * separate, then hands off to the thumbnail. Idempotent: skips if hooks exist.
 */
export const generateHooks = onTaskDispatched<{ jobId: string }>(
  VISUAL_TASK_OPTS,
  async (req) => {
    const { jobId } = req.data;
    const jobRef = db.collection("jobs").doc(jobId);

    try {
      const snap = await jobRef.get();
      if (!snap.exists) return;

      const data = snap.data() as {
        blueprint?: Blueprint;
        styleMood?: string;
        generation?: {
          characters?: VisualCharacter[];
          hooks?: { shots?: unknown[] };
          segments?: { index: number; text: string }[];
        };
      };

      const blueprint = data.blueprint;
      if (!blueprint) return;
      const characters = data.generation?.characters ?? [];
      const styleMood = data.styleMood ?? "";

      const existing = data.generation?.hooks;
      const alreadyDone = Array.isArray(existing?.shots) && existing.shots.length > 0;

      if (!alreadyDone) {
        // The cold open is written from the FINISHED story — feed the narration.
        const storyText = [...(data.generation?.segments ?? [])]
          .sort((a, b) => a.index - b.index)
          .map((s) => s.text)
          .join("\n\n");

        const anthropic = new Anthropic({ apiKey: anthropicKey.value() });

        const parsed = await generateJson<Hooks>(
          anthropic,
          MODELS.hooks,
          2000,
          hooksPrompt.system,
          hooksPrompt.buildUser({
            storyBrief: blueprint.storyBrief,
            logline: blueprint.logline,
            cast: characters.map((c) => ({ name: c.name, role: c.role })),
            storyText,
          }),
          HooksSchema,
        );

        const shots = parsed.shots.map((s) => ({
          index: s.index,
          anchor: s.anchor,
          shot: s.shot,
          imagePrompt: assemble.hookPrompt(s, characters, styleMood),
          // Motion stays separate — it feeds the image-to-video step.
          motion: s.motion,
          present: s.present,
          outfits: s.outfits,
        }));

        await jobRef.update({
          "generation.hooks": {
            monologue: parsed.monologue,
            suggestedShotCount: parsed.suggestedShotCount,
            shots,
          },
          visualStatus: "thumbnail",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await jobRef.update({
          visualStatus: "thumbnail",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await getFunctions()
        .taskQueue(GENERATE_THUMBNAIL_QUEUE)
        .enqueue({ jobId });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Hook generation failed.";
      await jobRef.set(
        {
          visualStatus: "error",
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

interface ThumbnailVariant {
  prompt: string;
  featured: string[];
  createdAt: number;
}

/**
 * Phase 4 — Thumbnail. One high-CTR cover prompt, assembled with Camera-Realism
 * (the only place it's used). Idempotent in the normal pipeline: skips if the
 * thumbnail prompt exists. `force` (from regenerateThumbnail) re-rolls it even
 * when one exists, keeps the 3 most recent as thumbnailVariants, and does NOT
 * touch visualStatus or chain to metadata — it's a thumbnail-only regenerate.
 */
export const generateThumbnail = onTaskDispatched<{
  jobId: string;
  force?: boolean;
}>(VISUAL_TASK_OPTS, async (req) => {
  const { jobId, force } = req.data;
  const jobRef = db.collection("jobs").doc(jobId);

  try {
    const snap = await jobRef.get();
    if (!snap.exists) return;

    const data = snap.data() as {
      blueprint?: Blueprint;
      styleMood?: string;
      generation?: {
        characters?: VisualCharacter[];
        thumbnailPrompt?: string;
        thumbnailVariants?: ThumbnailVariant[];
      };
    };

    const blueprint = data.blueprint;
    if (!blueprint) return;
    const characters = data.generation?.characters ?? [];
    const styleMood = data.styleMood ?? "";

    const existing = data.generation?.thumbnailPrompt;
    const alreadyDone = typeof existing === "string" && existing.length > 0;

    // Regenerate when forced (bypass idempotency); otherwise only on first run.
    if (force || !alreadyDone) {
      const anthropic = new Anthropic({ apiKey: anthropicKey.value() });

      const parsed = await generateJson<Thumbnail>(
        anthropic,
        MODELS.thumbnail,
        2000,
        thumbnailPrompt.system,
        thumbnailPrompt.buildUser({
          storyBrief: blueprint.storyBrief,
          logline: blueprint.logline,
          cast: characters.map((c) => ({ name: c.name, role: c.role })),
        }),
        ThumbnailSchema,
      );

      const prompt = assemble.thumbnailPrompt(parsed, characters, styleMood);
      // Keep the 3 most recent prompts, newest first; thumbnailPrompt = newest.
      const variant: ThumbnailVariant = {
        prompt,
        featured: parsed.featured ?? [],
        createdAt: Date.now(),
      };
      const variants = [variant, ...(data.generation?.thumbnailVariants ?? [])].slice(0, 3);

      const update: Record<string, unknown> = {
        "generation.thumbnailPrompt": prompt,
        "generation.thumbnailVariants": variants,
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Forced regenerate is thumbnail-only: clear any prior regen error, and do
      // NOT advance the visual phase. Normal flow advances to metadata.
      if (force) update.thumbnailError = FieldValue.delete();
      else update.visualStatus = "metadata";
      await jobRef.update(update);
    } else {
      await jobRef.update({
        visualStatus: "metadata",
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Only chain to metadata in the normal pipeline flow — a forced regenerate
    // must NOT re-run metadata (or characters/scenes/hooks).
    if (!force) {
      await getFunctions().taskQueue(GENERATE_METADATA_QUEUE).enqueue({ jobId });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Thumbnail generation failed.";
    // A forced regenerate failure surfaces on its own field so it doesn't flip
    // the whole visual phase (which is already 'done') to error.
    if (force) {
      await jobRef.set(
        { thumbnailError: message, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    } else {
      await jobRef.set(
        {
          visualStatus: "error",
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  }
});

/**
 * Re-roll ONLY the thumbnail on a finished story — no other visual pass runs.
 * Fast (no Claude): enqueues generateThumbnail with force so it regenerates even
 * though a thumbnail already exists. The new prompt (and the variants list) land
 * on the job doc the client is already subscribed to.
 */
export const regenerateThumbnail = onCall<{ jobId: string }>(
  { region: REGION },
  async (request) => {
    const { jobId } = request.data;
    if (!jobId) {
      throw new HttpsError("invalid-argument", "Missing jobId.");
    }

    const jobRef = db.collection("jobs").doc(jobId);
    const snap = await jobRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Job not found.");
    }

    await getFunctions()
      .taskQueue(GENERATE_THUMBNAIL_QUEUE)
      .enqueue({ jobId, force: true });

    return { ok: true };
  },
);

/**
 * Phase 5 — Metadata. Description + tags + hashtags consistent with the chosen
 * title (fed the ledger summary, not the full story). Terminal pass: sets
 * visualStatus 'done'. Idempotent: skips if the description exists.
 */
export const generateMetadata = onTaskDispatched<{ jobId: string }>(
  VISUAL_TASK_OPTS,
  async (req) => {
    const { jobId } = req.data;
    const jobRef = db.collection("jobs").doc(jobId);

    try {
      const snap = await jobRef.get();
      if (!snap.exists) return;

      const data = snap.data() as {
        blueprint?: Blueprint;
        chosenTitle?: string;
        ledger?: StateLedger;
        generation?: { description?: string };
      };

      const blueprint = data.blueprint;
      if (!blueprint) return;

      const existing = data.generation?.description;
      const alreadyDone = typeof existing === "string" && existing.length > 0;

      if (!alreadyDone) {
        const anthropic = new Anthropic({ apiKey: anthropicKey.value() });

        const parsed = await generateJson<Metadata>(
          anthropic,
          MODELS.metadata,
          2000,
          metadataPrompt.system,
          metadataPrompt.buildUser({
            chosenTitle: data.chosenTitle ?? "",
            storyBrief: blueprint.storyBrief,
            logline: blueprint.logline,
            storySummary: data.ledger?.summarySoFar ?? "",
          }),
          MetadataSchema,
        );

        await jobRef.update({
          "generation.description": parsed.description,
          "generation.tags": parsed.tags,
          "generation.hashtags": parsed.hashtags,
          visualStatus: "done",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await jobRef.update({
          visualStatus: "done",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Metadata generation failed.";
      await jobRef.set(
        {
          visualStatus: "error",
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

// ── Voice / TTS wave ────────────────────────────────────────────────────────
//
// An explicit "Generate audio" step run after a story is `done` (independent of
// visuals — audio only needs the finished script). Gemini TTS returns raw PCM;
// we wrap it in WAV (lib/audio). Delivery is a fixed, plain audiobook direction
// (lib/voice) — identical for every story, no per-story tone adaptation.

// Gemini TTS quality degrades over long single-request outputs (3.1 fades in
// volume; 2.5 loses fidelity) — a general long-output defect. So we NEVER send a
// whole segment in one call: we split it into short sub-chunks that each stay in
// the model's "fresh" zone, synth each separately, and concatenate the PCM with a
// tiny silence pad. The chunk length is a single shared knob (CHUNK_TARGET_SECONDS
// in lib/voice) converted here to a word budget at an average speaking pace.
const CHUNK_WORDS_PER_SEC = 2.5; // average narration pace, for sizing sub-chunks
const CHUNK_TARGET_WORDS = Math.max(
  1,
  Math.round(CHUNK_TARGET_SECONDS * CHUNK_WORDS_PER_SEC),
); // ~150 words per 60s
const SILENCE_PAD_MS = 100; // minimal gap between sub-chunks so joins don't click
// Upper-bound speaking rate (~200 wpm) used only to flag grossly-truncated audio.
const WORDS_PER_SEC_FAST = 3.3;
// Per-chunk resilience: the TTS preview occasionally throws a transient 400, and
// the API is rate-limited (429), so each sub-chunk gets a few tries with backoff.
const CHUNK_MAX_TRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Stay under the model's RPM ceiling (10/min for gemini-3.1-flash-tts). TTS calls
// often return faster than the audio is long, so sequential sub-chunks can burst
// past the limit; we space consecutive requests apart. 60s / ~9 ≈ 7s → ~8.5/min.
const MIN_TTS_SPACING_MS = 7000;
// Per-instance timestamp of the last TTS request start. Sub-chunks within a
// segment run sequentially in one invocation, so this paces them; across
// segments (separate task invocations) the natural handoff spacing adds to it.
let lastTtsCallAt = 0;

/** Wait so consecutive TTS requests start >= MIN_TTS_SPACING_MS apart (RPM guard). */
async function throttleTts(): Promise<void> {
  const wait = MIN_TTS_SPACING_MS - (Date.now() - lastTtsCallAt);
  if (wait > 0) await sleep(wait);
  lastTtsCallAt = Date.now();
}

/** Parse a Gemini RetryInfo delay (e.g. "17s") from an error body, in seconds. */
function parseRetryDelaySec(error: unknown): number | null {
  const msg = error instanceof Error ? error.message : String(error);
  const m = msg.match(/retryDelay["']?\s*[:=]\s*["']?(\d+(?:\.\d+)?)s/i);
  return m ? Number(m[1]) : null;
}

/**
 * Thrown when the DAILY TTS quota (RPD) is exhausted — it won't recover until the
 * quota resets (midnight Pacific), so we must not burn retries or hard-error the
 * job. synthSegment/synthHook catch this and PAUSE the job (progress preserved).
 */
class DailyQuotaError extends Error {
  constructor(message = "daily TTS quota reached — resume after reset") {
    super(message);
    this.name = "DailyQuotaError";
  }
}

/**
 * Classify a thrown TTS error's rate-limit kind from its message/body:
 *  - "daily": a per-day (RPD) quota exhaustion — pause the job.
 *  - "transient": a per-minute (RPM/TPM) 429 — safe to retry with backoff.
 *  - "none": not a 429.
 * Daily is detected by a per-day quota id/metric or a long RetryInfo delay (a
 * per-minute limit retries in seconds; a daily one waits until the reset).
 */
function classify429(error: unknown): "daily" | "transient" | "none" {
  const msg = error instanceof Error ? error.message : String(error);
  const is429 = /RESOURCE_EXHAUSTED|"code":\s*429/.test(msg);
  if (!is429) return "none";
  const perDay = /per[\s_-]?day|requests?perday|perdayper/i.test(msg);
  const retrySec = parseRetryDelaySec(error);
  const longRetry = retrySec != null && retrySec > 120;
  return perDay || longRetry ? "daily" : "transient";
}

/**
 * Pause the audio job because the daily TTS quota is exhausted. Progress is
 * preserved (audioSegments/audioProgress untouched); no further TTS tasks are
 * enqueued. The job resumes via resumeAudio once the quota resets.
 */
async function pauseAudioForQuota(jobRef: DocumentReference): Promise<void> {
  await jobRef.set(
    {
      audioStatus: "paused",
      error: "daily TTS quota reached — resume after reset",
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/** Seconds of audio in a raw 16-bit mono PCM buffer at the configured rate. */
function pcmDurationSec(pcm: Buffer): number {
  return pcm.length / (VOICE_CONFIG.sampleRate * 2);
}

/** ~SILENCE_PAD_MS of silence (zeroed 16-bit mono PCM) to seam sub-chunks. */
function silencePad(): Buffer {
  const samples = Math.round((SILENCE_PAD_MS / 1000) * VOICE_CONFIG.sampleRate);
  return Buffer.alloc(samples * 2); // 2 bytes/sample, zeros = silence
}

// Fictional narration (thriller/horror menace, threat, crime language) trips
// content-safety false positives that return a 200 with NO audio. Set every
// adjustable filter to the most permissive threshold — appropriate for this
// fictional-narration use case — so legitimate story text isn't silently blocked.
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }));

/** One Gemini TTS call on a given model → raw PCM (16-bit mono @ sampleRate). */
async function synthPcm(
  ai: GoogleGenAI,
  prompt: string,
  model: string,
): Promise<{ pcm: Buffer; finishReason: string }> {
  // Space requests apart so we stay under the per-minute RPM ceiling.
  await throttleTts();
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseModalities: [Modality.AUDIO],
      safetySettings: SAFETY_SETTINGS,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: VOICE_CONFIG.voice },
        },
      },
    },
  });
  const candidate = response.candidates?.[0];
  const finishReason = String(candidate?.finishReason ?? "");
  const blockReason = response.promptFeedback?.blockReason;
  const data = candidate?.content?.parts?.[0]?.inlineData?.data;
  if (!data) {
    // A blocked/empty result (200 with no audio) — surface why so synthChunk can
    // retry and, if it persists, log the offending passage.
    const why = blockReason
      ? `blocked: ${blockReason}`
      : finishReason && finishReason !== "STOP"
        ? `finishReason=${finishReason}`
        : "empty response (no audio)";
    throw new Error(`Gemini TTS returned no audio data (${why}).`);
  }
  return { pcm: Buffer.from(data, "base64"), finishReason };
}

/**
 * Split text on sentence boundaries, grouping sentences into chunks of at most
 * `maxWords` (never exceeding the target). A lone sentence longer than the target
 * becomes its own chunk (we don't split mid-sentence).
 */
function chunkBySentence(text: string, maxWords: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  let currentWords = 0;
  for (const sentence of sentences) {
    const words = countWords(sentence);
    if (current && currentWords + words > maxWords) {
      chunks.push(current.trim());
      current = "";
      currentWords = 0;
    }
    current += sentence;
    currentWords += words;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** Model chain: try the primary, then the stable fallback for stubborn chunks. */
const TTS_MODELS: string[] = [
  ...new Set<string>([VOICE_CONFIG.model, VOICE_CONFIG.fallbackModel]),
];

/**
 * Try one model for a sub-chunk: retry (with backoff) on a suspect result or a
 * thrown call error. Returns audio (even a merely-suspect best-effort take) or
 * `null` if the model produced NO audio after all tries. DailyQuotaError bubbles
 * up immediately (pause the job); the last error reason is returned for logging.
 */
async function synthChunkOnModel(
  ai: GoogleGenAI,
  style: string,
  chunk: string,
  model: string,
  words: number,
  minExpectedSec: number,
): Promise<{ pcm: Buffer | null; reason: string }> {
  let best: Buffer | null = null;
  let reason = "";
  for (let attempt = 1; attempt <= CHUNK_MAX_TRIES; attempt++) {
    let backoffMs = attempt * 3000; // default for suspect-result retries
    try {
      const { pcm, finishReason } = await synthPcm(ai, `${style}\n\n${chunk}`, model);
      best = pcm;
      const durSec = pcmDurationSec(pcm);
      const truncated = finishReason !== "" && finishReason !== "STOP";
      const tooShort = words >= 8 && durSec < minExpectedSec;
      if (!truncated && !tooShort) return { pcm, reason: "" };
      console.warn(
        `TTS sub-chunk suspect (model=${model}, attempt ${attempt}/${CHUNK_MAX_TRIES}, ` +
          `words=${words}, dur=${durSec.toFixed(1)}s, finishReason=${finishReason || "none"}).`,
      );
    } catch (error) {
      // Daily quota (RPD) won't recover until reset — bail immediately (no
      // retries) so the caller can pause the job instead of burning attempts.
      if (classify429(error) === "daily") throw new DailyQuotaError();
      reason = error instanceof Error ? error.message : String(error);
      // Per-minute (RPM) 429s tell us exactly how long to wait — honor it (+1s
      // buffer) instead of a fixed backoff.
      const retrySec = parseRetryDelaySec(error);
      if (retrySec != null) backoffMs = Math.round((retrySec + 1) * 1000);
      console.warn(
        `TTS sub-chunk call failed (model=${model}, attempt ${attempt}/${CHUNK_MAX_TRIES}, ` +
          `words=${words}, backoff=${(backoffMs / 1000).toFixed(0)}s): ${reason.slice(0, 160)}`,
      );
    }
    if (attempt < CHUNK_MAX_TRIES) await sleep(backoffMs);
  }
  if (best) {
    console.error(
      `TTS sub-chunk degraded after ${CHUNK_MAX_TRIES} tries (model=${model}, ` +
        `words=${words}); using best-effort audio.`,
    );
    return { pcm: best, reason: "" };
  }
  return { pcm: null, reason };
}

/**
 * Synthesise ONE short sub-chunk to PCM, resilient to bad results and thrown
 * errors. Retries per model, and if the primary model produces no audio at all
 * (e.g. the 3.1 preview's intermittent spurious 400), falls back to the stable
 * model for this chunk. If NO model produces audio, logs the exact offending
 * passage and rethrows so the SEGMENT FAILS — never ship a silent gap (a segment
 * is only written complete when every sub-chunk produced audio).
 */
async function synthChunk(
  ai: GoogleGenAI,
  style: string,
  chunk: string,
): Promise<Buffer> {
  const words = countWords(chunk);
  const minExpectedSec = (words / WORDS_PER_SEC_FAST) * 0.5;
  let reason = "";
  for (let mi = 0; mi < TTS_MODELS.length; mi++) {
    const model = TTS_MODELS[mi];
    const res = await synthChunkOnModel(
      ai,
      style,
      chunk,
      model,
      words,
      minExpectedSec,
    );
    if (res.pcm) return res.pcm;
    reason = res.reason;
    if (mi < TTS_MODELS.length - 1) {
      console.warn(
        `TTS sub-chunk got no audio on ${model} — falling back to ` +
          `${TTS_MODELS[mi + 1]} (words=${words}, reason=${reason.slice(0, 120)}).`,
      );
    }
  }
  // No audio on any model. Do NOT skip/return silence — that would ship a gap and
  // let the segment be written complete. Log the EXACT passage and fail loudly.
  console.error(
    `TTS sub-chunk produced NO AUDIO on all models (words=${words}, ` +
      `reason=${reason}). The passage was not voiced — failing the segment. ` +
      `Chunk text: ${JSON.stringify(chunk)}`,
  );
  throw new Error(
    `Sub-chunk produced no audio (${reason}). Passage: "${chunk.slice(0, 120)}` +
      `${chunk.length > 120 ? "…" : ""}"`,
  );
}

/**
 * Synthesise a piece of narration to PCM by sub-chunking. The whole text is
 * split into short sentence-grouped chunks (each within the model's good zone),
 * synthesised separately with the same voice + style prompt, and concatenated in
 * order with a small silence pad so quality/volume stay steady end to end. The
 * SAME chunking (CHUNK_TARGET_WORDS) is used by both segment and hook synthesis.
 */
async function synthText(
  ai: GoogleGenAI,
  style: string,
  text: string,
): Promise<Buffer> {
  const chunks = chunkBySentence(text, CHUNK_TARGET_WORDS);
  const pad = silencePad();
  const parts: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) parts.push(pad);
    parts.push(await synthChunk(ai, style, chunks[i]));
  }
  return Buffer.concat(parts);
}

/**
 * Kick off the voice/TTS wave on a finished story. Fast (no synthesis): flips
 * the job into the audio lifecycle and enqueues prepareAudio.
 *
 * `force` re-generates from scratch: without it the per-segment idempotency
 * guard would skip every already-synthesised segment, so a plain re-trigger
 * only ever RESUMES. Pass force to re-synthesise after swapping the model or
 * tuning the craft direction (prepareAudio always rewrites the fixed audioStyle
 * on the next run, so the new craft takes effect).
 */
export const generateAudio = onCall<{ jobId: string; force?: boolean }>(
  { region: REGION },
  async (request) => {
    const { jobId, force } = request.data;
    if (!jobId) {
      throw new HttpsError("invalid-argument", "Missing jobId.");
    }

    const jobRef = db.collection("jobs").doc(jobId);
    const snap = await jobRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const data = snap.data() as { status: string };
    if (data.status !== "done") {
      throw new HttpsError("failed-precondition", "Story is not finished yet.");
    }

    const update: Record<string, unknown> = {
      audioStatus: "styling",
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (force) {
      // Clear prior audio so synthesis re-runs (prepareAudio resets audioStyle).
      update.audioSegments = {};
      update.hookAudioUrl = FieldValue.delete();
      update.fullAudioUrl = FieldValue.delete();
    }
    await jobRef.update(update);

    await getFunctions().taskQueue(PREPARE_AUDIO_QUEUE).enqueue({ jobId });

    return { ok: true };
  },
);

/**
 * Set the fixed delivery direction and hand off to per-segment synthesis. The
 * craft is identical for every story (plain, audiobook-style — no per-story
 * emotional-tone adaptation), so this is a fast, no-Claude step; it just records
 * audioStyle and enters the synthesis phase. Resetting progress to 0 is correct
 * even on a re-trigger, since prepareAudio only runs once at the start of a
 * generateAudio call, before any segment synth.
 */
export const prepareAudio = onTaskDispatched<{ jobId: string }>(
  {
    region: REGION,
    timeoutSeconds: 60,
    memory: "512MiB",
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 5 },
  },
  async (req) => {
    const { jobId } = req.data;
    const jobRef = db.collection("jobs").doc(jobId);

    try {
      const snap = await jobRef.get();
      if (!snap.exists) return;

      const data = snap.data() as {
        generation?: { segments?: { index: number; text: string }[] };
      };

      const total = data.generation?.segments?.length ?? 0;

      await jobRef.update({
        // Fixed craft, same for every story — no genre/tone adaptation.
        audioStyle: { narration: NARRATION_CRAFT, hook: HOOK_CRAFT },
        audioStatus: "audio",
        audioProgress: { current: 0, total },
        updatedAt: FieldValue.serverTimestamp(),
      });

      await getFunctions()
        .taskQueue(SYNTH_SEGMENT_QUEUE)
        .enqueue({ jobId, segmentIndex: 0 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Audio styling failed.";
      await jobRef.set(
        {
          audioStatus: "error",
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

/**
 * Synthesise ONE narration segment to a WAV in Storage, then chain to the next.
 * Idempotent by construction: URLs are stored in a map keyed by index, so a
 * retry that finds its index already present skips the (paid) TTS call and just
 * continues the chain. After the last segment, hands off to the hook pass.
 */
export const synthSegment = onTaskDispatched<{
  jobId: string;
  segmentIndex: number;
}>(
  {
    region: REGION,
    secrets: [geminiKey],
    timeoutSeconds: 300,
    memory: "512MiB",
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 5 },
  },
  async (req) => {
    const { jobId, segmentIndex } = req.data;
    const jobRef = db.collection("jobs").doc(jobId);

    try {
      const snap = await jobRef.get();
      if (!snap.exists) return;

      const data = snap.data() as {
        audioStyle?: { narration: string; hook: string };
        audioSegments?: Record<string, string>;
        generation?: { segments?: { index: number; text: string }[] };
      };

      const segments = [...(data.generation?.segments ?? [])].sort(
        (a, b) => a.index - b.index,
      );
      const total = segments.length;
      const existing = data.audioSegments ?? {};

      // Idempotency guard: this segment's audio already exists? skip synthesis.
      if (!existing[segmentIndex]) {
        const narrationStyle = data.audioStyle?.narration ?? NARRATION_CRAFT;
        const text = segments[segmentIndex]?.text ?? "";

        const ai = new GoogleGenAI({ apiKey: geminiKey.value() });
        const pcm = await synthText(ai, narrationStyle, text);
        const wav = pcmToWav(pcm, VOICE_CONFIG.sampleRate);
        const url = await uploadAudio(jobId, `segment-${segmentIndex}`, wav);

        // Deterministic write — overwrites the same key on retry, never dupes.
        await jobRef.update({
          [`audioSegments.${segmentIndex}`]: url,
          "audioProgress.current": segmentIndex + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // Continue the chain.
      if (segmentIndex + 1 < total) {
        await getFunctions()
          .taskQueue(SYNTH_SEGMENT_QUEUE)
          .enqueue({ jobId, segmentIndex: segmentIndex + 1 });
        return;
      }

      // Last segment — hand off to the cold-open hook synthesis.
      await jobRef.update({
        audioStatus: "hook",
        updatedAt: FieldValue.serverTimestamp(),
      });
      await getFunctions().taskQueue(SYNTH_HOOK_QUEUE).enqueue({ jobId });
    } catch (error) {
      // Daily quota reached: pause (keep progress), don't error, don't chain on.
      if (error instanceof DailyQuotaError) {
        await pauseAudioForQuota(jobRef);
        return;
      }
      const message =
        error instanceof Error ? error.message : "Segment synthesis failed.";
      await jobRef.set(
        {
          audioStatus: "error",
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

/**
 * Synthesise the cold-open HOOK — the separately-voiced monologue that plays
 * before the narration (a distinct file, never stitched into the story). Uses
 * the hook craft (a touch more energy) and the same sub-chunked TTS. Idempotent:
 * skips if hookAudioUrl exists. If the hooks pass hasn't produced a monologue
 * yet, skips hook audio gracefully. Either way, hands off to the stitch pass.
 */
export const synthHook = onTaskDispatched<{ jobId: string }>(
  {
    region: REGION,
    secrets: [geminiKey],
    timeoutSeconds: 300,
    memory: "512MiB",
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 5 },
  },
  async (req) => {
    const { jobId } = req.data;
    const jobRef = db.collection("jobs").doc(jobId);

    try {
      const snap = await jobRef.get();
      if (!snap.exists) return;

      const data = snap.data() as {
        audioStyle?: { narration: string; hook: string };
        hookAudioUrl?: string;
        generation?: { hooks?: { monologue?: string } };
      };

      // Idempotency: hook already synthesised → straight to stitch.
      if (!data.hookAudioUrl) {
        const monologue = data.generation?.hooks?.monologue;
        if (monologue && monologue.trim()) {
          const hookStyle = data.audioStyle?.hook ?? HOOK_CRAFT;
          const ai = new GoogleGenAI({ apiKey: geminiKey.value() });
          const pcm = await synthText(ai, hookStyle, monologue);
          const wav = pcmToWav(pcm, VOICE_CONFIG.sampleRate);
          const url = await uploadAudio(jobId, "hook", wav);
          await jobRef.update({
            hookAudioUrl: url,
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          // Hooks pass hasn't produced a monologue — skip hook audio gracefully.
          console.warn(
            `synthHook: no hook monologue for job ${jobId}; skipping hook audio.`,
          );
        }
      }

      await jobRef.update({
        audioStatus: "stitching",
        updatedAt: FieldValue.serverTimestamp(),
      });
      await getFunctions().taskQueue(STITCH_AUDIO_QUEUE).enqueue({ jobId });
    } catch (error) {
      // Daily quota reached: pause (keep progress), don't error, don't chain on.
      if (error instanceof DailyQuotaError) {
        await pauseAudioForQuota(jobRef);
        return;
      }
      const message =
        error instanceof Error ? error.message : "Hook synthesis failed.";
      await jobRef.set(
        {
          audioStatus: "error",
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

/**
 * Stitch all narration segments into one full-story WAV. Fetches each segment's
 * WAV in index order and concatenates them (the cold-open hook is deliberately
 * NOT included — it stays a separate file). Terminal pass: sets audioStatus
 * 'done'. Re-running just overwrites the full-story file.
 */
export const stitchAudio = onTaskDispatched<{ jobId: string }>(
  {
    region: REGION,
    timeoutSeconds: 300,
    memory: "512MiB",
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 5 },
  },
  async (req) => {
    const { jobId } = req.data;
    const jobRef = db.collection("jobs").doc(jobId);

    try {
      const snap = await jobRef.get();
      if (!snap.exists) return;

      const data = snap.data() as { audioSegments?: Record<string, string> };
      const segments = data.audioSegments ?? {};

      // Segment URLs in index order (the hook is excluded by construction).
      const urls = Object.keys(segments)
        .map(Number)
        .sort((a, b) => a - b)
        .map((i) => segments[String(i)]);

      const wavs: Buffer[] = [];
      for (const url of urls) {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(
            `Failed to fetch segment audio for stitch (HTTP ${res.status}).`,
          );
        }
        wavs.push(Buffer.from(await res.arrayBuffer()));
      }

      const stitched = concatWav(wavs);
      const fullUrl = await uploadAudio(jobId, "full-story", stitched);

      await jobRef.update({
        fullAudioUrl: fullUrl,
        audioStatus: "done",
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Audio stitching failed.";
      await jobRef.set(
        {
          audioStatus: "error",
          error: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
  },
);

/**
 * Resume a job paused by the daily TTS quota. Fast (no synthesis): finds the
 * first still-missing segment and re-enters the chain there — the per-segment
 * idempotency guard skips the ones already synthesised, so nothing is redone. If
 * every segment is already present, resumes at the hook stage instead.
 */
export const resumeAudio = onCall<{ jobId: string }>(
  { region: REGION },
  async (request) => {
    const { jobId } = request.data;
    if (!jobId) {
      throw new HttpsError("invalid-argument", "Missing jobId.");
    }

    const jobRef = db.collection("jobs").doc(jobId);
    const snap = await jobRef.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "Job not found.");
    }

    const data = snap.data() as {
      audioStatus?: string;
      audioSegments?: Record<string, string>;
      generation?: { segments?: { index: number; text: string }[] };
    };
    if (data.audioStatus !== "paused") {
      throw new HttpsError("failed-precondition", "Audio is not paused.");
    }

    const total = data.generation?.segments?.length ?? 0;
    const done = data.audioSegments ?? {};

    // First segment index without audio yet.
    let next = 0;
    while (next < total && done[String(next)]) next++;

    if (next < total) {
      await jobRef.update({
        audioStatus: "audio",
        error: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await getFunctions()
        .taskQueue(SYNTH_SEGMENT_QUEUE)
        .enqueue({ jobId, segmentIndex: next });
    } else {
      // All segments done — the pause happened at the hook stage; resume there.
      await jobRef.update({
        audioStatus: "hook",
        error: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await getFunctions().taskQueue(SYNTH_HOOK_QUEUE).enqueue({ jobId });
    }

    return { ok: true };
  },
);

/**
 * TTS sandbox — synthesise arbitrary pasted text for voice/pace testing, with no
 * job doc (ephemeral). Runs the EXACT same path as the pipeline: sub-chunked
 * synthText (Algenib, RPM throttle, per-chunk retry/skip) → pcmToWav → upload,
 * just to a sandbox/ path. `mode` picks the fixed craft. Long text runs many
 * throttled calls, so this can take minutes — set a matching client timeout.
 */
export const synthTest = onCall<{ text: string; mode: "narration" | "hook" }>(
  {
    region: REGION,
    secrets: [geminiKey],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (request) => {
    const { text, mode } = request.data;
    if (typeof text !== "string" || !text.trim()) {
      throw new HttpsError("invalid-argument", "Provide some text to synthesize.");
    }

    const style = mode === "hook" ? HOOK_CRAFT : NARRATION_CRAFT;
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey.value() });
      const pcm = await synthText(ai, style, text);
      const wav = pcmToWav(pcm, VOICE_CONFIG.sampleRate);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const url = await uploadWav(`sandbox/${id}.wav`, wav);
      return { ok: true, url };
    } catch (error) {
      if (error instanceof DailyQuotaError) {
        throw new HttpsError(
          "resource-exhausted",
          "Daily TTS quota reached — try again after it resets (midnight Pacific).",
        );
      }
      if (classify429(error) === "transient") {
        throw new HttpsError(
          "resource-exhausted",
          "Hit the per-minute rate limit — wait a moment and try again.",
        );
      }
      throw new HttpsError(
        "internal",
        error instanceof Error ? error.message : "Synthesis failed.",
      );
    }
  },
);

