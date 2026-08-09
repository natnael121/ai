/**
 * Triggers the serverless /api/process function for a single image.
 * The function itself is synchronous request/response (OCR + Groq for
 * ONE screenshot), kept intentionally small so it finishes well inside
 * Vercel's function time limit. Batch fan-out/concurrency is handled
 * HERE on the client, not inside a single long-running function.
 */
export async function processImage(imageId: string): Promise<void> {
  const res = await fetch("/api/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`processImage(${imageId}) failed: ${text}`);
  }
}

/**
 * Runs processImage over many imageIds with a small concurrency cap so
 * we don't blow past Groq/OCR rate limits or Vercel's concurrent
 * invocation limits on the free tier. Reports progress via onProgress.
 */
export async function processBatch(
  imageIds: string[],
  opts: {
    concurrency?: number;
    onProgress?: (done: number, total: number, imageId: string, error?: Error) => void;
  } = {}
): Promise<void> {
  const concurrency = opts.concurrency ?? 3;
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (cursor < imageIds.length) {
      const imageId = imageIds[cursor++];
      try {
        await processImage(imageId);
        opts.onProgress?.(++done, imageIds.length, imageId);
      } catch (err) {
        opts.onProgress?.(++done, imageIds.length, imageId, err as Error);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
}
