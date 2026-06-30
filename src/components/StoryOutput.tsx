"use client";

import { useState } from "react";
import type { Generation, Scene, VisualStatus } from "@/lib/types";
import type { WriteProgress } from "@/lib/useGeneration";

interface StoryOutputProps {
  generation: Generation;
  visualStatus: VisualStatus | null;
  sceneProgress: WriteProgress | null;
  scenesBySegment: Record<string, Scene[]> | null;
  errorMessage: string | null;
  onGenerateVisuals: () => void;
  onRegenerate: () => void;
}

/** End offset of `excerpt` within `text` (whitespace-tolerant), or null. */
function findExcerptEnd(text: string, excerpt: string): number | null {
  const needle = excerpt.trim();
  if (needle.length < 8) return null; // too short / empty (e.g. bridge shots)

  const exact = text.indexOf(needle);
  if (exact >= 0) return exact + needle.length;

  const toRegex = (s: string) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

  // Whitespace-tolerant match on the excerpt, then on just its head.
  for (const probe of [needle, needle.slice(0, 60).trim()]) {
    if (probe.length < 12) continue;
    try {
      const m = new RegExp(toRegex(probe)).exec(text);
      if (m) return m.index + m[0].length;
    } catch {
      // Ignore a malformed regex and fall through.
    }
  }
  return null;
}

type InlineNode =
  | { kind: "text"; text: string }
  | { kind: "scene"; scene: Scene };

/**
 * Interleave a segment's text with its scenes. Scenes are rendered in STRICT
 * ascending global-index order — never reordered. narrationExcerpt is only a
 * finer hint to advance the split point forward (placing a scene after its
 * paragraph); it can never move a scene earlier, so order is always 1,2,3…
 *
 * `scenes` MUST already be sorted ascending by global `index`.
 */
function buildSegmentNodes(text: string, scenes: Scene[]): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    const end = findExcerptEnd(text, scene.narrationExcerpt);
    // The split point may only move forward — this preserves index order even
    // when an excerpt matches earlier in the text or doesn't match at all.
    const at = end != null && end > cursor ? end : cursor;
    if (at > cursor) {
      nodes.push({ kind: "text", text: text.slice(cursor, at) });
      cursor = at;
    }
    nodes.push({ kind: "scene", scene });
  }
  if (cursor < text.length) {
    nodes.push({ kind: "text", text: text.slice(cursor) });
  }
  return nodes;
}

const VISUAL_STEPS: { key: VisualStatus; label: string }[] = [
  { key: "characters", label: "Characters" },
  { key: "scenes", label: "Scenes" },
  { key: "hooks", label: "Hooks" },
  { key: "thumbnail", label: "Thumbnail" },
  { key: "metadata", label: "Metadata" },
];

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "story"
  );
}

/**
 * C8 — Story Output. The finished narration plus the visual phase: a
 * "Generate visuals" kickoff, live per-section progress, and the assembled
 * Whisk-ready prompts (characters, scenes, hooks, thumbnail) + metadata, all
 * read from the live generation doc as they arrive.
 */
