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

type Tab =
  | "script"
  | "characters"
  | "scenes"
  | "hooks"
  | "thumbnail"
  | "metadata";

/** End offset of `excerpt` within `text` (whitespace-tolerant), or null. */
function findExcerptEnd(text: string, excerpt: string): number | null {
  const needle = excerpt.trim();
  if (needle.length < 8) return null; // too short / empty (e.g. bridge shots)

  const exact = text.indexOf(needle);
  if (exact >= 0) return exact + needle.length;

  const toRegex = (s: string) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");

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
 * Interleave a segment's text with its scenes, in STRICT ascending global-index
 * order. narrationExcerpt is only a finer hint to advance the split point
 * forward; it can never move a scene earlier. `scenes` MUST be index-sorted.
 */
function buildSegmentNodes(text: string, scenes: Scene[]): InlineNode[] {
  const nodes: InlineNode[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    const end = findExcerptEnd(text, scene.narrationExcerpt);
    const at = end != null && end > cursor ? end : cursor;
    if (at > cursor) {
      nodes.push({ kind: "text", text: text.slice(cursor, at) });
      cursor = at;
    }
    nodes.push({ kind: "scene", scene });
  }
  if (cursor < text.length) nodes.push({ kind: "text", text: text.slice(cursor) });
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
 * C8 — Story Output. A tabbed view over the finished deliverable: the script,
 * and (once visuals run) the character refs, scene prompts, trailer, thumbnail,
 * and metadata. Long tabs use collapsible groups to stay navigable.
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
  const [tab, setTab] = useState<Tab>("script");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showInlineScenes, setShowInlineScenes] = useState(true);

  const segments = [...generation.segments].sort((a, b) => a.index - b.index);
  const characters = generation.characters ?? [];
  const scenes = generation.scenes ?? [];
  const hooks = generation.hooks ?? [];
  const tags = generation.tags ?? [];
  const hashtags = generation.hashtags ?? [];
  const description = generation.description;
  const thumbnail = generation.thumbnailPrompt;
  const suggestedHookCount = generation.suggestedHookCount || hooks.length;
  const visibleHooks = hooks.slice(0, suggestedHookCount);

  const uniqueScenes = [
    ...new Map(scenes.map((s) => [s.index, s])).values(),
  ].sort((a, b) => a.index - b.index);

  // Map each global scene index → its source segment (scenesBySegment counts,
  // in segment order, mirror the flatten that produced generation.scenes).
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
      group.sort((a, b) => a.index - b.index);
      scenesForSegment.set(seg.index, group);
    }
  }
  const orphanScenes = uniqueScenes.filter((s) => !sceneToSegment.has(s.index));
  const hasInlineScenes = uniqueScenes.length > 0;

  const visualsStarted = visualStatus != null;
  const visualsDone = visualStatus === "done";
  const visualsError = visualStatus === "error";
  const activeStep = visualStatus
    ? VISUAL_STEPS.findIndex((s) => s.key === visualStatus)
    : -1;

  const storyText = `${generation.title}\n\n${segments.map((s) => s.text).join("\n\n")}`;

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
    const markdown = `# ${generation.title}\n\n${segments.map((s) => s.text).join("\n\n")}\n`;
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

  function jumpToSegment(i: number) {
    const seg = segments[i];
    if (!seg) return;
    document
      .getElementById(`seg-${seg.index}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "script", label: "Script" },
    { key: "characters", label: "Characters", count: characters.length || undefined },
    { key: "scenes", label: "Scenes", count: uniqueScenes.length || undefined },
    { key: "hooks", label: "Hooks", count: visibleHooks.length || undefined },
    { key: "thumbnail", label: "Thumbnail" },
    { key: "metadata", label: "Metadata" },
  ];

  // Shared shell for the visual tabs: kickoff CTA before generation, progress +
  // retry while running, then the tab's own content.
  const visualTab = (produces: string, content: React.ReactNode) => {
    if (!visualsStarted) {
      return <VisualsCTA produces={produces} onGenerate={onGenerateVisuals} />;
    }
    return (
      <div className="flex flex-col gap-6">
        {!visualsDone && (
          <VisualProgress
            activeStep={activeStep}
            error={visualsError}
            sceneProgress={sceneProgress}
          />
        )}
        {visualsError && (
          <p className="text-sm leading-relaxed text-muted">
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
        {content}
      </div>
    );
  };

  return (
    <div className="md:h-full md:overflow-y-auto">
      {/* Sticky header: action bar + tab strip */}
      <div className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto max-w-2xl px-6 sm:px-8">
          <div className="flex items-center justify-between py-3">
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
          <div className="-mb-px flex gap-1 overflow-x-auto">
            {tabs.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  aria-current={active}
                  className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                    active
                      ? "border-petrol font-medium text-ink"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  {t.label}
                  {typeof t.count === "number" && (
                    <span className="ml-1.5 font-mono text-[0.65rem] text-faint">
                      {t.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <article className="mx-auto max-w-2xl px-6 pb-20 pt-8 sm:px-8">
        {/* ── Script ─────────────────────────────────────────────── */}
        {tab === "script" && (
          <>
            <header>
              <div className="flex flex-wrap gap-2">
                <Badge>{generation.wordCount.toLocaleString()} words</Badge>
                <Badge>{generation.durationMinutes} min</Badge>
                <Badge>{segments.length} segments</Badge>
              </div>
              <h1 className="mt-5 font-display text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
                {generation.title}
              </h1>
            </header>

            <SegmentJumpNav count={segments.length} onJump={jumpToSegment} />

            {hasInlineScenes && (
              <div className="mt-6 flex items-center justify-end">
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

            <div className="mt-6">
              {segments.map((segment, i) => {
                const segScenes = scenesForSegment.get(segment.index) ?? [];
                const nodes =
                  hasInlineScenes && showInlineScenes
                    ? buildSegmentNodes(segment.text, segScenes)
                    : [{ kind: "text" as const, text: segment.text }];
                return (
                  <div
                    key={segment.index}
                    id={`seg-${segment.index}`}
                    className="scroll-mt-28"
                  >
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
                        <InlineSceneChip
                          key={`scene-${node.scene.index}`}
                          scene={node.scene}
                          segmentLabel={
                            (sceneToSegment.get(node.scene.index) ?? segment.index) + 1
                          }
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
                    <InlineSceneChip
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
          </>
        )}

        {/* ── Characters ─────────────────────────────────────────── */}
        {tab === "characters" &&
          visualTab(
            "the character references",
            characters.length > 0 ? (
              <div>
                <div className="flex items-center justify-end">
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
                </div>
                <div className="mt-3 flex flex-col gap-3">
                  {characters.map((c, i) => (
                    <div
                      key={c.name}
                      className="rounded-md border border-line bg-surface/60 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-ink">{c.name}</div>
                          {c.role && (
                            <div className="text-xs text-muted">{c.role}</div>
                          )}
                        </div>
                        <GhostButton onClick={() => copy(`char-${i}`, c.referencePrompt)}>
                          {label(`char-${i}`, "Copy")}
                        </GhostButton>
                      </div>
                      <p className="mt-2 font-mono text-xs leading-relaxed text-muted">
                        {c.referencePrompt}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : loading("characters", characters.length > 0) ? (
              <LoadingNote>Designing character references…</LoadingNote>
            ) : null,
          )}

        {/* ── Scenes (grouped by segment) ────────────────────────── */}
        {tab === "scenes" &&
          visualTab(
            "the scene image prompts",
            uniqueScenes.length > 0 ? (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-faint">
                    Grouped by segment · Copy-all pastes the flat list for Whisk.
                  </p>
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
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  {segments.map((seg) => {
                    const grp = scenesForSegment.get(seg.index) ?? [];
                    if (grp.length === 0) return null;
                    return (
                      <SceneGroup
                        key={seg.index}
                        segmentIndex={seg.index}
                        scenes={grp}
                      />
                    );
                  })}
                  {orphanScenes.length > 0 && (
                    <SceneGroup segmentIndex={null} scenes={orphanScenes} />
                  )}
                </div>
              </div>
            ) : loading("scenes", uniqueScenes.length > 0) ? (
              <LoadingNote>
                Splitting scenes…
                {sceneProgress
                  ? ` Segment ${sceneProgress.current} of ${sceneProgress.total}`
                  : ""}
              </LoadingNote>
            ) : null,
          )}

        {/* ── Hooks (trailer) ────────────────────────────────────── */}
        {tab === "hooks" &&
          visualTab(
            "the trailer / cold open",
            visibleHooks.length > 0 ? (
              <div>
                <div className="flex items-center justify-end">
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
                </div>
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

                      <div className="mt-2 flex items-start justify-between gap-3">
                        <p className="font-reading text-base leading-relaxed text-ink">
                          “{h.voiceover}”
                        </p>
                        <span
                          className={`mt-1 shrink-0 rounded-full px-2 py-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] ${
                            h.voiceoverSource === "story"
                              ? "bg-petrol/10 text-petrol"
                              : "border border-line text-faint"
                          }`}
                        >
                          {h.voiceoverSource}
                        </span>
                      </div>

                      {h.moment && (
                        <p className="mt-1 text-xs italic leading-relaxed text-faint">
                          {h.moment}
                        </p>
                      )}

                      <p className="mt-2.5 font-mono text-xs leading-relaxed text-muted">
                        {h.imagePrompt}
                      </p>
                      {h.motion && (
                        <div className="mt-1 font-mono text-xs text-faint">
                          Motion: {h.motion}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : loading("hooks", visibleHooks.length > 0) ? (
              <LoadingNote>Cutting the trailer…</LoadingNote>
            ) : null,
          )}

        {/* ── Thumbnail ──────────────────────────────────────────── */}
        {tab === "thumbnail" &&
          visualTab(
            "the thumbnail prompt",
            thumbnail ? (
              <div>
                <div className="flex items-center justify-end">
                  <GhostButton onClick={() => copy("thumb", thumbnail)}>
                    {label("thumb", "Copy")}
                  </GhostButton>
                </div>
                <div className="mt-3 rounded-md border border-line bg-surface/60 px-4 py-3">
                  <p className="font-mono text-xs leading-relaxed text-muted">
                    {thumbnail}
                  </p>
                </div>
              </div>
            ) : loading("thumbnail", !!thumbnail) ? (
              <LoadingNote>Composing the thumbnail…</LoadingNote>
            ) : null,
          )}

        {/* ── Metadata ───────────────────────────────────────────── */}
        {tab === "metadata" &&
          visualTab(
            "the description, tags & hashtags",
            description || tags.length > 0 || hashtags.length > 0 ? (
              <div className="flex flex-col gap-7">
                {description && (
                  <div>
                    <SectionHead
                      title="Description"
                      action={
                        <GhostButton onClick={() => copy("description", description)}>
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
                        <GhostButton onClick={() => copy("tags", tags.join(", "))}>
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
                        <GhostButton onClick={() => copy("hashtags", hashtags.join(" "))}>
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
            ) : loading("metadata", !!description) ? (
              <LoadingNote>Writing description, tags &amp; hashtags…</LoadingNote>
            ) : null,
          )}
      </article>
    </div>
  );
}

/** Compact "jump to segment" nav for the long Script tab. */
function SegmentJumpNav({
  count,
  onJump,
}: {
  count: number;
  onJump: (i: number) => void;
}) {
  if (count <= 1) return null;
  return (
    <div className="mt-6 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 font-mono text-[0.6rem] uppercase tracking-[0.2em] text-faint">
        Jump
      </span>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onJump(i)}
          className="rounded border border-line px-2 py-0.5 font-mono text-[0.65rem] text-muted transition-colors hover:border-petrol/50 hover:text-petrol"
        >
          S{i + 1}
        </button>
      ))}
    </div>
  );
}

/** A collapsed inline scene chip that expands to reveal the image prompt. */
function InlineSceneChip({
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
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="my-3 flex items-center gap-1.5 rounded-md border border-line border-l-2 border-l-petrol bg-surface/40 px-3 py-1.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-petrol transition-colors hover:bg-surface/70"
      >
        <span aria-hidden>▸</span> Scene {scene.index + 1}
        {segmentLabel != null && (
          <span className="text-faint">· S{segmentLabel}</span>
        )}
      </button>
    );
  }

  return (
    <div className="my-4 rounded-md border border-line border-l-2 border-l-petrol bg-surface/50 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-petrol"
        >
          <span aria-hidden>▾</span> Scene {scene.index + 1}
          {segmentLabel != null && (
            <span className="text-faint">· S{segmentLabel}</span>
          )}
        </button>
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

/** A collapsible group of a segment's scenes for the Scenes tab. */
function SceneGroup({
  segmentIndex,
  scenes,
}: {
  segmentIndex: number | null;
  scenes: Scene[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <span className="text-sm font-medium text-ink">
          {segmentIndex != null ? `Segment ${segmentIndex + 1}` : "Unassigned"}
          <span className="ml-2 text-xs font-normal text-faint">
            · {scenes.length} scene{scenes.length === 1 ? "" : "s"}
          </span>
        </span>
        <Chevron open={open} />
      </button>
      {open && (
        <ol className="flex flex-col gap-3 border-t border-line px-4 py-3 font-mono text-xs leading-relaxed">
          {scenes.map((s) => (
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
    </div>
  );
}

function VisualsCTA({
  produces,
  onGenerate,
}: {
  produces: string;
  onGenerate: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm leading-relaxed text-muted">
        Generate visuals to produce {produces} — the character references, scene
        prompts, trailer, thumbnail, and metadata.
      </p>
      <button
        type="button"
        onClick={onGenerate}
        className="rounded-md bg-petrol px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-petrol-bright"
      >
        Generate visuals
      </button>
    </div>
  );
}

function VisualProgress({
  activeStep,
  error,
  sceneProgress,
}: {
  activeStep: number;
  error: boolean;
  sceneProgress: WriteProgress | null;
}) {
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-2">
      {VISUAL_STEPS.map((step, i) => {
        const isDone = !error && i < activeStep;
        const isActive = !error && i === activeStep;
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
  );
}

function LoadingNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-faint">
      <span
        className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-petrol"
        aria-hidden
      />
      {children}
    </p>
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`h-4 w-4 shrink-0 text-faint transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
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
