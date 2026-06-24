import { useCallback, useEffect, useRef, useState } from "react";
import type { JobStatus, StorySegment } from "./types";
import { mockGeneration } from "./mock";

// ── Simulated timing ────────────────────────────────────────────────────────
// All fake-flow timing lives here. To go real, replace the scheduled
// transitions with API/queue calls (kick off DNA extraction, poll the job,
// subscribe to streamed segments) — the component contract stays the same.
const ANALYZE_MS = 1500;
const PLAN_MS = 1500;
const SEGMENT_MS = 1000;

export interface UseGeneration {
  status: JobStatus;
  /** Segments revealed so far during the writing phase. */
  completedSegments: StorySegment[];
  /** Total segments in the run (drives "Segment X of N"). */
  totalSegments: number;
  /** Begin a run: analyzing → planning → blueprint_ready. */
  start: () => void;
  /** Approve the blueprint: writing → stream segments → done. */
  approve: () => void;
  /** Cancel / regenerate / start over — clears timers and returns to idle. */
  reset: () => void;
}

/**
 * Drives the whole fake generation journey off setTimeout. Status is held in
 * React state only, so a page refresh mid-flow simply remounts at 'idle' (no
 * persistence yet) — it can't crash. All pending timers are tracked and
 * cleared on reset and on unmount.
 */
export function useGeneration(): UseGeneration {
  const [status, setStatus] = useState<JobStatus>("idle");
  const [completedSegments, setCompletedSegments] = useState<StorySegment[]>(
    [],
  );

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  // Clear any in-flight timers when the component using the hook unmounts.
  useEffect(() => clearTimers, [clearTimers]);

  const reset = useCallback(() => {
    clearTimers();
    setCompletedSegments([]);
    setStatus("idle");
  }, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    setCompletedSegments([]);
    setStatus("analyzing");
    schedule(() => setStatus("planning"), ANALYZE_MS);
    schedule(() => setStatus("blueprint_ready"), ANALYZE_MS + PLAN_MS);
  }, [clearTimers, schedule]);

  const approve = useCallback(() => {
    clearTimers();
    setCompletedSegments([]);
    setStatus("writing");

    const segments = mockGeneration.segments;
    segments.forEach((segment, i) => {
      schedule(
        () => {
          setCompletedSegments((prev) => [...prev, segment]);
          // After the final segment lands, settle into the finished story.
          if (i === segments.length - 1) {
            schedule(() => setStatus("done"), SEGMENT_MS);
          }
        },
        SEGMENT_MS * (i + 1),
      );
    });
  }, [clearTimers, schedule]);

  return {
    status,
    completedSegments,
    totalSegments: mockGeneration.segments.length,
    start,
    approve,
    reset,
  };
}