export default function StoryOutput({
  generation,
  visualStatus,
  sceneProgress,
  scenesBySegment,
  errorMessage,
  onGenerateVisuals,
  onRegenerate,
}: StoryOutputProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showInlineScenes, setShowInlineScenes] = useState(true);

  // Render segments in strict index order; the scene→segment mapping below also
  // relies on this order (generation.scenes was flattened segment-by-segment).
  const segments = [...generation.segments].sort((a, b) => a.index - b.index);
  const characters = generation.characters ?? [];
  const scenes = generation.scenes ?? [];
  const hooks = generation.hooks ?? [];
  const tags = generation.tags ?? [];
  const hashtags = generation.hashtags ?? [];
  const description = generation.description;
  const thumbnail = generation.thumbnailPrompt;
  const teaserLine = generation.teaserLine;
  const suggestedHookCount = generation.suggestedHookCount || hooks.length;
  const visibleHooks = hooks.slice(0, suggestedHookCount);

  // Scenes carry a global index; dedupe + sort defensively.
  const uniqueScenes = [
    ...new Map(scenes.map((s) => [s.index, s])).values(),
  ].sort((a, b) => a.index - b.index);

  // Map each global scene index → its source segment, and group scenes by
  // segment. generation.scenes is the flatten of scenesBySegment in segment
  // order, so segment membership follows the per-segment counts.
  const sceneToSegment = new Map<number, number>();
  const scenesForSegment = new Map<number, Scene[]>();
  if (scenesBySegment) {
    let g = 0;
    for (const seg of segments) {
      const count = scenesBySegment[String(seg.index)]?.length ?? 0;
      const group: Scene[] = [];
      for (let k = 0; k < count; k++) {
        const scene = uniqueScenes.find((s) => s.index === g);
        if (scene) {
          sceneToSegment.set(g, seg.index);
          group.push(scene);
        }
        g++;
      }
      // Strictly ascending by global index (built in order, sorted defensively).
      group.sort((a, b) => a.index - b.index);
      scenesForSegment.set(seg.index, group);
    }
  }
  // Any scenes we couldn't attribute to a segment (shouldn't happen).
  const orphanScenes = uniqueScenes.filter((s) => !sceneToSegment.has(s.index));
  const hasInlineScenes = uniqueScenes.length > 0;

  const visualsStarted = visualStatus != null;
  const visualsDone = visualStatus === "done";
  const visualsError = visualStatus === "error";
  const activeStep = visualStatus
    ? VISUAL_STEPS.findIndex((s) => s.key === visualStatus)
    : -1;

  const storyText = `${generation.title}\n\n${generation.segments
    .map((s) => s.text)
    .join("\n\n")}`;

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — fail quietly.
    }
  }
  const label = (key: string, base: string) =>
    copiedKey === key ? "Copied" : base;

  function handleDownload() {
    const markdown = `# ${generation.title}\n\n${generation.segments
      .map((s) => s.text)
      .join("\n\n")}\n`;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(generation.title)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const loading = (key: VisualStatus, hasData: boolean) =>
    visualStatus === key && !hasData;

  return (
    <div className="md:h-full md:overflow-y-auto">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3 sm:px-8">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-faint">
            Manuscript
          </span>
          <div className="flex items-center gap-1">
            <BarButton onClick={() => copy("story", storyText)}>
              {label("story", "Copy")}
            </BarButton>
            <BarButton onClick={handleDownload}>Download</BarButton>
            <BarButton onClick={onRegenerate}>Regenerate</BarButton>
          </div>
        </div>
      </div>

      <article className="mx-auto max-w-2xl px-6 pb-20 pt-10 sm:px-8">
        <header>
          <div className="flex flex-wrap gap-2">
            <Badge>{generation.wordCount.toLocaleString()} words</Badge>
            <Badge>{generation.durationMinutes} min</Badge>
          </div>
          <h1 className="mt-5 font-display text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
            {generation.title}
          </h1>
        </header>

        {/* Inline-scenes toggle (only once scenes exist) */}
        {hasInlineScenes && (
          <div className="mt-8 flex items-center justify-end">
            <button
              type="button"
              role="switch"
              aria-checked={showInlineScenes}
              onClick={() => setShowInlineScenes((v) => !v)}
              className="flex items-center gap-2.5"
            >
              <span className="text-sm text-muted">Show inline scenes</span>
              <span
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  showInlineScenes ? "bg-petrol" : "bg-ink/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                    showInlineScenes ? "left-4.5" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          </div>
        )}

        {/* Body — narration with each scene anchored to the passage it illustrates */}
        <div className="mt-6">
          {segments.map((segment, i) => {
            const segScenes = scenesForSegment.get(segment.index) ?? [];
            const nodes =
              hasInlineScenes && showInlineScenes
                ? buildSegmentNodes(segment.text, segScenes)
                : [{ kind: "text" as const, text: segment.text }];
            return (
              <div key={segment.index}>
                {i > 0 && <SegmentDivider index={segment.index} />}
                {nodes.map((node, ni) =>
                  node.kind === "text" ? (
                    <p
                      key={ni}
                      className="font-reading text-lg leading-[1.8] text-ink/90 whitespace-pre-line"
                    >
                      {node.text}
                    </p>
                  ) : (
                    <InlineScene
                      key={`scene-${node.scene.index}`}
                      scene={node.scene}
                      segmentLabel={(sceneToSegment.get(node.scene.index) ?? segment.index) + 1}
                      copied={copiedKey === `iscene-${node.scene.index}`}
                      onCopy={() =>
                        copy(`iscene-${node.scene.index}`, node.scene.imagePrompt)
                      }
                    />
                  ),
                )}
              </div>
            );
          })}
          {hasInlineScenes && showInlineScenes && orphanScenes.length > 0 && (
            <div className="mt-6">
              {orphanScenes.map((scene) => (
                <InlineScene
                  key={`scene-${scene.index}`}
                  scene={scene}
                  segmentLabel={null}
                  copied={copiedKey === `iscene-${scene.index}`}
                  onCopy={() => copy(`iscene-${scene.index}`, scene.imagePrompt)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Visual phase ─────────────────────────────────────────── */}
        <section className="mt-16 border-t border-line pt-8">
          {!visualsStarted ? (
            <div className="flex flex-col items-start gap-3">
              <SectionLabel>Visuals</SectionLabel>
              <p className="text-sm leading-relaxed text-muted">
                Turn the finished story into Whisk-ready image prompts —
                characters, scenes, hooks, a thumbnail, and metadata.
              </p>
              <button
                type="button"
                onClick={onGenerateVisuals}
                className="mt-1 rounded-md bg-petrol px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-petrol-bright"
              >
                Generate visuals
              </button>
            </div>
          ) : (
            <>
              <VisualProgress
                activeStep={activeStep}
                done={visualsDone}
                error={visualsError}
                sceneProgress={sceneProgress}
              />
              {visualsError && (
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  {errorMessage ?? "The visual phase hit a problem."}{" "}
                  <button
                    type="button"
                    onClick={onGenerateVisuals}
                    className="font-medium text-petrol hover:text-petrol-bright"
                  >
                    Retry
                  </button>
                </p>
              )}
            </>
          )}
        </section>

        {/* Characters */}
        {visualsStarted &&
          (characters.length > 0 || loading("characters", characters.length > 0)) && (
            <section className="mt-10 border-t border-line pt-8">
              <SectionHead
                title="Characters"
                action={
                  characters.length > 0 && (
                    <GhostButton
                      onClick={() =>
                        copy(
                          "chars",
                          characters.map((c) => c.referencePrompt).join("\n\n"),
                        )
                      }
                    >
                      {label("chars", "Copy all")}
                    </GhostButton>
                  )
                }
              />
              {characters.length === 0 ? (
                <LoadingNote>Designing character references…</LoadingNote>
              ) : (
                <div className="mt-3 flex flex-col gap-3">
                  {characters.map((c, i) => (
                    <div
                      key={c.name}
                      className="rounded-md border border-line bg-surface/60 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-ink">
                            {c.name}
                          </div>
                          {c.role && (
                            <div className="text-xs text-muted">{c.role}</div>
                          )}
                        </div>
                        <GhostButton
                          onClick={() => copy(`char-${i}`, c.referencePrompt)}
                        >
                          {label(`char-${i}`, "Copy")}
                        </GhostButton>
                      </div>
                      <p className="mt-2 font-mono text-xs leading-relaxed text-muted">
                        {c.referencePrompt}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

        {/* Scenes */}
        {visualsStarted &&
          (uniqueScenes.length > 0 ||
            loading("scenes", uniqueScenes.length > 0)) && (
            <section className="mt-10 border-t border-line pt-8">
              <SectionHead
                title={`Scene prompts${uniqueScenes.length ? ` · ${uniqueScenes.length}` : ""}`}
                action={
                  uniqueScenes.length > 0 && (
                    <GhostButton
                      onClick={() =>
                        copy(
                          "scenes",
                          uniqueScenes
                            .map((s) => `Scene ${s.index + 1}: ${s.imagePrompt}`)
                            .join("\n\n"),
                        )
                      }
                    >
                      {label("scenes", "Copy all")}
                    </GhostButton>
                  )
                }
              />
              {uniqueScenes.length > 0 && (
                <p className="mt-1 text-xs text-faint">
                  Flat batch list for pasting into Whisk.
                </p>
              )}
              {uniqueScenes.length === 0 ? (
                <LoadingNote>
                  Splitting scenes…
                  {sceneProgress
                    ? ` Segment ${sceneProgress.current} of ${sceneProgress.total}`
                    : ""}
                </LoadingNote>
              ) : (
                <ol className="mt-4 flex flex-col gap-3 font-mono text-xs leading-relaxed">
                  {uniqueScenes.map((s) => (
                    <li key={s.index} className="text-muted">
                      <span className="text-petrol">Scene {s.index + 1}:</span>{" "}
                      {s.imagePrompt}
                      {s.motionPriority === "animate" && s.motion && (
                        <div className="mt-1 text-faint">Motion: {s.motion}</div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}

        {/* Hooks */}
        {visualsStarted &&
          (visibleHooks.length > 0 || loading("hooks", visibleHooks.length > 0)) && (
            <section className="mt-10 border-t border-line pt-8">
              <SectionHead
                title="Intro / Hook scenes"
                action={
                  visibleHooks.length > 0 && (
                    <GhostButton
                      onClick={() =>
                        copy(
                          "hooks",
                          visibleHooks
                            .map((h, i) => `Hook ${i + 1}: ${h.imagePrompt}`)
                            .join("\n\n"),
                        )
                      }
                    >
                      {label("hooks", "Copy all")}
                    </GhostButton>
                  )
                }
              />
              {visibleHooks.length === 0 ? (
                <LoadingNote>Designing the cold open…</LoadingNote>
              ) : (
                <>
                  {teaserLine && (
                    <p className="mt-3 font-reading text-base italic leading-relaxed text-ink">
                      “{teaserLine}”
                    </p>
                  )}
                  <div className="mt-3 flex flex-col gap-3">
                    {visibleHooks.map((h, i) => (
                      <div
                        key={h.index}
                        className="rounded-md border border-line bg-surface/60 px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-petrol">
                            Hook {i + 1}
                          </span>
                          <GhostButton onClick={() => copy(`hook-${i}`, h.imagePrompt)}>
                            {label(`hook-${i}`, "Copy")}
                          </GhostButton>
                        </div>
                        <p className="mt-1.5 font-mono text-xs leading-relaxed text-muted">
                          {h.imagePrompt}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>
          )}

        {/* Thumbnail */}
        {visualsStarted && (thumbnail || loading("thumbnail", !!thumbnail)) && (
          <section className="mt-10 border-t border-line pt-8">
            <SectionHead
              title="Thumbnail"
              action={
                thumbnail && (
                  <GhostButton onClick={() => copy("thumb", thumbnail)}>
                    {label("thumb", "Copy")}
                  </GhostButton>
                )
              }
            />
            {!thumbnail ? (
              <LoadingNote>Composing the thumbnail…</LoadingNote>
            ) : (
              <div className="mt-3 rounded-md border border-line bg-surface/60 px-4 py-3">
                <p className="font-mono text-xs leading-relaxed text-muted">
                  {thumbnail}
                </p>
              </div>
            )}
          </section>
        )}

        {/* Metadata */}
        {visualsStarted &&
          (description ||
            tags.length > 0 ||
            hashtags.length > 0 ||
            loading("metadata", !!description)) && (
            <section className="mt-10 border-t border-line pt-8">
              <SectionLabel>Metadata</SectionLabel>
              {!description &&
              tags.length === 0 &&
              hashtags.length === 0 ? (
                <LoadingNote>Writing description, tags & hashtags…</LoadingNote>
              ) : (
                <div className="mt-4 flex flex-col gap-7">
                  {description && (
                    <div>
                      <SectionHead
                        title="Description"
                        action={
                          <GhostButton
                            onClick={() => copy("description", description)}
                          >
                            {label("description", "Copy")}
                          </GhostButton>
                        }
                      />
                      <p className="mt-3 text-sm leading-relaxed text-muted">
                        {description}
                      </p>
                    </div>
                  )}
                  {tags.length > 0 && (
                    <div>
                      <SectionHead
                        title="Tags"
                        action={
                          <GhostButton
                            onClick={() => copy("tags", tags.join(", "))}
                          >
                            {label("tags", "Copy all")}
                          </GhostButton>
                        }
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {hashtags.length > 0 && (
                    <div>
                      <SectionHead
                        title="Hashtags"
                        action={
                          <GhostButton
                            onClick={() => copy("hashtags", hashtags.join(" "))}
                          >
                            {label("hashtags", "Copy all")}
                          </GhostButton>
                        }
                      />
                      <div className="mt-3 flex flex-wrap gap-2">
                        {hashtags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-petrol/10 px-2.5 py-1 font-mono text-xs text-petrol"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
      </article>
    </div>
  );
}

/** An image-prompt block anchored inline next to the narration it illustrates. */
function InlineScene({
  scene,
  segmentLabel,
  copied,
  onCopy,
}: {
  scene: Scene;
  segmentLabel: number | null;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="my-5 rounded-md border border-line border-l-2 border-l-petrol bg-surface/50 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-petrol">
          Scene {scene.index + 1}
          {segmentLabel != null && (
            <span className="ml-2 text-faint">S{segmentLabel}</span>
          )}
        </span>
        <GhostButton onClick={onCopy}>{copied ? "Copied" : "Copy"}</GhostButton>
      </div>
      <p className="mt-1.5 font-mono text-xs leading-relaxed text-muted">
        {scene.imagePrompt}
      </p>
      {scene.motionPriority === "animate" && scene.motion && (
        <div className="mt-1 font-mono text-xs text-faint">
          Motion: {scene.motion}
        </div>
      )}
    </div>
  );
}

/** A faint, minimally labelled break between segments. */
function SegmentDivider({ index }: { index: number }) {
  return (
    <div className="my-9 flex items-center gap-3" aria-hidden>
      <span className="h-px flex-1 bg-line" />
      <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        Segment {index + 1}
      </span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function VisualProgress({
  activeStep,
  done,
  error,
  sceneProgress,
}: {
  activeStep: number;
  done: boolean;
  error: boolean;
  sceneProgress: WriteProgress | null;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionLabel>Visuals</SectionLabel>
        {done && (
          <span className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-petrol">
            Ready
          </span>
        )}
      </div>
      <ol className="mt-3 flex flex-wrap gap-x-2 gap-y-2">
        {VISUAL_STEPS.map((step, i) => {
          const isDone = done || (!error && i < activeStep);
          const isActive = !done && !error && i === activeStep;
          const showScenes = isActive && step.key === "scenes" && sceneProgress;
          return (
            <li
              key={step.key}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
                isActive
                  ? "border-petrol bg-petrol/10 text-ink"
                  : isDone
                    ? "border-line text-muted"
                    : "border-line text-faint"
              }`}
            >
              <span aria-hidden>{isDone ? "✓" : isActive ? "●" : "○"}</span>
              {step.label}
              {showScenes && (
                <span className="font-mono text-[0.65rem] tabular-nums text-petrol">
                  {sceneProgress!.current}/{sceneProgress!.total}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function LoadingNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-2 text-sm text-faint">
      <span
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-petrol"
        aria-hidden
      />
      {children}
    </p>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-faint">
      {children}
    </span>
  );
}

function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-sm font-medium text-ink">{title}</h3>
      {action}
    </div>
  );
}

function GhostButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-md border border-line px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-petrol/50 hover:text-petrol"
    >
      {children}
    </button>
  );
}

function BarButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-petrol"
    >
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted">
      {children}
    </span>
  );
}
