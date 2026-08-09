import {
  collection,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import type {
  AnnotationDoc,
  ProcessingStatus,
  ReviewStatus,
  ScreenshotDoc,
  Severity,
  TargetType,
  Theme,
} from "../types/research";

/**
 * Creates the images/{imageId} document right after an ImageBB upload
 * succeeds. Status starts at "uploaded" and moves through
 * ocr_pending -> ocr_done (both set client-side, see src/lib/ocr.ts)
 * -> grok_pending -> classified (set by /api/process).
 */
export async function createScreenshotDoc(input: {
  imageUrl: string;
  deleteUrl: string;
  fileName: string;
  researchProjectId: string;
  researcherId: string;
  platform?: ScreenshotDoc["platform"];
}): Promise<string> {
  const ref = doc(collection(db, "images"));
  const payload: Omit<ScreenshotDoc, "createdAt" | "platform"> & {
    createdAt: unknown;
    platform?: ScreenshotDoc["platform"];
  } = {
    imageId: ref.id,
    imageUrl: input.imageUrl,
    deleteUrl: input.deleteUrl,
    fileName: input.fileName,
    researchProjectId: input.researchProjectId,
    researcherId: input.researcherId,
    status: "uploaded",
    createdAt: serverTimestamp(),
  };
  if (input.platform !== undefined) {
    payload.platform = input.platform;
  }
  await setDoc(ref, payload);
  return ref.id;
}

export async function updateScreenshotStatus(
  imageId: string,
  status: ProcessingStatus,
  errorMessage?: string
): Promise<void> {
  await updateDoc(doc(db, "images", imageId), {
    status,
    ...(errorMessage ? { errorMessage } : {}),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Creates ocr_results/{imageId} once, client-side, right after
 * Tesseract.js finishes. Firestore rules only allow `create` (not
 * `update`) on this collection so raw OCR can never be overwritten.
 */
export async function createOcrResultDoc(input: {
  imageId: string;
  rawText: string;
  confidence: number;
}): Promise<void> {
  await setDoc(doc(db, "ocr_results", input.imageId), {
    imageId: input.imageId,
    language: "am",
    rawText: input.rawText,
    confidence: input.confidence,
    provider: "tesseract.js",
    createdAt: serverTimestamp(),
  });
}

/**
 * Upserts a researcher's review of one comment, keyed by
 * `{commentId}_{researcherId}` so re-saving the same researcher's review
 * updates their one annotation rather than creating duplicates. Never
 * touches the AI's own `classifications/{commentId}` doc — annotations
 * are a separate, independent record (see README "AI classification is
 * not ground truth").
 */
export async function saveAnnotation(input: {
  commentId: string;
  imageId: string;
  researcherId: string;
  reviewStatus: ReviewStatus;
  theme: Theme | null;
  severity: Severity;
  targetType: TargetType;
  correctedAmharic?: string;
  englishTranslation?: string;
  notes?: string;
}): Promise<void> {
  const annotationId = `${input.commentId}_${input.researcherId}`;
  const payload: Omit<AnnotationDoc, "createdAt" | "notes" | "correctedAmharic" | "englishTranslation"> & {
    createdAt: unknown;
    notes?: string;
    correctedAmharic?: string;
    englishTranslation?: string;
  } = {
    annotationId,
    commentId: input.commentId,
    imageId: input.imageId,
    researcherId: input.researcherId,
    reviewStatus: input.reviewStatus,
    theme: input.theme,
    severity: input.severity,
    targetType: input.targetType,
    createdAt: serverTimestamp(),
  };
  if (input.notes !== undefined) {
    payload.notes = input.notes;
  }
  if (input.correctedAmharic !== undefined) {
    payload.correctedAmharic = input.correctedAmharic;
  }
  if (input.englishTranslation !== undefined) {
    payload.englishTranslation = input.englishTranslation;
  }
  await setDoc(doc(db, "annotations", annotationId), payload);
}
