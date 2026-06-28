// Parse a JSON payload from a model response, tolerating ```json … ``` fences
// even though the prompts ask for raw JSON.
export function parseJson<T = unknown>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
