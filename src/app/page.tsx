"use client";

import { useState } from "react";
import ControlsPanel from "@/components/ControlsPanel";
import ResultsCanvas from "@/components/ResultsCanvas";
import type { GenerationInput } from "@/lib/types";
import { MIN_TRANSCRIPT_WORDS, countWords } from "@/lib/text";
import { useGeneration } from "@/lib/useGeneration";

const DEFAULT_INPUT: GenerationInput = {
  sourceTitle: "",
  sourceTranscript: "",
  durationMinutes: 45,
  premiseDistance: 2,
};

export default function StudioPage() {
  const [input, setInput] = useState<GenerationInput>(DEFAULT_INPUT);

  // The simulated pipeline owns `status` and the streamed segments. Swap the
  // hook's internals for real API calls later — this wiring won't change.
  const { status, completedSegments, totalSegments, start, approve, reset } =
    useGeneration();

  // Generate is gated until the transcript clears the minimum.
  const isValid = countWords(input.sourceTranscript) >= MIN_TRANSCRIPT_WORDS;

  return (
    <div className="flex min-h-screen flex-1 flex-col md:h-screen md:flex-row md:overflow-hidden">
      <ControlsPanel
        input={input}
        onInputChange={setInput}
        status={status}
        onGenerate={start}
        isValid={isValid}
      />
      <ResultsCanvas
        status={status}
        completedSegments={completedSegments}
        totalSegments={totalSegments}
        onApprove={approve}
        onReset={reset}
      />
    </div>
  );
}
