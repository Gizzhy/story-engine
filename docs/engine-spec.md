# Story Engine — Pipeline Spec & Prompt Templates

**Product:** Faceless single-continuous-story generator. Input = a well-performing video's transcript + title (used as *research*, never copied). Output = a brand-new original story, sized to a user-selected duration, segmented for a later image/voiceover pipeline.

---

## 1. Duration → Generation Spec (the math)

Narration runs ~140 words/minute (tunable constant — call it `WPM`). The user picks a duration; the engine derives everything else.

| Duration | Word target (×140) | Segments (~1,200 w each) |
|----------|--------------------|--------------------------|
| 30 min   | ~4,200             | ~4                       |
| 45 min   | ~6,300             | ~5                       |
| 60 min   | ~8,400             | ~7                       |
| 75 min   | ~10,500            | ~9                       |
| 90 min   | ~12,600            | ~11                      |

Range: **30 min (min) → 90 min (max)**.

`segments = ceil(wordTarget / SEGMENT_SIZE)` where `SEGMENT_SIZE ≈ 1,200`. Keep segments small enough that each generation call stays high-quality; the *story plan* (Stage 2) is what makes them add up to one coherent narrative.

**Why multi-call is non-negotiable:** you cannot generate 16k words in one call (output token ceiling + quality collapse — pacing sags, characters drift, rushed ending). The pipeline below is the fix.

---

## 2. Pipeline Architecture

```
Stage 1  DNA Extraction      transcript + title        → Story DNA (JSON)        [cheap, 1 call]
Stage 2  Story Architecture  DNA + knobs               → Story Plan (JSON)       [1 call, USER REVIEWS]
Stage 3  Segment Generation  plan + state + prev tail  → segment prose           [N calls, sequential]
Stage 4  State Update        segment + old state       → updated state (JSON)    [N calls, cheap]
```

Stages 3 & 4 alternate: generate segment → update state → generate next segment with new state. This is a **long-running background job** (≈15–20 calls, minutes of wall time for a 2h video) — run it on a queue (Inngest / Trigger.dev / QStash), not a single serverless request, and stream progress to the UI.

**User knobs fed into Stage 2:** `duration` (→ wordTarget + segmentCount), `premiseDistance` (1–5 dial, below), optional `premiseSeed` (user idea), optional `voiceProfile` (pasted sample of their narration style).

### Premise-distance dial (1–5)
- **1 — Twin:** same subgenre, same emotional hook, same archetype. Brand-new specifics only.
- **2 — Sibling:** same subgenre, fresh archetype within it.
- **3 — Cousin:** same genre, new premise, recognizably the same lane.
- **4 — Distant:** genre only, structure/pacing borrowed, premise unrelated.
- **5 — Format-only:** keep just the title-formula + beat structure; everything else new.

---

## 3. The Story State Object (continuity ledger)

This is what stops a 90-minute story from renaming a character or contradicting a fact. Maintained by Stage 4, sliced into each Stage 3 call.

```json
{
  "summarySoFar": "Compressed running summary of everything narrated.",
  "characters": [
    { "name": "", "role": "", "traits": "", "status": "alive/known facts" }
  ],
  "establishedFacts": ["facts the narrative has committed to"],
  "openThreads": ["unresolved questions / setups awaiting payoff"],
  "currentScene": { "location": "", "timeframe": "", "moodAtSegmentEnd": "" },
  "lastParagraph": "Verbatim final paragraph of the previous segment (for seamless continuation)."
}
```

---

## 4. Stage Prompts (the IP)

### Stage 1 — DNA Extraction

```
You are a story analyst. You will be given the TRANSCRIPT and TITLE of a video that
performed well. Your job is to extract its reusable STRUCTURAL DNA — the pattern that
made it work — WITHOUT copying its plot, characters, or specific events.

CRITICAL: Do not retain or describe the specific story. Abstract everything into a
reusable template. If you find yourself naming this story's characters or events, you
are doing it wrong.

Return ONLY valid JSON, no preamble:
{
  "genre": "",
  "subgenre": "",
  "premiseArchetype": "the ABSTRACT shape of the premise, e.g. 'protagonist discovers a
                       hidden betrayal by someone trusted' — never the specific betrayal",
  "hookMechanism": "what makes the opening grab attention",
  "narrativePOV": "first-person / third-person / etc.",
  "tone": ["3-5 tone tags"],
  "pacingStyle": "how tension is built and released",
  "emotionalArc": ["beat-level emotional journey, abstracted"],
  "titleFormula": "the CLICK MECHANISM of the title as a reusable pattern, not the title",
  "audience": "who this is for",
  "lengthSignals": "any structural notes relevant to long-form pacing"
}

TITLE: {{sourceTitle}}
TRANSCRIPT: {{sourceTranscript}}
```

