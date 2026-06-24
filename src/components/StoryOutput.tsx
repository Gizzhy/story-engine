"use client";

import { useState } from "react";
import type { Generation } from "@/lib/types";

interface StoryOutputProps {
  generation: Generation;
  onRegenerate: () => void;
}

/** Future deliverables — kept as inert slots so they bolt in without relayout. */
const COMING_SOON = ["Description", "Tags", "Scenes"] as const;

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
 * Renders a finished Generation; segments join into one continuous read with
 * subtle dividers. Copy/Download act on the full text; Regenerate resets.
 */
export default function StoryOutput({
  generation,
  onRegenerate,
}: StoryOutputProps) {
  const [copied, setCopied] = useState(false);

  const plainText = `${generation.title}\n\n${generation.segments
    .map((s) => s.text)
    .join("\n\n")}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — fail quietly.
    }
  }

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

  const estDuration = `${generation.durationMinutes} min`;
  const wordBadge = `${generation.wordCount.toLocaleString()} words`;

  return (
    <div className="md:h-full md:overflow-y-auto">
      {/* Sticky action bar */}
      <div className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-3 sm:px-8">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-faint">
            Manuscript
          </span>
          <div className="flex items-center gap-1">
            <BarButton onClick={handleCopy}>
              {copied ? "Copied" : "Copy"}
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
            <Badge>{wordBadge}</Badge>
            <Badge>{estDuration}</Badge>
          </div>
          <h1 className="mt-5 font-display text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
            {generation.title}
          </h1>
        </header>

        {/* Body */}
        <div className="mt-10">
          {generation.segments.map((segment, i) => (
            <div key={segment.index}>
              {i > 0 && (
                <div
                  className="my-9 text-center text-sm tracking-[0.5em] text-faint"
                  aria-hidden
                >
                  · · ·
                </div>
              )}
              <p className="font-reading text-lg leading-[1.8] text-ink/90">
                {segment.text}
              </p>
            </div>
          ))}
        </div>

        {/* Reserved future slots — inert, de-emphasised */}
        <section
          className="mt-16 border-t border-line pt-8 opacity-55"
          aria-label="Coming soon"
        >
          <div className="flex flex-col gap-3">
            {COMING_SOON.map((label) => (
              <div
                key={label}
                className="flex items-center justify-between rounded-md border border-dashed border-line px-4 py-3"
              >
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted">
                  {label}
                </span>
                <span className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-faint">
                  Coming soon
                </span>
              </div>
            ))}
          </div>
        </section>
      </article>
    </div>
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
