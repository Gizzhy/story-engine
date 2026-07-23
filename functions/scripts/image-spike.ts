/**
 * ONE-OFF SPIKE — NOT part of the deployed pipeline, NOT a Cloud Function.
 *
 * Question: can Nano Banana Pro (gemini-3-pro-image-preview) do what Whisk
 * refused — photoreal humans, with an attached character reference for face
 * consistency, on tense/dark scene content?
 *
 * Run:
 *   GEMINI_API_KEY=... npx tsx functions/scripts/image-spike.ts [jobId]
 *
 * Uses REAL data from a finished job in Firestore (public read on jobs/*).
 *   STEP A  — generate the character reference portrait, no attachment.
 *   STEP B  — generate 3 scenes with the STEP A image attached as reference,
 *             including at least one deliberately dark/tense scene.
 *
 * Safety: every call uses the most permissive settings available.
 * Budget:  HARD STOP at MAX_IMAGES total. No retries, no loops.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  GoogleGenAI,
  Modality,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/genai";

// ── Config ──────────────────────────────────────────────────────────────────
const MODEL = "gemini-3-pro-image-preview";
const IMAGE_SIZE = "1K"; // 1K keeps it ~$0.04/image
const ASPECT_RATIO = "16:9";
const MAX_IMAGES = 4; // hard stop — 1 reference + 3 scenes
const COST_PER_IMAGE_USD = 0.04;

const PROJECT = "story-engine-99013";
// Public browser key (NEXT_PUBLIC_FIREBASE_API_KEY) — jobs/* is public-read.
const WEB_KEY =
  process.env.FIREBASE_WEB_API_KEY ?? "AIzaSyA9U0fYBDo9g1HLLcGycGQq6rvBTe8IynY";
const DEFAULT_JOB = "GktbhXolslkaGhAy4eW1";

const OUT_DIR = join(__dirname, "spike");

// Most permissive safety configuration available.
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_NONE }));

/** finishReasons that mean "policy blocked" rather than "something broke". */
const POLICY_FINISH = new Set([
  "SAFETY",
  "IMAGE_SAFETY",
  "PROHIBITED_CONTENT",
  "IMAGE_PROHIBITED_CONTENT",
  "BLOCKLIST",
  "RECITATION",
  "IMAGE_RECITATION",
  "SPII",
]);

// Keywords used only to PICK a deliberately dark/tense scene for the test.
const TENSION =
  /threat|fear|afraid|scared|blood|knife|gun|weapon|confront|scream|danger|attack|grab|struggle|menac|violen|terror|panic|desperate|corner|chase|dead|kill|shadow|stalk|pinned|shove|fist|bruis/gi;

// ── Firestore REST value decoding ───────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
function decode(v: any): any {
  if (v == null) return v;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) {
    const o: Record<string, any> = {};
    for (const [k, val] of Object.entries(v.mapValue.fields ?? {})) o[k] = decode(val);
    return o;
  }
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(decode);
  return v;
}

interface SpikeScene {
  index: number;
  imagePrompt: string;
  present: string[];
  tension: number;
}

// ── Image generation ────────────────────────────────────────────────────────
interface GenResult {
  status: "SUCCESS" | "BLOCKED" | "ERROR";
  detail: string;
  finishReason: string;
  blockReason: string;
  modelText: string;
  bytes: number;
  data?: Buffer;
}

let imagesAttempted = 0;

