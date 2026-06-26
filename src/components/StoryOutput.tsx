"use client";

import { useState } from "react";
import type { Generation } from "@/lib/types";

interface StoryOutputProps {
  generation: Generation;
  onRegenerate: () => void;
}

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
 * C8 — Story Output. The deliverable, organised into three collapsible
 * clusters: SCRIPT (title, hooks, scene-labelled body), VISUALS (character
 * references, scene image prompts, thumbnail), and METADATA (description,
 * tags, hashtags). Full-story Copy and Download cover narration only.
 */
export default function StoryOutput({
  generation,
  onRegenerate,
}: StoryOutputProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showPrompts, setShowPrompts] = useState(true);
  const [showAllHooks, setShowAllHooks] = useState(false);
  const [selectedHook, setSelectedHook] = useState(0);

  const { segments, characters, description, hooks } = generation;
  const tags = generation.tags ?? [];
  // Default to the AI's suggested count; "Show all" reveals the rest.
  const suggestedHookCount = Math.min(
    generation.suggestedHookCount,
    hooks.length,
  );
  const visibleHooks = showAllHooks
    ? hooks
    : hooks.slice(0, suggestedHookCount);

  // Narration only — every kind of image prompt is excluded.
  const storyText = `${generation.title}\n\n${segments
    .map((s) => s.text)
    .join("\n\n")}`;

  const allScenePrompts = segments
    .map((s, i) => `Scene ${i + 1}: ${s.imagePrompt}`)
    .join("\n\n");
  const allCharacterPrompts = characters
    .map((c) => `${c.name}: ${c.imagePrompt}`)
    .join("\n\n");

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
    const markdown = `# ${generation.title}\n\n${segments
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

      <article className="mx-auto max-w-2xl px-6 pb-20 sm:px-8">
        {/* ── SCRIPT ─────────────────────────────────────────────── */}
        <Cluster label="Script">
          <div className="flex flex-wrap gap-2">
            <Badge>{generation.wordCount.toLocaleString()} words</Badge>
            <Badge>{generation.durationMinutes} min</Badge>
            <Badge>{segments.length} scenes</Badge>
          </div>
          <h1 className="mt-5 font-display text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
            {generation.title}
          </h1>

          {/* Hooks */}
          <div className="mt-9">
            <SubHead
              title="Hooks"
              action={
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-faint">
                    AI-suggested: {suggestedHookCount}
                  </span>
                  {hooks.length > suggestedHookCount && (
                    <GhostButton onClick={() => setShowAllHooks((v) => !v)}>
                      {showAllHooks ? "Show fewer" : `Show all ${hooks.length}`}
                    </GhostButton>
                  )}
                </div>
              }
            />
            <div className="mt-3 flex flex-col gap-2">
              {visibleHooks.map((hook, i) => {
                const selected = i === selectedHook;
                return (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-md border px-3 py-2.5 transition-colors ${
                      selected
                        ? "border-petrol bg-petrol/10"
                        : "border-line bg-surface"
                    }`}
                  >
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedHook(i)}
                      className="flex flex-1 items-start gap-2 text-left"
                    >
                      <span
                        className={`mt-0.5 font-mono text-xs ${
                          selected ? "text-petrol" : "text-faint"
                        }`}
                        aria-hidden
                      >
                        {selected ? "●" : "○"}
                      </span>
                      <span
                        className={`text-sm leading-snug ${
                          selected ? "text-ink" : "text-muted"
                        }`}
                      >
                        {hook}
                      </span>
                    </button>
                    <GhostButton onClick={() => copy(`hook-${i}`, hook)}>
                      {label(`hook-${i}`, "Copy")}
                    </GhostButton>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body controls */}
          <div className="mt-9 flex items-center justify-between border-t border-line pt-4">
            <SubHead title="Story" />
            <button
              type="button"
              role="switch"
              aria-checked={showPrompts}
              onClick={() => setShowPrompts((v) => !v)}
              className="flex items-center gap-2.5"
            >
              <span className="text-sm text-muted">Show image prompts</span>
              <span
                className={`relative h-5 w-9 rounded-full transition-colors ${
                  showPrompts ? "bg-petrol" : "bg-ink/20"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${
                    showPrompts ? "left-4.5" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          </div>

          {/* Scene-labelled body */}
          <div className="mt-6 flex flex-col gap-10">
            {segments.map((segment, i) => (
              <section key={segment.index}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-petrol">
                    Scene {i + 1}
                  </span>
                  <span className="h-px flex-1 bg-line" aria-hidden />
                </div>
                <p className="font-reading text-lg leading-[1.8] text-ink/90">
                  {segment.text}
                </p>
                {showPrompts && (
                  <PromptBox label="Image prompt">{segment.imagePrompt}</PromptBox>
                )}
              </section>
            ))}
          </div>
        </Cluster>

        {/* ── VISUALS ────────────────────────────────────────────── */}
        <Cluster label="Visuals">
          {/* Characters */}
          <SubHead
            title="Characters"
            action={
              <GhostButton
                onClick={() => copy("chars", allCharacterPrompts)}
              >
                {label("chars", "Copy all character prompts")}
              </GhostButton>
            }
          />
          <div className="mt-3 flex flex-col gap-3">
            {characters.map((character, i) => (
              <div
                key={character.name}
                className="rounded-md border border-line bg-surface/60 px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-ink">
                      {character.name}
                    </div>
                    <div className="text-xs text-muted">{character.role}</div>
                  </div>
                  <GhostButton
                    onClick={() => copy(`char-${i}`, character.imagePrompt)}
                  >
                    {label(`char-${i}`, "Copy")}
                  </GhostButton>
                </div>
                <p className="mt-2 font-mono text-xs leading-relaxed text-muted">
                  {character.imagePrompt}
                </p>
              </div>
            ))}
          </div>

          {/* Scene image prompts (batch) */}
          <div className="mt-9 border-t border-line pt-7">
            <SubHead
              title="Image prompts"
              action={
                <GhostButton onClick={() => copy("scenes", allScenePrompts)}>
                  {label("scenes", "Copy all prompts")}
                </GhostButton>
              }
            />
            <ol className="mt-4 flex flex-col gap-3 font-mono text-xs leading-relaxed">
              {segments.map((segment, i) => (
                <li key={segment.index} className="text-muted">
                  <span className="text-petrol">Scene {i + 1}:</span>{" "}
                  {segment.imagePrompt}
                </li>
              ))}
            </ol>
          </div>

          {/* Thumbnail */}
          <div className="mt-9 border-t border-line pt-7">
            <SubHead
              title="Thumbnail"
              action={
                <GhostButton
                  onClick={() => copy("thumb", generation.thumbnailPrompt)}
                >
                  {label("thumb", "Copy")}
                </GhostButton>
              }
            />
            <div className="mt-3">
              <PromptBox label="Thumbnail prompt">
                {generation.thumbnailPrompt}
              </PromptBox>
            </div>
          </div>
        </Cluster>

        {/* ── METADATA ───────────────────────────────────────────── */}
        <Cluster label="Metadata">
          {description && (
            <>
              <SubHead
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
            </>
          )}

          {tags.length > 0 && (
            <div className="mt-9 border-t border-line pt-7">
              <SubHead
                title="Tags"
                action={
                  <GhostButton onClick={() => copy("tags", tags.join(", "))}>
                    {label("tags", "Copy all")}
                  </GhostButton>
                }
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-9 border-t border-line pt-7">
            <SubHead
              title="Hashtags"
              action={
                <GhostButton
                  onClick={() => copy("hashtags", generation.hashtags.join(" "))}
                >
                  {label("hashtags", "Copy all")}
                </GhostButton>
              }
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {generation.hashtags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-petrol/10 px-2.5 py-1 font-mono text-xs text-petrol"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </Cluster>
      </article>
    </div>
  );
}

function Cluster({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-t border-line first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-5"
      >
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.28em] text-petrol">
          {label}
        </span>
        <Chevron open={open} />
      </button>
      {open && <div className="pb-10">{children}</div>}
    </section>
  );
}

function SubHead({
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

function PromptBox({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-md border border-line bg-surface/60 px-4 py-3">
      <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
        {label}
      </div>
      <p className="mt-1.5 font-mono text-xs leading-relaxed text-muted">
        {children}
      </p>
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
      className={`h-4 w-4 text-faint transition-transform ${
        open ? "rotate-180" : ""
      }`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
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
