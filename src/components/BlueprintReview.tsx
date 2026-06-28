"use client";

import { useState } from "react";
import type { Blueprint } from "@/lib/types";

interface BlueprintReviewProps {
  blueprint: Blueprint;
  onApprove: (chosenTitle: string) => void;
  onRegenerate: () => void;
}

/**
 * C6 — Blueprint Review. The cheap-to-regenerate gate before the expensive
 * long write: pick a title, read the premise, scan the beats, then approve.
 */
export default function BlueprintReview({
  blueprint,
  onApprove,
  onRegenerate,
}: BlueprintReviewProps) {
  const [selectedTitle, setSelectedTitle] = useState(blueprint.titleOptions[0]);
  const [beatsOpen, setBeatsOpen] = useState(true);

  return (
    <div className="md:h-full md:overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 pb-28 pt-10 sm:px-8">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-faint">
          Blueprint · review before writing
        </span>

        {/* Title options */}
        <h2 className="mt-5 text-sm font-medium text-ink">Choose a title</h2>
        <div className="mt-3 flex flex-col gap-2">
          {blueprint.titleOptions.map((option) => {
            const selected = option === selectedTitle;
            return (
              <button
                key={option}
                type="button"
                aria-pressed={selected}
                onClick={() => setSelectedTitle(option)}
                className={`rounded-md border px-4 py-3 text-left text-sm leading-snug transition-colors ${
                  selected
                    ? "border-petrol bg-petrol/10 text-ink"
                    : "border-line bg-surface text-muted hover:border-petrol/50 hover:text-ink"
                }`}
              >
                <span
                  className={`mr-2 font-mono text-xs ${
                    selected ? "text-petrol" : "text-faint"
                  }`}
                  aria-hidden
                >
                  {selected ? "●" : "○"}
                </span>
                {option}
              </button>
            );
          })}
        </div>

        {/* Logline + premise */}
        <div className="mt-9 border-t border-line pt-7">
          <p className="font-reading text-xl italic leading-relaxed text-ink">
            {blueprint.logline}
          </p>
          <p className="mt-4 font-reading text-base leading-relaxed text-ink/80">
            {blueprint.storyBrief.premise}
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.15em] text-faint">
              Setting&nbsp;
            </span>
            {blueprint.storyBrief.setting}
          </p>
        </div>

        {/* Segment outline (collapsible) */}
        <div className="mt-9 border-t border-line pt-7">
          <button
            type="button"
            onClick={() => setBeatsOpen((v) => !v)}
            aria-expanded={beatsOpen}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-medium text-ink">
              Story beats{" "}
              <span className="text-faint">· {blueprint.segments.length}</span>
            </span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className={`h-4 w-4 text-faint transition-transform ${
                beatsOpen ? "rotate-180" : ""
              }`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {beatsOpen && (
            <ol className="mt-4 flex flex-col gap-5">
              {blueprint.segments.map((segment) => (
                <li key={segment.index} className="flex gap-4">
                  <span className="mt-0.5 font-mono text-sm tabular-nums text-petrol">
                    {String(segment.index).padStart(2, "0")}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-ink">
                        {segment.title}
                      </span>
                      <span className="font-mono text-[0.65rem] uppercase tracking-[0.15em] text-faint">
                        {segment.beat}
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-muted">
                      {segment.goal}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-faint">
                      Ends on: {segment.endsOn}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="sticky bottom-0 border-t border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-end gap-2 px-6 py-3 sm:px-8">
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-md px-4 py-2.5 text-sm text-muted transition-colors hover:bg-surface hover:text-ink"
          >
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => onApprove(selectedTitle)}
            className="rounded-md bg-petrol px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-petrol-bright"
          >
            Approve &amp; write
          </button>
        </div>
      </div>
    </div>
  );
}
