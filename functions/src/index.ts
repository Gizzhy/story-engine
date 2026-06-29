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
import { PREMISE_DISTANCE } from "./prompts/blocks";
import { durationToSpec } from "./lib/duration";
import { parseJson } from "./lib/json";
import {
  DnaSchema,
  BlueprintSchema,
  StateLedgerSchema,
  type Dna,
  type Blueprint,
  type StateLedger,
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
}

/**
 * Call Claude for JSON, parse and validate it. Retries once on any
 * call/parse/validate failure; throws if the second attempt also fails.
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
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      });
      const text = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("");
      return schema.parse(parseJson(text));
    } catch (error) {
      lastError = error;
    }
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
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
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

// Fully-qualified queue path so tasks land in the europe-west3 queue.
const WRITE_SEGMENT_QUEUE = `locations/${REGION}/functions/writeSegment`;

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
        4000,
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
        error instanceof Error ? error.message : "Generation failed.";
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
            1500,
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
