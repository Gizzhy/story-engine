import type { Dispatch, SetStateAction } from "react";
import type { GenerationInput, PremiseDistance } from "@/lib/types";

interface PremiseDistanceDialProps {
  value: PremiseDistance;
  onInputChange: Dispatch<SetStateAction<GenerationInput>>;
}

/** Levels + descriptions per docs/engine-spec.md → "Premise-distance dial (1–5)". */
const LEVELS: { value: PremiseDistance; name: string; blurb: string }[] = [
  {
    value: 1,
    name: "Twin",
    blurb:
      "Same subgenre, same emotional hook, same archetype. Brand-new specifics only.",
  },
  {
    value: 2,
    name: "Sibling",
    blurb: "Same subgenre, fresh archetype within it.",
  },
  {
    value: 3,
    name: "Cousin",
    blurb: "Same genre, new premise, recognizably the same lane.",
  },
  {
    value: 4,
    name: "Distant",
    blurb: "Genre only; structure and pacing borrowed, premise unrelated.",
  },
  {
    value: 5,
    name: "Format-only",
    blurb: "Keep just the title formula and beat structure; everything else new.",
  },
];

/**
 * C3 — Premise-Distance Dial. A 5-point labelled slider from Twin to
 * Format-only; the helper line below describes the selected level.
 */
export default function PremiseDistanceDial({
  value,
  onInputChange,
}: PremiseDistanceDialProps) {
  const active = LEVELS[value - 1];

  // Pip centers sit at grid-column centers: 10% … 90%. The track and fill
  // span between the first and last pip centers.
  const fillWidth = `${((value - 1) / 4) * 80}%`;

  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.2em] text-canvas/45">
        Premise distance
      </span>

      <div className="relative pt-1.5">
        {/* Track + filled progress, aligned to pip centers */}
        <div className="absolute left-[10%] right-[10%] top-[calc(0.375rem+0.4375rem)] h-px -translate-y-1/2 bg-line-ink" />
        <div
          className="absolute left-[10%] top-[calc(0.375rem+0.4375rem)] h-px -translate-y-1/2 bg-petrol-bright"
          style={{ width: fillWidth }}
        />

        {/* Pips */}
        <div className="relative grid grid-cols-5">
          {LEVELS.map((level) => {
            const selected = level.value === value;
            return (
              <div key={level.value} className="flex justify-center">
                <button
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Premise distance: ${level.name}`}
                  onClick={() =>
                    onInputChange((prev) => ({
                      ...prev,
                      premiseDistance: level.value,
                    }))
                  }
                  className={`h-3.5 w-3.5 rounded-full border transition-colors ${
                    selected
                      ? "border-petrol-bright bg-petrol-bright"
                      : "border-canvas/30 bg-ink-soft hover:border-petrol-bright"
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Labels, aligned under each pip */}
        <div className="mt-2 grid grid-cols-5">
          {LEVELS.map((level) => (
            <span
              key={level.value}
              className={`text-center text-[0.65rem] ${
                level.value === value ? "text-canvas" : "text-canvas/40"
              }`}
            >
              {level.name}
            </span>
          ))}
        </div>
      </div>

      <p className="text-xs leading-relaxed text-canvas/55">
        <span className="text-canvas">{active.name}</span> — {active.blurb}
      </p>
    </div>
  );
}
