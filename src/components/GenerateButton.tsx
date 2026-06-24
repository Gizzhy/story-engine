import type { JobStatus } from "@/lib/types";

interface GenerateButtonProps {
  isValid: boolean;
  status: JobStatus;
  onGenerate: () => void;
}

const WORKING_STATES: JobStatus[] = ["analyzing", "planning", "writing"];

/**
 * C5 — Generate button. Full-width primary CTA at the bottom of the console.
 * Disabled until the transcript clears the minimum; shows a working state while
 * a run is in flight. A click kicks off the simulated pipeline.
 */
export default function GenerateButton({
  isValid,
  status,
  onGenerate,
}: GenerateButtonProps) {
  const working = WORKING_STATES.includes(status);
  const disabled = !isValid || working;

  return (
    <span
      className="mt-auto block"
      title={!isValid ? "Add a longer transcript to continue" : undefined}
    >
      <button
        type="button"
        disabled={disabled}
        aria-disabled={disabled}
        onClick={onGenerate}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-petrol px-5 py-3.5 text-sm font-medium text-canvas transition-colors hover:bg-petrol-bright disabled:cursor-not-allowed disabled:bg-ink-soft disabled:text-canvas/35"
      >
        {working ? (
          <>
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-canvas/40 border-t-canvas"
              aria-hidden
            />
            Working…
          </>
        ) : (
          "Generate story"
        )}
      </button>
    </span>
  );
}
