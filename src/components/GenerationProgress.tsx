"use client";

import type { JobStatus, StorySegment } from "@/lib/types";

interface GenerationProgressProps {
  status: JobStatus;
  totalSegments: number;
  /** Segments revealed so far; the writing progress derives from this. */
  completed?: StorySegment[];
  onCancel: () => void;
}

const STEPS: { key: JobStatus; label: string }[] = [
  { key: "analyzing", label: "Analyzing" },
  { key: "planning", label: "Planning" },
  { key: "writing", label: "Writing" },
];

// Which stepper index each status sits at.
const STEP_INDEX: Record<string, number> = {
  analyzing: 0,
  planning: 1,
  writing: 2,
};

/**
 * C7 — Generation Progress. Makes the multi-minute background job feel alive:
 * a stage stepper, segment progress while writing, and a build area where
 * finished segments accumulate. Designed to survive a reconnect (state-driven).
 */
export default function GenerationProgress({
  status,
  totalSegments,
  completed = [],
  onCancel,
}: GenerationProgressProps) {
  const activeStep = STEP_INDEX[status] ?? 0;
  const writing = status === "writing";
  // The segment currently being written = one past the last finished one.
  const writingIndex = Math.min(completed.length + 1, totalSegments);
  const segmentFraction =
    totalSegments > 0 ? Math.min(completed.length / totalSegments, 1) : 0;

  return (
    <div className="md:h-full md:overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12 sm:px-8">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-faint">
            Generating
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="font-mono text-[0.7rem] uppercase tracking-[0.15em] text-faint transition-colors hover:text-petrol"
          >
            Cancel
          </button>
        </div>

        {/* Stage stepper */}
        <ol className="flex items-center">
          {STEPS.map((step, i) => {
            const done = i < activeStep;
            const active = i === activeStep;
            return (
              <li key={step.key} className="flex flex-1 items-center last:flex-none">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                      done
                        ? "border-petrol bg-petrol text-canvas"
                        : active
                          ? "border-petrol text-petrol"
                          : "border-line text-faint"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span
                    className={`text-sm ${
                      active
                        ? "font-medium text-ink"
                        : done
                          ? "text-muted"
                          : "text-faint"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <span
                    className={`mx-3 h-px flex-1 ${
                      done ? "bg-petrol" : "bg-line"
                    }`}
                    aria-hidden
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* Segment progress — only while writing */}
        {writing && (
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted">
                Segment {writingIndex} of{" "}
                {totalSegments}
              </span>
              <span className="font-mono text-xs tabular-nums text-faint">
                {Math.round(segmentFraction * 100)}%
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-petrol-bright transition-[width] duration-500"
                style={{ width: `${segmentFraction * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Live build area */}
        <div className="min-h-48 rounded-lg border border-line bg-surface/60 p-6">
          {completed.length === 0 ? (
            <p className="text-sm leading-relaxed text-faint">
              {writing
                ? "Finished segments will appear here as they're written."
                : "The story begins once the blueprint is locked in."}
            </p>
          ) : (
            <div className="flex flex-col gap-6">
              {completed.map((segment) => (
                <p
                  key={segment.index}
                  className="font-reading text-base leading-[1.8] text-ink/90"
                >
                  {segment.text}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
