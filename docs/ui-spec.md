# Story Engine — UI Structure Spec

Scope of this doc: the **input** (title + transcript + controls) and the **outputs**, plus the connective states between them. Deep functionality (auth, history, images/tags) is parked. Each component below is a discrete **Magic MCP generation target** — generate them one at a time, let your UI/UX skill own the visual direction.

---

## Layout pattern

**Two-column workspace** (collapses to stacked on mobile):

```
┌─────────────────────────┬──────────────────────────────────┐
│  LEFT — Source & Controls│  RIGHT — Results canvas          │
│                          │                                  │
│  • Title input           │  swaps between 4 states:         │
│  • Transcript input      │   1. Empty / hint                │
│  • Duration              │   2. Blueprint review            │
│  • Premise-distance dial │   3. Generating (progress)       │
│  • Advanced (optional)   │   4. Story output                │
│  • Generate button       │                                  │
└─────────────────────────┴──────────────────────────────────┘
```

The left column stays put; the right column is a state machine. This reads like a "studio" and keeps the long generation visible without losing the inputs.

**Flow:** `Input → Generate → Blueprint Review → Approve → Generating → Output`

---

## Components (each = one Magic MCP prompt)

### C1 — Source Input Panel
**Purpose:** capture the research material.
- **Title field** — single line, labelled "Source video title", placeholder hint that this is research, not copied.
- **Transcript field** — large auto-growing textarea, labelled "Paste transcript", live word/character counter, clear button.
- **Validation:** Generate disabled until transcript has a sensible minimum (e.g. ≥300 words); inline hint if too short.

> *MCP seed:* "A clean input panel with a single-line title field and a large auto-resizing transcript textarea below it. Show a live word count in the bottom-right of the textarea and a small clear button. Subtle labels, generous padding, calm."

### C2 — Duration Selector
**Purpose:** pick output length (drives word target).
- Options: **30 / 45 / 60 / 75 / 90 min** — segmented control or labelled slider with 5 stops.
- Show derived est. word count beneath (e.g. "~8,400 words") so the choice feels concrete.
- Default: 45 min.

> *MCP seed:* "A 5-stop segmented duration selector (30, 45, 60, 75, 90 minutes). Selected stop highlighted. A small caption below updates to show the estimated word count for the selected duration."

### C3 — Premise-Distance Dial
**Purpose:** how far the new story travels from the source.
- 5 levels with labels: **Twin · Sibling · Cousin · Distant · Format-only**.
- Slider or 5 pips; show a one-line description of the selected level beneath.
- Default: Sibling (2).

> *MCP seed:* "A 5-point labelled slider going from 'Twin' to 'Format-only'. Below it, a single line of helper text that updates to describe the currently selected level."

### C4 — Advanced (collapsible)
**Purpose:** optional power-user inputs, hidden by default to keep the panel calm.
- **Premise seed** — optional textarea: "Have your own idea? (optional)".
- **Style sample** — optional textarea: "Paste a writing sample to match its style (optional)".

> *MCP seed:* "A collapsible 'Advanced' section with two optional textareas: 'Your premise idea' and 'Style sample to match'. Collapsed by default with a subtle expand chevron."

### C5 — Generate Button
- Primary CTA, full-width at the bottom of the left column.
- States: default / disabled (with reason tooltip) / loading.

> *MCP seed:* "A prominent full-width primary button labelled 'Generate story'. Disabled and loading states included; loading shows a spinner and 'Working…'."

### C6 — Blueprint Review (right column, state 2)
**Purpose:** the cheap-to-regenerate gate before the expensive long generation. **This is the key UX safeguard** — it lets users fix direction before spending the big tokens.
- **Title options** — 5 cards/chips, single-select.
- **Logline + premise** — short readable block.
- **Segment outline** — ordered list of beats with their goals (collapsible).
- Actions: **Approve & write** (primary), **Regenerate blueprint**, optional inline edit of premise.

> *MCP seed:* "A review card showing 5 selectable title options as chips at top, then a logline and premise paragraph, then a numbered list of story beats. Footer has a primary 'Approve & write' button and a secondary 'Regenerate' button."

### C7 — Generation Progress (right column, state 3)
**Purpose:** make a multi-minute background job feel alive and trustworthy.
- **Stage stepper:** Analyzing → Planning → Writing.
- **Segment progress:** "Segment 4 of 11" with a bar.
- **Live build:** completed segments stream in below as readable text (the story visibly grows).
- **Cancel** button.

> *MCP seed:* "A generation progress view: a horizontal stepper (Analyzing, Planning, Writing), a progress bar with 'Segment X of N', and below it a scrolling area where finished story text appears progressively. A subtle cancel button."

### C8 — Story Output (right column, state 4)
**Purpose:** the deliverable.
- **Header:** chosen title (large), badges for word count + est. duration.
- **Body:** the full narration in comfortable reading typography (serif body, generous line-height, readable measure). Optional segment dividers / jump-to-segment.
- **Actions bar:** Copy all · Download (.txt / .md) · Regenerate · (later, disabled) Generate images / tags / description.
- Future-proof: leave structured empty slots for **description / tags / scenes** so they bolt in without relayout.

> *MCP seed:* "A long-form reading view: large title, small badges for word count and duration, then the story body in elegant serif reading typography with comfortable line spacing. A sticky action bar with Copy, Download, and Regenerate. Reserve subtle placeholder sections labelled 'Description', 'Tags', 'Scenes' marked coming soon."

### C9 — Empty / Hint State (right column, state 1)
- Friendly placeholder before first generation: one line on what to do ("Paste a transcript and title, then generate").

> *MCP seed:* "A calm empty-state for the results panel with a simple illustration or icon and one line of guidance."

---

## States to handle (don't skip these)
- **Empty** (no input yet) · **Invalid** (transcript too short) · **Loading blueprint** · **Blueprint ready** · **Generating** (with live progress) · **Error** (retry) · **Done**.
- Generation is a **background job** — the UI must survive a refresh / reconnect (poll or subscribe to job status). Design C7 assuming the user might leave and come back.

---

## Build order (suggested)
1. Layout shell + C1 (input) + C9 (empty) — get the skeleton standing.
2. C2, C3, C5 (controls + generate) — the full input side.
3. C8 (output) wired to mock data — see the payoff early.
4. C6 (blueprint) + C7 (progress) — the connective long-job flow.
5. C4 (advanced) — last, it's optional.

Build C8 against fake data first; it's the most motivating piece to see, and it locks the output schema before you wire the real pipeline.