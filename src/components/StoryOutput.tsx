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
 * C8 — Story Output. The finished narration: title, word-count + duration
 * badges, and the segments joined into one continuous read. Copy and Download
 * act on the real narration text.
 */
export default function StoryOutput({
  generation,
  onRegenerate,
}: StoryOutputProps) {
  const [copied, setCopied] = useState(false);

  const storyText = `${generation.title}\n\n${generation.segments
    .map((s) => s.text)
    .join("\n\n")}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(storyText);
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
        <header>
          <div className="flex flex-wrap gap-2">
            <Badge>{generation.wordCount.toLocaleString()} words</Badge>
            <Badge>{generation.durationMinutes} min</Badge>
          </div>
          <h1 className="mt-5 font-display text-3xl font-medium leading-tight tracking-tight text-ink sm:text-4xl">
            {generation.title}
          </h1>
        </header>

        {/* Body — segments joined into one continuous read */}
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
              <p className="font-reading text-lg leading-[1.8] text-ink/90 whitespace-pre-line">
                {segment.text}
              </p>
            </div>
          ))}
        </div>
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