async function genImage(
  ai: GoogleGenAI,
  prompt: string,
  ref?: { mimeType: string; data: string },
): Promise<GenResult> {
  if (imagesAttempted >= MAX_IMAGES) {
    return {
      status: "ERROR",
      detail: `HARD STOP: ${MAX_IMAGES}-image budget already used`,
      finishReason: "",
      blockReason: "",
      modelText: "",
      bytes: 0,
    };
  }
  imagesAttempted++;

  const parts: any[] = [];
  if (ref) parts.push({ inlineData: ref }); // attached character reference
  parts.push({ text: prompt });

  try {
    const res = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        safetySettings: SAFETY_SETTINGS,
        // NOTE: `personGeneration` is Vertex/Enterprise-only — the Developer API
        // rejects it outright, so permissiveness comes from safetySettings alone.
        imageConfig: {
          imageSize: IMAGE_SIZE,
          aspectRatio: ASPECT_RATIO,
        },
      },
    });

    const cand = res.candidates?.[0];
    const finishReason = String(cand?.finishReason ?? "");
    const blockReason = String(res.promptFeedback?.blockReason ?? "");
    const outParts = cand?.content?.parts ?? [];
    const img = outParts.find((p: any) => p?.inlineData?.data);
    // A refusal often arrives as TEXT explaining why — capture it verbatim.
    const modelText = outParts
      .map((p: any) => p?.text)
      .filter(Boolean)
      .join(" ")
      .trim();

    if (img?.inlineData?.data) {
      const buf = Buffer.from(img.inlineData.data, "base64");
      return {
        status: "SUCCESS",
        detail: "image returned",
        finishReason,
        blockReason,
        modelText,
        bytes: buf.length,
        data: buf,
      };
    }

    const policy = blockReason !== "" || POLICY_FINISH.has(finishReason);
    return {
      status: policy ? "BLOCKED" : "ERROR",
      detail: policy
        ? `POLICY BLOCK (blockReason=${blockReason || "none"}, finishReason=${finishReason || "none"})`
        : `NO IMAGE, non-policy (finishReason=${finishReason || "none"}) — empty/unsupported response`,
      finishReason,
      blockReason,
      modelText,
      bytes: 0,
    };
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    // An HTTP-level rejection can still be a policy refusal — surface the body.
    const policy = /SAFETY|PROHIBITED|BLOCKED|policy/i.test(msg);
    return {
      status: policy ? "BLOCKED" : "ERROR",
      detail: `${policy ? "POLICY BLOCK (HTTP)" : "API ERROR"}: ${msg.slice(0, 300)}`,
      finishReason: "",
      blockReason: "",
      modelText: "",
      bytes: 0,
    };
  }
}

