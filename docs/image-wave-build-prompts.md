# Claude Code Build Prompts — Image Wave (Nano Banana Pro)

Automates scene images: character references first (generated in-pipeline or uploaded), then one image per scene with those references **attached** for face consistency. Chained through Cloud Tasks, explicit button trigger, hard cost guardrails.

**Proven by the spike:** `gemini-3-pro-image-preview` generates photoreal humans, holds faces across scenes via reference attachment, and passed tense/threatening content with `safetySettings: BLOCK_NONE`. Do **not** use `personGeneration` — it 400s on the Developer API.

**Locked config:** model `gemini-3-pro-image-preview`; **scenes at 1K** (~$0.04/img, ~$2.80 per 70-scene video); **thumbnail + hook shots at 2K** (few images, worth the crispness); all swappable constants.

---

## Prompt 0 — Config, storage helpers, types

```
Read docs/scenes-section-rules.md and docs/characters-section-rules.md. Foundation only — no generation.
Reference implementation: functions/scripts/image-spike.ts (the proven working call shape).

1. functions/src/lib/imageConfig.ts — pinned, swappable:
   export const IMAGE_CONFIG = {
     model: "gemini-3-pro-image-preview",
     sceneResolution: "1K",        // bulk scenes — cheap
     heroResolution: "2K",         // thumbnail + hook shots — crisp
     maxAttemptsPerImage: 2,       // hard retry cap
     maxImagesPerJob: 120,         // absolute budget ceiling per job
     costPerImage: { "1K": 0.04, "2K": 0.134 },
   };
   Also export the safetySettings block (BLOCK_NONE across categories) used by the spike.
   Do NOT include personGeneration — it is rejected on the Developer API.

2. functions/src/lib/imageGen.ts — one shared call helper, generateImage({ prompt, referenceImages[],
   resolution }) that:
   - calls the model with the prompt + any reference images attached as subjects,
   - returns { ok: true, buffer } OR { ok: false, kind: "blocked" | "error", reason },
   - classifies BLOCKED (policy/safety/promptFeedback) vs ERROR (network/config/other) distinctly —
     this distinction drives retry behavior downstream.

3. functions/src/lib/imageStore.ts — uploadImage(jobId, name, buffer) → Firebase Storage at
   images/{jobId}/{name}.png, returns a long-lived download URL. Mirror the audio helper's approach.

4. Types (Next side): Job gains imageStatus? ('idle'|'references'|'scenes'|'done'|'error'),
   imageProgress? {current,total}, imageSpend? {images:number, usd:number}, imageError?.
   Character gains referenceImageUrl?. Scene gains imageUrl?, imageState? ('ok'|'blocked'|'error'),
   imageVariants?: [{url, createdAt}] (cap 3).

Compile clean. Stop here.
```

---

## Prompt 1 — `generateImages` + `generateReferences` (+ upload path)

```
Implement the kickoff and the character-reference pass. Region 'europe-west3', Gemini key from secrets.

A) generateImages — onCall, fast: verify the job has generation.scenes (visuals done). Set
   imageStatus:'references', imageProgress {current:0, total: scenes.length}, imageSpend {images:0,usd:0}.
   Enqueue generateReferences({ jobId }). Return { ok:true }.

B) generateReferences — onTaskDispatched (secrets:[geminiKey], timeoutSeconds:300, memory:'512MiB',
   retryConfig:{maxAttempts:3, minBackoffSeconds:5}):
   - Idempotency: skip any character that already has referenceImageUrl (this is what makes UPLOADED
     references win — an uploaded one is simply already set, so generation skips it).
   - For each character WITHOUT a reference: generateImage({ prompt: character.referencePrompt,
     resolution: heroResolution }). Retry per maxAttemptsPerImage; on BLOCKED do NOT retry (identical
     text will block again) — mark and continue.
   - Upload → set generation.characters[i].referenceImageUrl (deterministic set by index/name, never
     append). Increment imageSpend.
   - Then set imageStatus:'scenes' and enqueue generateSceneImage({ jobId, sceneIndex: 0 }).

C) Upload path: add a callable uploadCharacterReference({ jobId, characterName }) that returns a signed
   upload URL (or accepts a base64 image) and sets that character's referenceImageUrl. Because
   generateReferences skips characters that already have one, uploading before running images means my
   own Whisk reference is used instead of a generated one.

Deploy. Stop here.
```

