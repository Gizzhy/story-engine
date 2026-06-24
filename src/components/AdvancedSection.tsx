"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { GenerationInput } from "@/lib/types";

interface AdvancedSectionProps {
  input: GenerationInput;
  onInputChange: Dispatch<SetStateAction<GenerationInput>>;
}

/**
 * C4 — Advanced (collapsible). Optional power-user inputs, hidden by default
 * to keep the console calm. Both fields are optional and bound to page state.
 */
export default function AdvancedSection({
  input,
  onInputChange,
}: AdvancedSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-line-ink pt-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-canvas/45">
          Advanced
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`h-4 w-4 text-canvas/45 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-5">
          <label className="flex flex-col gap-2">
            <span className="text-xs text-canvas/55">
              Your premise idea{" "}
              <span className="text-canvas/35">(optional)</span>
            </span>
            <textarea
              value={input.premiseSeed ?? ""}
              onChange={(e) =>
                onInputChange((prev) => ({
                  ...prev,
                  premiseSeed: e.target.value,
                }))
              }
              placeholder="Have your own idea? Sketch the story you want and the engine builds from it."
              rows={3}
              className="w-full resize-none rounded-md border border-line-ink bg-ink-soft px-3.5 py-2.5 text-sm leading-relaxed text-canvas placeholder:text-canvas/30 outline-none transition-colors focus:border-petrol-bright"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs text-canvas/55">
              Style sample to match{" "}
              <span className="text-canvas/35">(optional)</span>
            </span>
            <textarea
              value={input.styleSample ?? ""}
              onChange={(e) =>
                onInputChange((prev) => ({
                  ...prev,
                  styleSample: e.target.value,
                }))
              }
              placeholder="Paste a sample of your narration and the engine matches its voice."
              rows={3}
              className="w-full resize-none rounded-md border border-line-ink bg-ink-soft px-3.5 py-2.5 text-sm leading-relaxed text-canvas placeholder:text-canvas/30 outline-none transition-colors focus:border-petrol-bright"
            />
          </label>
        </div>
      )}
    </div>
  );
}
