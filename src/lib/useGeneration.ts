import { useCallback, useEffect, useRef, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { doc, onSnapshot } from "firebase/firestore";
import { db, functions } from "./firebase";
import type {
  AudioStatus,
  Blueprint,
  Generation,
  GenerationInput,
  Job,
  JobSegment,
  JobStatus,
  Scene,
  VisualStatus,
} from "./types";

const JOB_PARAM = "job";

export interface WriteProgress {
  current: number;
  total: number;
}

export interface UseGeneration {
  status: JobStatus;
  /** The blueprint from the job doc, once status is 'blueprint_ready'. */
  blueprint: Blueprint | null;
  /** Error message from the job doc (or a client-side failure). */
  errorMessage: string | null;
  /** Narration segments streamed live onto the doc during 'writing'. */
  segments: JobSegment[];
  /** Writing progress for "Segment X of N". */
  writeProgress: WriteProgress | null;
  /** The finished generation from the doc, once status is 'done'. */
  generation: Generation | null;
  /** The visual phase lifecycle, once visuals have been kicked off. */
  visualStatus: VisualStatus | null;
  /** Scene-splitting progress for "Scene X of N". */
  sceneProgress: WriteProgress | null;
  /** Scenes keyed by segment index — used to anchor scenes to their segment. */
  scenesBySegment: Record<string, Scene[]> | null;
  /** The voice/TTS phase lifecycle, once audio has been kicked off. */
  audioStatus: AudioStatus | null;
  /** Per-segment narration audio URLs, keyed by segment index. */
  audioSegments: Record<string, string> | null;
  /** The separately-voiced cold-open hook audio URL. */
  hookAudioUrl: string | null;
  /** The stitched full-story narration audio URL. */
  fullAudioUrl: string | null;
  /** Per-segment synthesis progress for "Segment X of N". */
  audioProgress: WriteProgress | null;
  /** Error from a thumbnail-only re-roll (separate from the visual-phase error). */
  thumbnailError: string | null;
  /** Begin a run: invoke startJob, then subscribe to the job doc. */
  start: (input: GenerationInput) => Promise<void>;
  /** Approve the blueprint: invoke approveJob; the doc's status drives the UI. */
  approve: (chosenTitle: string) => Promise<void>;
  /** Kick off the visual phase: invoke generateVisuals; the doc drives the UI. */
  generateVisuals: () => Promise<void>;
  /** Re-roll only the thumbnail; the doc's generation.thumbnail* drives the UI. */
  regenerateThumbnail: () => Promise<void>;
  /** Kick off the voice/TTS phase: invoke generateAudio; the doc drives the UI. */
  generateAudio: () => Promise<void>;
  /** Resume a quota-paused audio job: invoke resumeAudio; the doc drives the UI. */
  resumeAudio: () => Promise<void>;
  /** Cancel / regenerate / start over — detaches and returns to idle. */
  reset: () => void;
}

/** Sorted, deduped-by-index array from the writing-stage segment map. */
function orderedSegments(
  map: Record<string, JobSegment> | undefined,
): JobSegment[] {
  if (!map) return [];
  const byIndex = new Map<number, JobSegment>();
  for (const seg of Object.values(map)) {
    if (seg && typeof seg.index === "number") byIndex.set(seg.index, seg);
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

function setJobInUrl(jobId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (jobId) url.searchParams.set(JOB_PARAM, jobId);
  else url.searchParams.delete(JOB_PARAM);
  window.history.replaceState(null, "", url);
}

/**
 * Drives the whole generation journey off the live Firestore job doc. The Cloud
 * Functions (startJob → onJobCreated → approveJob → writeSegment chain) own all
 * the real work; the client just subscribes and reflects the doc's status,
 * blueprint, streamed segments, progress, and final generation. Resumable via
 * the ?job=<id> URL param — the work continues server-side regardless of the tab.
 */
export function useGeneration(): UseGeneration {
  const [status, setStatus] = useState<JobStatus>("idle");
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [segments, setSegments] = useState<JobSegment[]>([]);
  const [writeProgress, setWriteProgress] = useState<WriteProgress | null>(null);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [visualStatus, setVisualStatus] = useState<VisualStatus | null>(null);
  const [sceneProgress, setSceneProgress] = useState<WriteProgress | null>(null);
  const [scenesBySegment, setScenesBySegment] = useState<Record<
    string,
    Scene[]
  > | null>(null);
  const [audioStatus, setAudioStatus] = useState<AudioStatus | null>(null);
  const [audioSegments, setAudioSegments] = useState<Record<
    string,
    string
  > | null>(null);
  const [hookAudioUrl, setHookAudioUrl] = useState<string | null>(null);
  const [fullAudioUrl, setFullAudioUrl] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState<WriteProgress | null>(null);
  const [thumbnailError, setThumbnailError] = useState<string | null>(null);

  const unsubscribe = useRef<(() => void) | null>(null);
  const jobIdRef = useRef<string | null>(null);

  const detach = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
  }, []);

  // Subscribe to a job doc and reflect its fields onto the UI. Stays attached
  // through 'writing' and 'done' so streamed segments and the final generation
  // arrive live.
  const subscribe = useCallback(
    (jobId: string) => {
      detach();
      jobIdRef.current = jobId;
      unsubscribe.current = onSnapshot(
        doc(db, "jobs", jobId),
        (snap) => {
          const data = snap.data() as Job | undefined;
          if (!data) return;
          setStatus(data.status);
          if (data.blueprint) setBlueprint(data.blueprint);
          setSegments(orderedSegments(data.segmentsByIndex));
          setWriteProgress(data.writeProgress ?? null);
          if (data.generation) setGeneration(data.generation);
          setVisualStatus(data.visualStatus ?? null);
          setSceneProgress(data.sceneProgress ?? null);
          setScenesBySegment(data.scenesBySegment ?? null);
          setAudioStatus(data.audioStatus ?? null);
          setAudioSegments(data.audioSegments ?? null);
          setHookAudioUrl(data.hookAudioUrl ?? null);
          setFullAudioUrl(data.fullAudioUrl ?? null);
          setAudioProgress(data.audioProgress ?? null);
          setThumbnailError(data.thumbnailError ?? null);
          // The main job, the visual phase, or the audio phase can carry an error.
          if (
            data.status === "error" ||
            data.visualStatus === "error" ||
            data.audioStatus === "error"
          ) {
            setErrorMessage(data.error ?? "Generation failed.");
          }
        },
        (err) => {
          setStatus("error");
          setErrorMessage(err.message);
        },
      );
    },
    [detach],
  );

  const resetState = useCallback(() => {
    setBlueprint(null);
    setErrorMessage(null);
    setSegments([]);
    setWriteProgress(null);
    setGeneration(null);
    setVisualStatus(null);
    setSceneProgress(null);
    setScenesBySegment(null);
    setAudioStatus(null);
    setAudioSegments(null);
    setHookAudioUrl(null);
    setFullAudioUrl(null);
    setAudioProgress(null);
    setThumbnailError(null);
  }, []);

  const start = useCallback(
    async (input: GenerationInput) => {
      detach();
      resetState();
      // Show the progress view immediately, bridging the gap until the first
      // snapshot lands.
      setStatus("analyzing");
      try {
        const startJob = httpsCallable<GenerationInput, { jobId: string }>(
          functions,
          "startJob",
        );
        const result = await startJob(input);
        const jobId = result.data.jobId;
        setJobInUrl(jobId);
        subscribe(jobId);
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to start generation.",
        );
      }
    },
    [detach, resetState, subscribe],
  );

  const approve = useCallback(async (chosenTitle: string) => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    try {
      const approveJob = httpsCallable<
        { jobId: string; chosenTitle: string },
        { ok: boolean }
      >(functions, "approveJob");
      // Don't change status locally — the doc's status drives the UI.
      await approveJob({ jobId, chosenTitle });
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start writing.",
      );
    }
  }, []);

  const generateVisuals = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    try {
      const callable = httpsCallable<{ jobId: string }, { ok: boolean }>(
        functions,
        "generateVisuals",
      );
      // Don't change state locally — the doc's visualStatus drives the UI.
      await callable({ jobId });
    } catch (err) {
      setVisualStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start visuals.",
      );
    }
  }, []);

  const regenerateThumbnail = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    // Clear any prior re-roll error locally; the new prompt/variants and any
    // fresh error arrive via the doc snapshot.
    setThumbnailError(null);
    const callable = httpsCallable<{ jobId: string }, { ok: boolean }>(
      functions,
      "regenerateThumbnail",
    );
    await callable({ jobId });
  }, []);

  const generateAudio = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    try {
      const callable = httpsCallable<{ jobId: string }, { ok: boolean }>(
        functions,
        "generateAudio",
      );
      // Don't change state locally — the doc's audioStatus drives the UI.
      await callable({ jobId });
    } catch (err) {
      setAudioStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to start audio.",
      );
    }
  }, []);

  const resumeAudio = useCallback(async () => {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    try {
      const callable = httpsCallable<{ jobId: string }, { ok: boolean }>(
        functions,
        "resumeAudio",
      );
      // Don't change state locally — the doc's audioStatus drives the UI.
      await callable({ jobId });
    } catch (err) {
      setAudioStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to resume audio.",
      );
    }
  }, []);

  const reset = useCallback(() => {
    detach();
    jobIdRef.current = null;
    resetState();
    setJobInUrl(null);
    setStatus("idle");
  }, [detach, resetState]);

  // Resume on mount: if the URL carries ?job=<id>, reattach. The first snapshot
  // restores the UI to the doc's current status (incl. a job mid-'writing').
  useEffect(() => {
    const jobId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get(JOB_PARAM)
        : null;
    if (jobId) subscribe(jobId);
    return () => detach();
  }, [subscribe, detach]);

  return {
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
    thumbnailError,
    start,
    approve,
    generateVisuals,
    regenerateThumbnail,
    generateAudio,
    resumeAudio,
    reset,
  };
}
