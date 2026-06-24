"use client";

import { useLayoutEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { GenerationInput } from "@/lib/types";
import { MIN_TRANSCRIPT_WORDS, countWords } from "@/lib/text";

interface SourceInputPanelProps {
  input: GenerationInput;
  onInputChange: Dispatch<SetStateAction<GenerationInput>>;
}

/**
 * C1 — Source Input Panel. Captures the research material: the source title
 * and the transcript. Controlled against the page-level `input` state.
 * The transcript textarea auto-grows with its content; word count + the
 * below-minimum hint read from the same helper the page uses to gate Generate.
 */
export default function SourceInputPanel({
  input,
  onInputChange,
}: SourceInputPanelProps) {
  const transcriptRef = useRef<HTMLTextAreaElement>(null);
  const words = countWords(input.sourceTranscript);
  const belowMinimum = words < MIN_TRANSCRIPT_WORDS;

  // Auto-resize: collapse to content height on every change.
  useLayoutEffect(() => {
    const el = transcriptRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input.sourceTranscript]);

  function setTitle(value: string) {
    onInputChange((prev) => ({ ...prev, sourceTitle: value }));
  }

  function setTranscript(value: string) {
    onInputChange((prev) => ({ ...prev, sourceTranscript: value }));
  }

  function clearTranscript() {
    setTranscript("");
    transcriptRef.current?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Source title */}
      <label className="flex flex-col gap-2">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-canvas/45">
          Source video title
        </span>
        <input
          type="text"
          value={input.sourceTitle}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="The title you're researching — a reference, never a copy"
          className="w-full rounded-md border border-line-ink bg-ink-soft px-3.5 py-2.5 text-sm text-canvas placeholder:text-canvas/30 outline-none transition-colors focus:border-petrol-bright"
        />
      </label>

      {/* Transcript */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-canvas/45">
            Paste transcript
          </span>
          {input.sourceTranscript.length > 0 && (
            <button
              type="button"
              onClick={clearTranscript}
              className="font-mono text-[0.7rem] uppercase tracking-[0.15em] text-canvas/40 transition-colors hover:text-petrol-bright"
            >
              Clear
            </button>
          )}
        </div>

        <textarea
          ref={transcriptRef}
          value={input.sourceTranscript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Paste the full transcript of the video you're studying. The engine reads it for structure and tone, then invents something new."
          rows={6}
          className="max-h-[48vh] w-full resize-none overflow-y-auto rounded-md border border-line-ink bg-ink-soft px-3.5 py-3 text-sm leading-relaxed text-canvas placeholder:text-canvas/30 outline-none transition-colors focus:border-petrol-bright"
        />

        {/* Footer: hint on the left, live count on the right */}
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-canvas/40">
            {belowMinimum
              ? `Needs at least ${MIN_TRANSCRIPT_WORDS} words to generate`
              : "Ready to generate"}
          </span>
          <span
            className={`font-mono text-[0.7rem] tabular-nums tracking-wide ${
              belowMinimum ? "text-canvas/40" : "text-petrol-bright"
            }`}
          >
            {words.toLocaleString()} words
          </span>
        </div>
      </div>
    </div>
  );
}
