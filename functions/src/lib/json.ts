// Parse a JSON payload from a model response, tolerating ```json … ``` fences
// and surrounding prose. On failure, log the raw length so we can tell whether
// the response is being truncated at the model's max_tokens ceiling.

/** Strip code fences and any prose around the outermost JSON object/array. */
function stripToJson(text: string): string {
  let t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Extract the outermost bracketed span (handles leading/trailing prose).
  const objStart = t.indexOf("{");
  const arrStart = t.indexOf("[");
  const start =
    objStart === -1
      ? arrStart
      : arrStart === -1
        ? objStart
        : Math.min(objStart, arrStart);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (start !== -1 && end !== -1 && end >= start) {
    t = t.slice(start, end + 1);
  }
  return t;
}

export function parseJson<T = unknown>(text: string): T {
  const cleaned = stripToJson(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    // A truncated response (e.g. hitting max_tokens) leaves unterminated JSON.
    console.error(
      `parseJson failed (raw length=${text.length}, cleaned length=${cleaned.length}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    throw err;
  }
}