---

## Prompt 2 — `generateSceneImage` (the loop + guardrails)

```
Implement per-scene generation with the cost guardrails. This is the pass that spends real money — the
guardrails are not optional.

generateSceneImage — onTaskDispatched (secrets:[geminiKey], timeoutSeconds:300, memory:'512MiB',
retryConfig:{maxAttempts:3, minBackoffSeconds:5}):
- payload { jobId, sceneIndex, force? }.
- BUDGET GUARD (first): if imageSpend.images >= IMAGE_CONFIG.maxImagesPerJob, stop the chain, set
  imageStatus:'error' with a clear "budget cap reached" message. Never exceed it.
- Idempotency: if the scene already has imageUrl and !force, skip to enqueueing the next scene.
- Build references: from scene.present, collect those characters' referenceImageUrl (skip any missing).
  Attach them to the call (max 5 subjects).
- Call generateImage({ prompt: scene.imagePrompt, referenceImages, resolution: sceneResolution }).
  * On ERROR: retry up to maxAttemptsPerImage, then mark scene.imageState='error' and CONTINUE the chain.
  * On BLOCKED: do NOT retry — mark scene.imageState='blocked' and continue. (Retrying identical blocked
    text only wastes money.)
  * On success: upload → deterministic write scene.imageUrl + imageState='ok'.
- Every attempt that actually generated increments imageSpend {images, usd} using costPerImage.
- Advance imageProgress.current; enqueue the next sceneIndex; on the last, set imageStatus:'done'.
- NEVER auto-regenerate an existing image — regeneration is only ever an explicit user action.

Deterministic writes only (set by scene index; no arrayUnion/push anywhere).

Deploy. Then STOP — we test a full run before building the regenerate UI.
```

**Test checkpoint:** run images on a finished short story. Verify: faces stay consistent across scenes, blocked/error scenes are marked (not silently missing), `imageSpend` matches expectations, and the run stops cleanly at the end. Report the blocked count — that tells us the real policy hit-rate on a full story.

---

## Prompt 3 — `regenerateSceneImage` + client (grid, downloads, re-rolls)

```
A) Backend: callable regenerateSceneImage({ jobId, sceneIndex }) → enqueues generateSceneImage with
   force:true for that scene ONLY (no chain continuation). Keep the previous take: push the old url into
   scene.imageVariants (cap 3, newest first) before overwriting imageUrl. Errors land on an isolated
   field, not the job-level imageError.

B) Client (Scenes tab in StoryOutput):
   - "Generate images" button (only when scenes exist and imageStatus is idle/undefined). Show a cost
     estimate before running: "~N scenes x $0.04 ≈ $X".
   - Progress from imageStatus + imageProgress; show live imageSpend ("42 images · $1.68").
   - Render each scene as a THUMBNAIL GRID: the image inline next to its prompt, keyed by scene index.
     Scenes with imageState 'blocked'/'error' show a clear badge instead of an image, so I can hand-fix
     those few in Whisk.
   - Per-scene "Regenerate" button (with loading state derived from the doc, not local state) and, where
     variants exist, a small strip to compare previous takes.
   - Download per image + "Download all" (zip client-side).
   - Characters tab: show each character's referenceImageUrl, with an "Upload my own" control wired to
     uploadCharacterReference.
   - Storage rules: public READ on images/, writes only via Admin SDK.

tsc/eslint/next build clean. Stop — run after.
```

---

## Done = this milestone
One click turns a finished story into a full illustrated set: generated character references, a face-consistent image per scene, blocked scenes clearly flagged, per-scene re-rolls, and everything downloadable — replacing the manual Whisk paste loop entirely.

## Watch-fors
- **Cost is now the dominant expense** (~$2.80/video at 1K vs ~$0.80 audio). The budget cap, the no-retry-on-block rule, and never-auto-regenerate are what keep it bounded. Keep a Google Cloud budget alert on.
- **Blocked scenes are expected occasionally** — the design flags them for manual handling rather than burning retries. Track the rate; if it's high on horror stories, that's the signal to probe the graphic-content ceiling.
- **References condition the FACE, not the outfit** — wardrobe continuity stays in the scene prompts (by design).
- **Deterministic writes only** — same lesson as the segment duplicate bug.
- **Resolution is one constant** — flipping scenes to 2K later is a one-line change (~$9.40/video).
