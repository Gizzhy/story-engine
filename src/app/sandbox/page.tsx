"use client";

import { useMemo, useState } from "react";
import { httpsCallable, type FunctionsError } from "firebase/functions";
import { functions } from "@/lib/firebase";

type Mode = "narration" | "hook";

// Rough hints. Pace ~2.5 words/sec (matches the chunker); cost from the doc's
// ~$0.80 per 90-min story on Flash TTS. Both are ballpark, labelled as such.
const WORDS_PER_SEC = 2.5;
const COST_PER_MINUTE = 0.8 / 90;

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * TTS sandbox — a standalone dev utility (not linked in the main nav) to
 * synthesise arbitrary pasted text through the same voice pipeline, for testing
 * pace/tone or re-voicing a single segment without generating a whole story.
 */
export default function SandboxPage() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("narration");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState(false);

  const trimmed = text.trim();
  const { words, estSeconds, estCost } = useMemo(() => {
    const w = trimmed ? trimmed.split(/\s+/).length : 0;
    const secs = w / WORDS_PER_SEC;
    return { words: w, estSeconds: secs, estCost: (secs / 60) * COST_PER_MINUTE };
  }, [trimmed]);

  async function synthesize() {
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setQuota(false);
    setUrl(null);
    try {
      // Long text runs many throttled calls — allow a generous client timeout.
      const call = httpsCallable<
        { text: string; mode: Mode },
        { ok: boolean; url: string }
      >(functions, "synthTest", { timeout: 540_000 });
      const res = await call({ text: trimmed, mode });
      setUrl(res.data.url);
    } catch (err) {
      const fe = err as FunctionsError;
      if (fe?.code === "functions/resource-exhausted") {
        setQuota(true);
        setError(fe.message);
      } else {
        setError(fe?.message ?? "Synthesis failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12 sm:px-8">
      <header>
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-faint">
          Dev utility
        </span>
        <h1 className="mt-2 font-display text-3xl font-medium tracking-tight text-ink">
          TTS Sandbox
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Paste any text and synthesize it with the current voice (Algenib) and
          craft rules — narration or hook. Ephemeral: nothing is saved to a
          story.
        </p>
      </header>

      {/* Mode toggle */}
      <div className="flex gap-1 rounded-md border border-line p-1">
        {(["narration", "hook"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded px-3 py-1.5 text-sm capitalize transition-colors ${
              mode === m
                ? "bg-petrol font-medium text-canvas"
                : "text-muted hover:text-ink"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Text input */}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste text to synthesize…"
          rows={10}
          className="w-full resize-y rounded-md border border-line bg-surface/50 px-4 py-3 font-reading text-base leading-relaxed text-ink outline-none placeholder:text-faint focus:border-petrol/60"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[0.7rem] text-faint">
          <span>
            {text.length.toLocaleString()} chars · {words.toLocaleString()} words
          </span>
          {words > 0 && (
            <span>
              ~{fmtDuration(estSeconds)} audio · rough est. ~$
              {estCost.toFixed(estCost < 0.1 ? 3 : 2)}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={synthesize}
        disabled={!trimmed || loading}
        className="self-start rounded-md bg-petrol px-5 py-2.5 text-sm font-medium text-canvas transition-colors hover:bg-petrol-bright disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "Synthesizing…" : "Synthesize"}
      </button>

      {loading && (
        <p className="flex items-center gap-2 text-sm text-faint">
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-petrol"
            aria-hidden
          />
          Running the chunked TTS path — long text takes a few minutes under the
          rate limit.
        </p>
      )}

      {quota && (
        <div className="rounded-md border border-line border-l-2 border-l-petrol bg-surface/60 px-4 py-3">
          <div className="text-sm font-medium text-ink">Rate/quota limit hit</div>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {error} You can retry once it clears.
          </p>
        </div>
      )}

      {error && !quota && (
        <p className="text-sm leading-relaxed text-muted">{error}</p>
      )}

      {url && (
        <div className="rounded-md border border-line border-l-2 border-l-petrol bg-surface/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-ink capitalize">
              {mode} · result
            </div>
            <a
              href={url}
              download={`sandbox-${mode}.wav`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border border-line px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.15em] text-muted transition-colors hover:border-petrol/50 hover:text-petrol"
            >
              Download
            </a>
          </div>
          <audio controls preload="none" src={url} className="mt-3 w-full" />
        </div>
      )}
    </main>
  );
}
