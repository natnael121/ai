// Core data model for the research pipeline.
// Mirrors the Firestore collections described in /api/_lib/firebase_admin.py

export type ProcessingStatus =
  | "uploaded"
  | "ocr_pending"
  | "ocr_done"
  | "grok_pending"
  | "classified"
  | "failed";

export type Platform =
  | "facebook"
  | "tiktok"
  | "telegram"
  | "instagram"
  | "twitter"
  | "other";

/** Single-label: a comment gets exactly one of these, or null if none apply. */
export type Theme =
  | "victim_blaming"
  | "normalization_of_gbv"
  | "survivor_support"
  | "gender_stereotypes_misogyny"
  | "online_harassment_abuse"
  | "feminist_resistance"
  | "silence_self_censorship";

export type Severity = "none" | "low" | "moderate" | "high" | "critical";

export type TargetType = "individual" | "group" | "women_general" | "unclear";

export type ReviewStatus = "pending" | "accepted" | "modified" | "rejected";

/** images/{imageId} — one uploaded screenshot */
export interface ScreenshotDoc {
  imageId: string;
  imageUrl: string; // ImageBB URL
  deleteUrl?: string; // ImageBB delete URL (keep private, researcher-only)
  fileName: string;
  platform?: Platform;
  researchProjectId: string;
  researcherId: string;
  status: ProcessingStatus;
  visibleCommentCount?: number; // e.g. "3,844 comments" shown in the screenshot
  createdAt: string;
  updatedAt?: string;
  errorMessage?: string;
}

/** ocr_results/{imageId} — raw OCR output, never overwritten */
export interface OcrResultDoc {
  imageId: string;
  language: "am";
  rawText: string;
  confidence: number;
  provider: string; // e.g. "google-vision"
  createdAt: string;
}

/** comments/{commentId} — one extracted comment from a screenshot */
export interface CommentDoc {
  commentId: string; // e.g. "S001-C01"
  imageId: string;
  rawAmharic: string;
  correctedAmharic: string;
  englishTranslation: string;
  commentDate?: string;
  likes?: number;
  replies?: number;
  createdAt: string;
}

/** classifications/{commentId} — AI research classification for one comment */
export interface ClassificationDoc {
  commentId: string;
  imageId: string;
  violencePresent: boolean;
  theme: Theme | null; // single-label; null if none of the 7 apply
  severity: Severity;
  targetType: TargetType;
  targetExplicitlyIdentified: boolean;
  threatPresent: boolean;
  incitementPresent: boolean;
  identityBased: boolean;
  sexualContent: boolean;
  privacyAbuse: boolean;
  tone: "hostile" | "supportive" | "neutral" | "mixed";
  rationale: string;
  confidence: number;
  uncertainties: string[];
  model: string;
  createdAt: string;
}

/** annotations/{annotationId} — human researcher review, one per (comment, researcher) */
export interface AnnotationDoc {
  annotationId: string;
  commentId: string;
  imageId: string;
  researcherId: string;
  reviewStatus: ReviewStatus; // accept / modify / reject vs AI classification
  theme: Theme | null;
  severity: Severity;
  targetType: TargetType;
  notes?: string;
  createdAt: string;
}
