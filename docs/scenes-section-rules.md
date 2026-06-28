# Scenes Section — Rule Set (Phase 2)

The biggest section. Breaks the finished narration into **scenes** — one image prompt per visual moment — using everything built so far. This is where the segment→scene hierarchy, the Clothing Rules, and the verbatim reuse of each character's locked `identity` all come together.

---

## The hierarchy (the thing to hold in your head)

```
Story
├─ Segment 1   (~1,200 words of narration — a WRITING unit)
│   ├─ Scene 1  → image prompt   (a VISUAL unit, ~one image every few seconds)
│   ├─ Scene 2  → image prompt
│   └─ … many per segment
├─ Segment 2
│   └─ Scene … → …
└─ …
```

- **Segments** are script chunks (exist so the story can be *written* coherently). ~11 for 90 min.
- **Scenes** are visual moments (one image each). Far more numerous — your bank's 20 (tight) to 60+ (full).
- **Scenes run AFTER the full script is written.** The splitter reads finished narration and layers scenes on top; the narration itself knows nothing about scene boundaries.

---

## Processing model: split per-segment

A 90-minute story can be 60–100+ scenes. You can't emit that many detailed prompts (each re-describing present characters) in one Claude call — same output-cap wall as the script. So **scene-splitting is chunked by segment**, reusing the structure already there: each segment's narration → its own splitter call → that segment's scenes. Scenes get a **global running index** across the whole story.

This rides the same background-job machinery as the writing wave — one more pass over the same segments.

---

## New shared block — added to `src/lib/prompts/blocks.ts`

```ts
export const CLOTHING_RULES = `
Clothing & styling rules:
- Every scene specifies each present character's outfit, appropriate to that scene.
- Outfits change with the day, location, or context (work clothes at work, home clothes at home,
  casual when out, formal for events) — the way real people re-dress.
- Style each character to fit their personality, status, and the story's setting and era; reach
  for current, on-trend looks unless the story dictates otherwise.
- If the story specifies an outfit, use it; otherwise dress them for the scene rather than
  repeating one look.
`;
```

---

## Wardrobe state (keeps outfits from flickering)

