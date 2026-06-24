import type { JobStatus, StorySegment } from "@/lib/types";
import { mockBlueprint, mockGeneration } from "@/lib/mock";
import StoryOutput from "@/components/StoryOutput";
import BlueprintReview from "@/components/BlueprintReview";
import GenerationProgress from "@/components/GenerationProgress";

const GENERATING_STATES: JobStatus[] = ["analyzing", "planning", "writing"];

interface ResultsCanvasProps {
  status: JobStatus;
  completedSegments: StorySegment[];
  totalSegments: number;
  onApprove: () => void;
  onReset: () => void;
}

/**
 * The right-hand "page" — a state machine over JobStatus: the idle empty state,
 * the blueprint review, the live generation progress, and the finished story.
 */
export default function ResultsCanvas({
  status,
  completedSegments,
  totalSegments,
  onApprove,
  onReset,
}: ResultsCanvasProps) {
  return (
    <section className="relative flex flex-1 flex-col bg-canvas md:min-h-0">
      {status === "idle" && (
        <div className="flex flex-1 items-center justify-center px-8 py-16">
          <EmptyState />
        </div>
      )}
      {status === "blueprint_ready" && (
        <BlueprintReview
          blueprint={mockBlueprint}
          onApprove={onApprove}
          onRegenerate={onReset}
        />
      )}
      {GENERATING_STATES.includes(status) && (
        <GenerationProgress
          status={status}
          totalSegments={totalSegments}
          completed={completedSegments}
          onCancel={onReset}
        />
      )}
      {status === "done" && (
        <StoryOutput generation={mockGeneration} onRegenerate={onReset} />
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex max-w-md flex-col items-center text-center">
      <span className="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-faint">
        <span className="h-px w-6 bg-petrol" aria-hidden />
        The page
      </span>

      <h2 className="mt-6 font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">
        Nothing pressed yet
      </h2>

      <p className="mt-4 text-base leading-relaxed text-muted">
        Paste a transcript and title, then generate. Your original story builds
        here, segment by segment.
      </p>
    </div>
  );
}
