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
 * C8 — Story Output. The deliverable, in comfortable reading typography.
 * Each segment renders as a labelled Scene with its narration and an optional,
 * subordinate image prompt. Below the story sit the SEO/scene projections:
 * description, tags, and the batch list of image prompts.
 */
export default function StoryOutput({
  generation,
  onRegenerate,
}: StoryOutputProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showPrompts, setShowPrompts] = useState(true);

  const { segments, description } = generation;
  const tags = generation.tags ?? [];

  // Story text only — image prompts are deliberately excluded.
  const storyText = `${generation.title}\n\n${segments
    .map((s) => s.text)
    .join("\n\n")}`;

  // Batch projection of the per-scene prompts (same data as the inline blocks).
  const allPrompts = segments
    .map((s, i) => `Scene ${i + 1}: ${s.imagePrompt}`)
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
              {copiedKey === "story" ? "Copied" : "Copy"}
            </BarButton>
            <BarButton onClick={handleDownload}>Download</BarButton>
            <BarButton onClick={onRegenerate}>Regenerate</BarButton>
          </div>
        </div>
      </div>

      <article className="mx-auto max-w-2xl px-6 pb-20 pt-10 sm:px-8">
        {/* Header */}
        <header>
          <div className="flex flex-wrap gap-2">
            <Badge>{generation.wordCount.toLocaleString()} words</Badge>
            <Badge>{generation.durationMinutes} min</Badge>
          </div>
          <h1 className="mt-5 font-display text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
            {generation.title}
          </h1>
        </header>

        {/* Image-prompt visibility toggle */}
        <div className="mt-7 flex items-center justify-between border-t border-line pt-4">
          <span className="text-sm text-muted">
            {segments.length} scenes
          </span>
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
                  showPrompts ? "left-[1.125rem]" : "left-0.5"
                }`}
              />
            </span>
          </button>
        </div>

        {/* Body — one labelled scene per segment */}
        <div className="mt-9 flex flex-col gap-10">
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
                <div className="mt-4 rounded-md border border-line bg-surface/60 px-4 py-3">
                  <div className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-faint">
                    Image prompt
                  </div>
                  <p className="mt-1.5 font-mono text-xs leading-relaxed text-muted">
                    {segment.imagePrompt}
                  </p>
                </div>
              )}
            </section>
          ))}
        </div>

        {/* Description */}
        {description && (
          <section className="mt-14 border-t border-line pt-8">
            <SectionHead
              title="Description"
              action={
                <GhostButton onClick={() => copy("description", description)}>
                  {copiedKey === "description" ? "Copied" : "Copy"}
                </GhostButton>
              }
            />
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {description}
            </p>
          </section>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <section className="mt-10 border-t border-line pt-8">
            <SectionHead
              title="Tags"
              action={
                <GhostButton onClick={() => copy("tags", tags.join(", "))}>
                  {copiedKey === "tags" ? "Copied" : "Copy all"}
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
          </section>
        )}

        {/* Image prompts — batch projection of every scene */}
        <section className="mt-10 border-t border-line pt-8">
          <SectionHead
            title="Image prompts"
            action={
              <GhostButton onClick={() => copy("prompts", allPrompts)}>
                {copiedKey === "prompts" ? "Copied" : "Copy all prompts"}
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
        </section>
      </article>
    </div>
  );
}

function SectionHead({
  title,
  action,
}: {
  title: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-ink">
        {title}
      </h2>
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
      className="rounded-md border border-line px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-petrol/50 hover:text-petrol"
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