The Clothing Rules say outfits change *when context changes* — which means they must stay the *same* within a context. If a character is at the office across six scenes, they wear the same outfit in all six, then change at home. Because we process segments in order, we thread a small **wardrobe state** (like the story's continuity ledger, but for clothes + place):

```ts
wardrobe: {
  [characterName]: { currentOutfit: string, context: string }  // e.g. "office, day 1"
}
```

Each splitter call receives the wardrobe in, and returns it updated — so outfits only change when the narration actually moves the day/location/context.

---

## Module — Scene Splitter · `src/lib/prompts/scenes.ts`

**Purpose:** read one segment of narration, find its visual beats, and emit a structured scene per beat. Crucially, it does **not** write character physical descriptions — those are injected verbatim by code (see assembly). It only decides *who is present*, *the setting*, *the action*, and *each present character's outfit*.

```ts
export const scenesPrompt = {
  system: `${BASE_RULES}
You are a scene director turning narration into the visual moments that illustrate it. You are
given the story context, the cast (names + roles), the current wardrobe state, and ONE segment of
narration. Identify the distinct visual beats — the moments a viewer should SEE — and output one
scene per beat, covering the whole segment in order. Skip nothing important.

Aim for roughly {{targetScenes}} scenes for this segment, but let content decide: a tense reveal
may need several quick beats, a calm passage fewer.

Scene fidelity: the large majority of scenes must directly depict the narrated moment (type
"narrated"). You may occasionally insert a bridging shot (type "bridge") — an establishing,
atmosphere, or transition visual — ONLY to relieve pacing where the narration gives nothing fresh
to show. Bridge shots must never introduce plot, characters, or events the narration didn't state;
they only set the stage. Keep bridges a small minority, and tag every scene with its "type".

Motion: almost every scene is a near-still with gentle ambient drift (motionPriority "ambient").
Reserve true animation (motionPriority "animate") for only the highest-impact beats — a reveal, a
climax, an emotional peak. Mark AT MOST about 1 in 10 scenes as "animate"; keep it scarce so those
moments feel special. For "animate" scenes only, also write a short "motion" prompt (what moves and
how — e.g. slow push-in, a door creaks open, rain intensifies). "ambient" scenes get no motion prompt.

${CLOTHING_RULES}
Use the wardrobe state provided: keep each character's current outfit until the day, location, or
context changes; when it changes, dress them appropriately and update the wardrobe.

Do NOT write characters' physical appearance — that is injected separately. For each scene give
only: the setting, the action of that exact moment, which characters are present (by name, for
keying only — names never appear in final output), and each present character's outfit for this scene.

Return ONLY this JSON:
{
  "scenes": [
    {
      "type": "narrated | bridge",
      "motionPriority": "ambient | animate",
      "motion": "for 'animate' scenes only: what moves and how; empty for 'ambient'",
      "narrationExcerpt": "the line(s) this illustrates (empty for a bridge shot)",
      "setting": "where / when",
      "action": "what is happening in this moment",
      "present": ["CharacterName", ...],
      "outfits": [ { "name": "CharacterName", "outfit": "what they wear in this scene" } ]
    }
  ],
  "wardrobe": { "CharacterName": { "currentOutfit": "", "context": "" } }
}`,
  buildUser: (i: {
    storyBrief: object; cast: {name:string; role:string}[];
    wardrobe: object; segmentText: string; targetScenes: number;
  }) => `STORY CONTEXT:\n${JSON.stringify(i.storyBrief)}

CAST (names + roles only):\n${JSON.stringify(i.cast)}

CURRENT WARDROBE STATE:\n${JSON.stringify(i.wardrobe)}

SEGMENT NARRATION:\n${i.segmentText}`,
};
```

---

## Final scene prompt assembly (in code) — the consistency lever

This is the most important mechanic in the visual pipeline. The AI gives the variable parts; **code injects each present character's locked `identity` VERBATIM** (from Phase 1) plus the scene outfit, then appends Style Block A. Because the identity string is byte-identical in every scene, the same face renders every time.

```ts
function assembleScenePrompt(scene, characters, styleMood) {
  const present = scene.present.map(name => {
    const identity = characters.find(c => c.name === name).identity;      // verbatim, immutable
    const outfit   = scene.outfits.find(o => o.name === name).outfit;      // per-scene
    return `${identity} Wearing ${outfit}.`;                              // no name in output
  }).join("\n\n");

  return `${scene.setting}. ${scene.action}.\n\n${present}\n\n${STYLE_BLOCK_A(styleMood)}`;
}
```

This is exactly your bank's recipe — *scene setting + action + only the characters present (each fully re-described, no names) + their outfit + Style Block A appended* — except "re-described" is a verbatim code injection rather than the AI re-writing it each time, which removes face-drift entirely.

Motion stays separate: `scene.motion` (present only on `animate` scenes) feeds the later image-to-video step, exactly like hook motion prompts — it is never part of the still image prompt.

---

## Scene count (how many)

User-selectable **density** control (Tight / Medium / Full) sets the target; the AI then content-adjusts the actual split:

| Density | ~words/scene | ~image every | 90-min story (~12,600 w) |
|---------|--------------|--------------|--------------------------|
| Tight   | ~180         | ~75 sec      | ~70 scenes               |
| Medium  | ~120         | ~50 sec      | ~105 scenes              |
| Full    | ~75          | ~32 sec      | ~170 scenes              |

`targetScenes` per segment = `segmentWords / wordsPerScene`. The AI aims near it but splits on natural beats.

---

## How this maps to your bank
- **Phase 2 Step 1 (decide how many scenes)** → density target → per-segment `targetScenes`.
- **Phase 2 Step 2 (don't skip important scenes)** → handled by exhaustive in-order per-segment processing; no corrective re-prompt needed.
- **Phase 2 Step 3 (one prompt per scene)** → this module + the code assembly.
- **Apply: Style Block A + Whisk Rules + Clothing Rules** → `STYLE_BLOCK_A(mood)` (code) + Whisk discipline (no names, present-only) + `CLOTHING_RULES`.
- **"Each fully re-described, no names"** → verbatim `identity` injection, names used only as keys.
- **"Attach character ref image as subject in Whisk"** → manual rendering step, unchanged.

---

## UI implication (parked, but noted)
The placeholder UI shows scenes 1:1 with segments. Real model = many scenes per segment, so the inline view becomes multiple image-prompt blocks anchored to their `narrationExcerpt` within each segment, and the batch list ("Scene N: [prompt]") simply grows long. We update the UI when we wire real scenes — not now.

---

## Locked decisions for this section
1. **Identity injection:** each character's locked `identity` is reused VERBATIM in every scene (code-injected, not AI-rewritten) — kills face-drift. ✅
2. **Density:** user-selectable Tight / Medium / Full control; the AI does the actual content-driven split. ✅
3. **Wardrobe state:** threaded across segments so outfits stay consistent within a context and only change when the story moves day/location/context. ✅
4. **Scene granularity:** permissive-but-bounded — the large majority of scenes directly depict the narration (`narrated`); a small, tagged minority are `bridge` shots (establishing / atmosphere / transition) that never introduce un-narrated plot. ✅
5. **Motion priority:** the splitter flags each scene `ambient` (default gentle drift) or `animate` (true motion), capped at ~1 in 10 for genuine peaks; `animate` scenes also get a short motion prompt reusing the hook format. ✅
