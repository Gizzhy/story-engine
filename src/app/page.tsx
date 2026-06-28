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

  // The single, consistent path for every left-column control to report a
  // change: a partial patch merged into the page-level `input` state.
  const updateInput = (patch: Partial<GenerationInput>) =>
    setInput((prev) => ({ ...prev, ...patch }));

  // The whole pipeline runs server-side; we just reflect the live job doc.
  const {
    status,
    blueprint,
    errorMessage,
    segments,
    writeProgress,
    generation,
    start,
    approve,
    reset,
  } = useGeneration();

  // Generate is gated until the transcript clears the minimum.
  const isValid = countWords(input.sourceTranscript) >= MIN_TRANSCRIPT_WORDS;

  return (
    <div className="flex min-h-screen flex-1 flex-col md:h-screen md:flex-row md:overflow-hidden">
      <ControlsPanel
        input={input}
        updateInput={updateInput}
        status={status}
        onGenerate={() => start(input)}
        isValid={isValid}
      />
      <ResultsCanvas
        status={status}
        blueprint={blueprint}
        errorMessage={errorMessage}
        segments={segments}
        writeProgress={writeProgress}
        generation={generation}
        onApprove={approve}
        onReset={reset}
      />
    </div>
  );
}
