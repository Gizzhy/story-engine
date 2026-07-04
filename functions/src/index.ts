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
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getFunctions } from "firebase-admin/functions";
import Anthropic from "@anthropic-ai/sdk";
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

setGlobalOptions({ maxInstances: 10 });

initializeApp();
const db = getFirestore();

// Anthropic key lives in Secret Manager; the client is built per-invocation.
const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

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

/**
 * Phase 4 — Thumbnail. One high-CTR cover prompt, assembled with Camera-Realism
 * (the only place it's used). Idempotent: skips if the thumbnail prompt exists.
 */
export const generateThumbnail = onTaskDispatched<{ jobId: string }>(
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
        generation?: { characters?: VisualCharacter[]; thumbnailPrompt?: string };
      };

      const blueprint = data.blueprint;
      if (!blueprint) return;
      const characters = data.generation?.characters ?? [];
      const styleMood = data.styleMood ?? "";

      const existing = data.generation?.thumbnailPrompt;
      const alreadyDone = typeof existing === "string" && existing.length > 0;

      if (!alreadyDone) {
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

        await jobRef.update({
          "generation.thumbnailPrompt": assemble.thumbnailPrompt(
            parsed,
            characters,
            styleMood,
          ),
          visualStatus: "metadata",
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        await jobRef.update({
          visualStatus: "metadata",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      await getFunctions()
        .taskQueue(GENERATE_METADATA_QUEUE)
        .enqueue({ jobId });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Thumbnail generation failed.";
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

