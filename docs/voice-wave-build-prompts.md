# Claude Code Build Prompts — Voice Wave (Gemini TTS)

Synthesizes narration audio: per-segment on **Gemini 3.1 Flash TTS**, voice **Algenib**, with a **narration** style prompt and a separate **hook** style prompt, each = the story's auto-derived emotional tone + fixed craft rules. Stitches an optional full-story file. Runs as an explicit "Generate audio" step after a story is `done` (independent of visuals — audio only needs the finished script).

**Locked config:** model `gemini-3.1-flash-tts` (swappable), voice `Algenib`, WAV @ 24000 Hz, speaking rate via style prompt (not a rate param). Every video uses the same voice+model+craft rules — only the *emotional tone* adapts per story.

**Key technical note:** Gemini TTS is a Gemini API model (not the Cloud TTS API) and returns **raw PCM audio**. We wrap PCM into **WAV** (trivial, no encoding lib) — WAV stitches cleanly and imports into any editor. MP3 can be added later via ffmpeg if file size ever matters.

**Before Prompt 0**, in terminal:
```bash
cd functions && npm install @google/genai && cd ..
# Create a Gemini API key in Google AI Studio / Cloud console for your project.
# IMPORTANT: enable PAID Cloud Billing on it — free-tier TTS output is NOT licensed for commercial use.
firebase functions:secrets:set GEMINI_API_KEY   # paste the key
# (Optional but wise: set a small budget alert in Google Cloud Billing.)
```

---

## Prompt 0 — Voice config, style craft rules, helpers, types

```
Read docs/hooks-thumbnail-metadata-rules.md (hook monologue shape) and docs/engine-spec.md. Foundation
only — no synthesis yet.

1. functions/src/lib/voice.ts — pinned, swappable config + fixed craft rules:
   export const VOICE_CONFIG = { model: "gemini-3.1-flash-tts", voice: "Algenib", sampleRate: 24000 };
   export const NARRATION_CRAFT = `Deliver as an engaging story narrator with a steady, natural,
     propulsive pace — never dragging or sluggish. Intimate and immersive. Let only the most charged
     moments breathe with a slight slow-down or pause, but keep momentum overall so the listener stays
     hooked. Clear, warm, human delivery.`;
   export const HOOK_CRAFT = `This is the cold-open hook — the first seconds decide whether the viewer
     stays. Deliver it gripping and propulsive: land the opening line hard, keep a brisk compelling
     pace, build tension toward the end. Do not drag; every second must earn attention.`;

2. functions/src/prompts/audioStyle.ts — audioStylePrompt: given the story's genre + tone tags, return
   JSON { emotionalTone: "a short phrase describing the emotional VOCAL tone for narrating this story,
   e.g. 'hushed, ominous, dread-soaked' or 'warm, aching, tender'" }. This is the ONLY part that adapts
   per story; craft rules stay fixed and are appended in code.

3. functions/src/lib/schemas.ts — add AudioStyleSchema ({ emotionalTone: string }).

4. functions/src/lib/audio.ts — helpers:
   - pcmToWav(pcmBuffer, sampleRate): prepend a WAV header to raw PCM and return a WAV Buffer.
   - uploadAudio(jobId, name, wavBuffer): save to Firebase Storage at audio/{jobId}/{name}.wav via
     firebase-admin storage, return a long-lived download URL (signed URL far-future, or make public).
   - concatWav(wavBuffers): stitch multiple 24kHz mono WAVs into one (strip headers, concat PCM, one
     new header).

5. functions/src/lib/models.ts — add audioStyle: "claude-haiku-4-5-20251001" (tone derivation).

6. Types (Next side): Job gains audioStatus? (union: 'idle'|'styling'|'audio'|'hook'|'stitching'|'done'
   |'error'), audioStyle?: { narration: string; hook: string }, audioSegments?: Record<string,string>
   (index→url), hookAudioUrl?: string, fullAudioUrl?: string, audioProgress?: {current,total}.

If unsure about the Gemini TTS request shape (@google/genai, AUDIO responseModality, speechConfig /
prebuiltVoiceConfig voiceName), check https://ai.google.dev/gemini-api/docs/speech-generation. Compile
clean. Stop here.
```

---

## Prompt 1 — `generateAudio` + `prepareAudio` (style) + `synthSegment` — TEST AFTER THIS

```
Read docs. Implement the audio kickoff, style derivation, and per-segment synthesis. Region
'europe-west3'. Gemini key from secrets.

A) generateAudio — onCall, fast: verify status === 'done'. Set audioStatus:'styling'. Enqueue
   prepareAudio({ jobId }). Return { ok:true }.

B) prepareAudio — onTaskDispatched (secrets:[geminiKey OR just deriving via Claude — this step uses
   Claude Haiku, so it needs the Anthropic secret], region 'europe-west3', timeout 120):
   - Idempotency: if audioStyle exists, skip to enqueuing synthSegment.
   - Call audioStylePrompt (models.audioStyle) with storyBrief.genre + dna.tone → emotionalTone.
   - Compose and persist audioStyle = {
       narration: `${emotionalTone}. ${NARRATION_CRAFT}`,
       hook: `${emotionalTone}. ${HOOK_CRAFT}` }.
   - Set audioStatus:'audio', audioProgress:{current:0, total: generation.segments.length}.
   - Enqueue synthSegment({ jobId, segmentIndex:0 }).

C) synthSegment — onTaskDispatched (secrets:[geminiKey], region 'europe-west3', timeoutSeconds:300,
   memory:'512MiB', retryConfig:{maxAttempts:3, minBackoffSeconds:5}):
   - Idempotency: if audioSegments[segmentIndex] exists, skip to enqueue next.
   - text = generation.segments (sorted)[segmentIndex].text; prompt = `${audioStyle.narration}\n\n${text}`.
   - Call Gemini TTS: model VOICE_CONFIG.model, responseModalities ["AUDIO"], speechConfig with
     prebuiltVoiceConfig voiceName VOICE_CONFIG.voice. Get the PCM audio.
   - SAFETY VALVE: if the text exceeds the TTS per-request input limit (or the call errors on length),
     split the segment text on sentence boundaries into sub-chunks, synth each, and concat the PCM.
   - pcmToWav → uploadAudio(jobId, `segment-${segmentIndex}`, wav) → url.
   - Deterministic write: audioSegments.<segmentIndex> = url; audioProgress.current = segmentIndex+1.
   - If more segments: enqueue synthSegment(next). Else: set audioStatus:'hook', enqueue synthHook.
   - try/catch → audioStatus:'error' with message.

Deploy (this enables the third task queue + the Gemini/TTS API — accept any enable prompt). Then STOP
and listen to segment-0.wav before building hook/stitch.
```