function report(label: string, file: string | null, r: GenResult) {
  console.log(`\n[${r.status}] ${label}`);
  console.log(`   ${r.detail}`);
  console.log(
    `   finishReason=${r.finishReason || "none"}  blockReason=${r.blockReason || "none"}  bytes=${r.bytes}`,
  );
  if (r.modelText) console.log(`   model said: "${r.modelText.slice(0, 300)}"`);
  if (file) console.log(`   saved: ${file}`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in the environment.");
  const jobId = process.argv[2] ?? DEFAULT_JOB;

  console.log("=".repeat(78));
  console.log(`NANO BANANA PRO SPIKE — model=${MODEL}  size=${IMAGE_SIZE}  aspect=${ASPECT_RATIO}`);
  console.log(`job=${jobId}   budget=${MAX_IMAGES} images (hard stop)`);
  console.log("=".repeat(78));

  // 1. Pull real data from the finished job.
  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/jobs/${jobId}` +
    `?key=${WEB_KEY}&mask.fieldPaths=generation`;
  const doc: any = await (await fetch(url)).json();
  if (doc.error) throw new Error(`Firestore: ${doc.error.status} ${doc.error.message}`);
  const gen = decode(doc.fields?.generation);
  const characters: any[] = gen?.characters ?? [];
  const scenes: any[] = gen?.scenes ?? [];
  if (!characters.length) throw new Error("Job has no generation.characters (run visuals first).");
  if (!scenes.length) throw new Error("Job has no generation.scenes (run visuals first).");

  // 2. Pick a lead who actually appears in scenes.
  const appears = (name: string) =>
    scenes.some((s) => (s.present ?? []).includes(name));
  const lead =
    characters.find((c) => c.role === "lead" && appears(c.name)) ??
    characters.find((c) => appears(c.name));
  if (!lead) throw new Error("No character appears in any scene's `present`.");

  console.log(`\nCHARACTER: ${lead.name} (${lead.role ?? "?"})`);
  console.log(`  identity      : ${String(lead.identity ?? "").slice(0, 160)}`);
  console.log(`  baselineOutfit: ${String(lead.baselineOutfit ?? "").slice(0, 120)}`);

  // 3. Pick 3 scenes with this character — including the most tense one.
  const withLead: SpikeScene[] = scenes
    .filter((s) => (s.present ?? []).includes(lead.name) && s.imagePrompt)
    .map((s) => ({
      index: s.index,
      imagePrompt: s.imagePrompt as string,
      present: s.present ?? [],
      tension: (s.imagePrompt.match(TENSION) ?? []).length,
    }));
  if (withLead.length === 0) throw new Error(`No scenes contain ${lead.name}.`);

  const byTension = [...withLead].sort((a, b) => b.tension - a.tension);
  const darkest = byTension[0];
  const others = withLead.filter((s) => s.index !== darkest.index);
  const picks: SpikeScene[] = [darkest];
  if (others.length) picks.push(others[0]);
  if (others.length > 1) picks.push(others[Math.floor(others.length / 2)]);

  console.log(`\nSCENES CHOSEN (${picks.length}) — ${withLead.length} contain ${lead.name}:`);
  picks.forEach((s, i) => {
    const tag = s.index === darkest.index ? "  <-- DARK/TENSE PICK" : "";
    console.log(`  [${i + 1}] scene #${s.index + 1} tensionScore=${s.tension}${tag}`);
    console.log(`      ${s.imagePrompt.slice(0, 150)}…`);
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const ai = new GoogleGenAI({ apiKey });
  let succeeded = 0;

  // ── STEP A — reference portrait, no attachment ────────────────────────────
  console.log("\n" + "-".repeat(78));
  console.log("STEP A — character reference (no attachment): can it do photoreal humans at all?");
  console.log("-".repeat(78));
  const refRes = await genImage(ai, lead.referencePrompt ?? "");
  let refFile: string | null = null;
  if (refRes.data) {
    refFile = join(OUT_DIR, "00-reference.png");
    writeFileSync(refFile, refRes.data);
    succeeded++;
  }
  report("STEP A — reference portrait", refFile, refRes);

  if (!refRes.data) {
    console.log(
      "\nSTEP A produced no image — cannot run STEP B (it needs the reference to attach).",
    );
    console.log(
      `Budget used: ${imagesAttempted}/${MAX_IMAGES}. Stopping without spending the rest.`,
    );
    summarize(succeeded);
    return;
  }

  // ── STEP B — scenes WITH the reference attached ───────────────────────────
  console.log("\n" + "-".repeat(78));
  console.log("STEP B — scenes with STEP A attached as reference (face consistency + dark content)");
  console.log("-".repeat(78));
  const refInline = {
    mimeType: "image/png",
    data: refRes.data.toString("base64"),
  };

  for (let i = 0; i < picks.length && imagesAttempted < MAX_IMAGES; i++) {
    const s = picks[i];
    // Explicit reference instruction alongside the scene prompt.
    const prompt =
      `Use the attached image as the visual reference for ${lead.name}: keep the same face, ` +
      `the same person, consistent facial features and likeness.\n\n${s.imagePrompt}`;
    const r = await genImage(ai, prompt, refInline);
    let file: string | null = null;
    if (r.data) {
      file = join(OUT_DIR, `${String(i + 1).padStart(2, "0")}-scene-${s.index + 1}.png`);
      writeFileSync(file, r.data);
      succeeded++;
    }
    const tag = s.index === darkest.index ? " [DARK/TENSE]" : "";
    report(`STEP B${tag} — scene #${s.index + 1} (tensionScore=${s.tension})`, file, r);
  }

  summarize(succeeded);
}

function summarize(succeeded: number) {
  console.log("\n" + "=".repeat(78));
  console.log("SUMMARY");
  console.log("=".repeat(78));
  console.log(`Images attempted : ${imagesAttempted} / ${MAX_IMAGES} (hard cap)`);
  console.log(`Images generated : ${succeeded}`);
  console.log(
    `Est. cost        : ${succeeded} x $${COST_PER_IMAGE_USD.toFixed(2)} = $${(succeeded * COST_PER_IMAGE_USD).toFixed(2)} ` +
      `(blocked/failed calls typically aren't billed as images)`,
  );
  console.log(`Output dir       : ${OUT_DIR}`);
}

main().catch((e) => {
  console.error("\nSPIKE FAILED:", e?.message ?? e);
  process.exit(1);
});
