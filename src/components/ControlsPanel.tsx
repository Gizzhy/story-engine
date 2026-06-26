import type { GenerationInput, JobStatus } from "@/lib/types";
import SourceInputPanel from "@/components/SourceInputPanel";
import DurationSelector from "@/components/DurationSelector";
import PremiseDistanceDial from "@/components/PremiseDistanceDial";
import AdvancedSection from "@/components/AdvancedSection";
import GenerateButton from "@/components/GenerateButton";

interface ControlsPanelProps {
  input: GenerationInput;
  updateInput: (patch: Partial<GenerationInput>) => void;
  status: JobStatus;
  onGenerate: () => void;
  isValid: boolean;
}

/**
 * The left "console" — the engine room. Source input, length + premise
 * controls, optional advanced fields, and the Generate CTA at the bottom.
 */
export default function ControlsPanel({
  input,
  updateInput,
  status,
  onGenerate,
  isValid,
}: ControlsPanelProps) {
  return (
    <aside className="flex flex-col gap-9 border-b border-line-ink bg-ink px-7 py-9 text-canvas md:w-105 md:shrink-0 md:overflow-y-auto md:border-b-0 md:border-r">
      <header>
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.25em] text-canvas/45">
          The Press
        </span>
        <h1 className="mt-2 font-display text-2xl font-medium leading-tight tracking-tight">
          Story Engine
        </h1>
        <p className="mt-2 max-w-[28ch] text-sm leading-relaxed text-canvas/55">
          Feed in a transcript and title. The engine writes an original story —
          never a copy.
        </p>
      </header>

      <SourceInputPanel input={input} updateInput={updateInput} />
      <DurationSelector
        value={input.durationMinutes}
        updateInput={updateInput}
      />
      <PremiseDistanceDial
        value={input.premiseDistance}
        updateInput={updateInput}
      />
      <AdvancedSection input={input} updateInput={updateInput} />
      <GenerateButton
        isValid={isValid}
        status={status}
        onGenerate={onGenerate}
      />
    </aside>
  );
}
