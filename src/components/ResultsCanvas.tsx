import type {
  AudioStatus,
  Blueprint,
  Generation,
  JobSegment,
  JobStatus,
  Scene,
  VisualStatus,
} from "@/lib/types";
import type { WriteProgress } from "@/lib/useGeneration";
import StoryOutput from "@/components/StoryOutput";
import BlueprintReview from "@/components/BlueprintReview";
import GenerationProgress from "@/components/GenerationProgress";

const GENERATING_STATES: JobStatus[] = ["analyzing", "planning", "writing"];

interface ResultsCanvasProps {
  status: JobStatus;
  blueprint: Blueprint | null;
  errorMessage: string | null;
  segments: JobSegment[];
  writeProgress: WriteProgress | null;
  generation: Generation | null;
  visualStatus: VisualStatus | null;
  sceneProgress: WriteProgress | null;
  scenesBySegment: Record<string, Scene[]> | null;
  audioStatus: AudioStatus | null;
  audioSegments: Record<string, string> | null;
  hookAudioUrl: string | null;
  fullAudioUrl: string | null;
  audioProgress: WriteProgress | null;
  onApprove: (chosenTitle: string) => void;
  onGenerateVisuals: () => void;
  onGenerateAudio: () => void;
  onResumeAudio: () => void;
  onReset: () => void;
}

/**
 * The right-hand "page" — a state machine over JobStatus: the idle empty state,
 * live generation progress, the blueprint review, the finished story, and an
 * error state.
 */
export default function ResultsCanvas({
  status,
  blueprint,
  errorMessage,
  segments,
  writeProgress,
  generation,
  visualStatus,
  sceneProgress,
  scenesBySegment,
  audioStatus,
  audioSegments,
  hookAudioUrl,
  fullAudioUrl,
  audioProgress,
  onApprove,
  onGenerateVisuals,
  onGenerateAudio,
  onResumeAudio,
  onReset,
}: ResultsCanvasProps) {
  return (
    <section className="relative flex flex-1 flex-col bg-canvas md:min-h-0">
      {status === "idle" && (
        <div className="flex flex-1 items-center justify-center px-8 py-16">
          <EmptyState />
        </div>
      )}
      {GENERATING_STATES.includes(status) && (
        <GenerationProgress
          status={status}
          segments={segments}
          writeProgress={writeProgress}
          onCancel={onReset}
        />
      )}
      {status === "blueprint_ready" && blueprint && (
        <BlueprintReview
          blueprint={blueprint}
          onApprove={onApprove}
          onRegenerate={onReset}
        />
      )}
      {status === "done" && generation && (
        <StoryOutput
          generation={generation}
          visualStatus={visualStatus}
          sceneProgress={sceneProgress}
          scenesBySegment={scenesBySegment}
          audioStatus={audioStatus}
          audioSegments={audioSegments}
          hookAudioUrl={hookAudioUrl}
          fullAudioUrl={fullAudioUrl}
          audioProgress={audioProgress}
          errorMessage={errorMessage}
          onGenerateVisuals={onGenerateVisuals}
          onGenerateAudio={onGenerateAudio}
          onResumeAudio={onResumeAudio}
          onRegenerate={onReset}
        />
      )}
      {status === "error" && (
        <div className="flex flex-1 items-center justify-center px-8 py-16">
          <ErrorState message={errorMessage} onReset={onReset} />
        </div>
      )}
    </section>
  );
}

function ErrorState({
  message,
  onReset,
}: {
  message: string | null;
  onReset: () => void;
}) {
  return (
    <div className="flex max-w-md flex-col items-center text-center">
      <span className="flex items-center gap-2 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-faint">
        <span className="h-px w-6 bg-petrol" aria-hidden />
        Something broke
      </span>

      <h2 className="mt-6 font-display text-3xl font-medium leading-tight text-ink sm:text-4xl">
        The press jammed
      </h2>

      <p className="mt-4 text-base leading-relaxed text-muted">
        {message ?? "The generation failed. Try again."}
      </p>

      <button
        type="button"
        onClick={onReset}
        className="mt-7 rounded-md bg-petrol px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-petrol-bright"
      >
        Start over
      </button>
    </div>
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
