import type { Dispatch, SetStateAction } from "react";
import type { Duration, GenerationInput } from "@/lib/types";

interface DurationSelectorProps {
  value: Duration;
  onInputChange: Dispatch<SetStateAction<GenerationInput>>;
}

const DURATIONS: Duration[] = [30, 45, 60, 75, 90];

/** Narration runs ~140 words/minute (WPM), per the engine spec. */
const WPM = 140;

/**
 * C2 — Duration Selector. A 5-stop segmented control; the caption shows the
 * derived word target so the length choice feels concrete.
 */
export default function DurationSelector({
  value,
  onInputChange,
}: DurationSelectorProps) {
  const wordTarget = value * WPM;

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-canvas/45">
        Duration
      </span>

      <div className="flex gap-1 rounded-md border border-line-ink bg-ink-soft p-1">
        {DURATIONS.map((minutes) => {
          const selected = minutes === value;
          return (
            <button
              key={minutes}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                onInputChange((prev) => ({ ...prev, durationMinutes: minutes }))
              }
              className={`flex-1 rounded py-2 text-sm tabular-nums transition-colors ${
                selected
                  ? "bg-petrol text-canvas"
                  : "text-canvas/55 hover:text-canvas"
              }`}
            >
              {minutes}
            </button>
          );
        })}
      </div>

      <span className="text-xs text-canvas/40">
        ~{wordTarget.toLocaleString()} words · {value} min
      </span>
    </div>
  );
}