**Test checkpoint:** trigger audio on a finished story, then open the segment-0 audio URL from Firestore (or Storage) and LISTEN. Check: is it Algenib, is the emotional tone right for the genre, and — critically — is the **pace right** (not sluggish)? If it drags, that's a craft-rule tune (NARRATION_CRAFT), not a code bug. Tell me what you hear.

---

## Prompt 2 — `synthHook` + `stitchAudio`

```
Read docs/hooks-thumbnail-metadata-rules.md Phase 3. Two more tasks, chained after segments.

A) synthHook — onTaskDispatched (secrets:[geminiKey], region 'europe-west3', same options):
   - Idempotency: if hookAudioUrl exists, skip to enqueue stitch.
   - Requires the hook monologue: generation.hooks.monologue (from the visual/hooks pass). If it's
     missing (hooks not generated yet), skip hook audio gracefully and go straight to stitch.
   - prompt = `${audioStyle.hook}\n\n${monologue}`. Synth (Algenib, Gemini TTS) → PCM → WAV →
     uploadAudio(jobId, "hook", wav) → hookAudioUrl. Set audioStatus:'stitching', enqueue stitchAudio.

B) stitchAudio — onTaskDispatched (region 'europe-west3', timeout 300, memory 512):
   - Read all audioSegments in index order, fetch each WAV, concatWav them into one full-story WAV.
   - uploadAudio(jobId, "full-story", stitched) → fullAudioUrl. (Do NOT include the hook in the stitched
     narration — the hook is a separate cold-open file.)
   - Set audioStatus:'done', updatedAt.
   - try/catch → audioStatus:'error'.

Deploy. Stop here.
```

---

## Prompt 3 — Client: "Generate audio" + players/downloads

```
Read docs/ui-spec.md. Wire audio into StoryOutput (its own tab/section, alongside the others).

1. On status 'done', show a "Generate audio" button. Click → call the generateAudio callable { jobId }.
2. Drive an audio progress indicator from audioStatus (styling → audio X/N via audioProgress → hook →
   stitching → done) with per-stage states.
3. Audio section, populated as URLs arrive:
   - Per-segment: a small audio player + download link for each audioSegments[i], labeled "Segment i".
   - Hook: player + download for hookAudioUrl ("Cold-open hook").
   - Full story: player + prominent download for fullAudioUrl ("Full narration").
4. Resumability: a job mid-audio resumes from the doc on refresh (work continues server-side).

Also add a Firebase Storage rule allowing public READ on the audio/ path (login-less), writes only via
Admin SDK. tsc/eslint/next build clean. Stop — run after.
```

---

## Prompt 4 — Run & tune the delivery

```
Generate audio on a finished (short) story of a NON-horror genre if possible, to test the auto-derived
tone. Listen to: a narration segment, the hook, and the stitched full file.
- Is the emotional tone genre-appropriate (adapts per story)? Is the voice consistent (Algenib)?
- Is the PACE right — narration steady/immersive, hook propulsive and grip-fast? The hook must NOT drag.
- Do the segment files stitch seamlessly (no clicks/gaps at seams)?
Tune the craft rules in functions/src/lib/voice.ts (NARRATION_CRAFT / HOOK_CRAFT) or the audioStyle
derivation, redeploy. Pacing is the thing most likely to need a nudge — keep the anti-drag guardrail strong.
```

---

## Done = this milestone
One click on a finished story produces: per-segment narration audio in Algenib (genre-appropriate tone,
retention-safe pace), a separately-voiced cold-open hook, and a stitched full-story file — all downloadable.

## Watch-fors
- **Commercial licensing:** production audio MUST run on paid Cloud Billing (free-tier TTS output isn't
  licensed for commercial use). The paid key handles this.
- **PCM→WAV:** Gemini TTS returns PCM; we wrap WAV. Keep every segment at 24000 Hz mono so stitching is
  seamless (mismatched rates cause glitches).
- **Preview model:** `gemini-3.1-flash-tts` is newer/preview — pin the exact model id, watch for behavior
  shifts or tighter rate limits on long jobs; 2.5 Flash TTS is the stable fallback (config is swappable).
- **Per-request length:** if a segment is too long for one TTS call, the safety valve splits on sentences
  and concatenates PCM.
- **Cost:** ~$0.80 per 90-min story on Flash TTS. Trivial, but keep the budget alert on while tuning.
- **Doc/storage:** audio lives in Storage (not the Firestore doc), so no 1MB-doc pressure from audio.
```
