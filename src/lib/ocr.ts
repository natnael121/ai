import { createWorker, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

/**
 * Lazily creates one shared Tesseract.js worker loaded with the Amharic
 * ("amh") trained-data model. The first call downloads the model
 * (a few MB) from Tesseract's public CDN in the browser — free, no
 * account or API key. Later calls in the same session reuse the worker.
 */
function getWorker(onLog?: (message: string) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("amh", 1, {
      logger: (m) => onLog?.(`${m.status} ${Math.round((m.progress ?? 0) * 100)}%`),
    });
  }
  return workerPromise;
}

export interface OcrOutcome {
  rawText: string;
  confidence: number; // 0–1
}

export async function runOcr(file: File, onLog?: (message: string) => void): Promise<OcrOutcome> {
  const worker = await getWorker(onLog);
  const { data } = await worker.recognize(file);
  return {
    rawText: data.text,
    confidence: (data.confidence ?? 0) / 100,
  };
}

/** Call once when leaving the upload flow to free the worker's memory. */
export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}