### Stage 2 — Story Architecture

```
You are a story architect for long-form narrated YouTube videos. Using the STORY DNA
below as a creative template, design a COMPLETELY ORIGINAL story. The DNA is research —
match its structure, hook style, tone, and title formula, but invent everything specific.

PREMISE DISTANCE: {{premiseDistance}} (1=very close in flavor to the source's archetype,
5=keep only format/structure). Honor this when choosing the new premise.
{{#premiseSeed}}USER PREMISE SEED (build from this): {{premiseSeed}}{{/premiseSeed}}
{{#voiceProfile}}VOICE SAMPLE (match this narration style): {{voiceProfile}}{{/voiceProfile}}

LENGTH: target {{wordTarget}} words across {{segmentCount}} segments. Distribute the
classic arc (setup → inciting incident → rising action → midpoint → escalation →
climax → resolution) across the segments. Front-load the hook; do not let the middle sag;
give the climax room and the ending a real payoff (no rushing).

Return ONLY valid JSON:
{
  "titleOptions": ["5 new titles in the source's title formula"],
  "logline": "",
  "premise": "",
  "setting": "",
  "characters": [{ "name": "", "role": "", "traits": "", "arc": "" }],
  "segments": [
    {
      "index": 1,
      "title": "internal label",
      "beat": "which part of the arc this covers",
      "wordTarget": 1200,
      "goal": "what must happen here",
      "endsOn": "the hook/tension that pulls into the next segment"
    }
  ]
}
```

### Stage 3 — Segment Generation (called once per segment, in order)

```
You are writing ONE segment of a single continuous narrated story. Write polished,
immersive narration — this is voiceover prose meant to be read aloud, not a script with
labels. Match the established voice and tone exactly.

STORY PLAN: {{storyPlan}}
STORY STATE SO FAR: {{storyState}}
THIS SEGMENT'S BRIEF: {{currentSegmentEntry}}

Rules:
- Continue SEAMLESSLY from lastParagraph — no recap, no "previously", no scene reset
  unless the brief calls for it.
- Hit ~{{segmentWordTarget}} words (±10%). Do not wrap up the whole story — only this beat.
- Stay 100% consistent with characters, establishedFacts, and openThreads in the state.
- End on the tension described in `endsOn` so the next segment flows in.
- Output ONLY the narration prose. No headings, no notes, no JSON.
```

### Stage 4 — State Update (cheap, after each segment)

```
Update the story state ledger with what just happened in the new segment. Be concise;
summarySoFar should stay compact even as the story grows (compress older events harder).

PREVIOUS STATE: {{storyState}}
NEW SEGMENT TEXT: {{segmentText}}

Return ONLY the updated state JSON in the same schema (summarySoFar, characters,
establishedFacts, openThreads, currentScene, lastParagraph). Set lastParagraph to the
verbatim final paragraph of the new segment.
```

---

## 5. Output Schema (future-proofed for images + tags)

Store the final result as a structured object so later features are just new fields, never a rearchitecture:

```json
{
  "title": "chosen title",
  "titleOptions": [],
  "durationMinutes": 90,
  "wordCount": 12640,
  "segments": [
    { "index": 1, "text": "...narration..." }
  ],
  "scenes": [],        // LATER: a scene-splitter pass chunks each segment → scene + imagePrompt
  "description": "",   // LATER: SEO
  "tags": []           // LATER: SEO
}
```

**Scene/image note (defer, but design for it now):** keep Stage 3 outputting clean prose — it generates better narration than forcing JSON. When you add images, run a separate lightweight "scene-splitter" pass that chunks each segment into scene beats and writes an `imagePrompt` per scene. That isolates the image concern entirely and keeps narration quality high.

---

## 6. Constants to tune
- `WPM` (140) — calibrate to your actual TTS/narrator speed.
- `SEGMENT_SIZE` (1,200) — smaller = more coherent per call but more calls/cost.
- Model: use a strong model for Stages 2 & 3 (architecture + prose); a cheaper/faster one is fine for Stages 1 & 4.
- Cost: a 90-min video ≈ 11 segments (~24 calls total incl. state updates) — this sets your per-video cost and your pricing.