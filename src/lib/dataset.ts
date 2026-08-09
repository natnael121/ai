import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import type {
  AnnotationDoc,
  ClassificationDoc,
  CommentDoc,
  ScreenshotDoc,
  Theme,
} from "../types/research";

export interface DatasetRow {
  imageId: string;
  commentId: string;
  platform: string;
  date: string;
  rawAmharic: string;
  correctedAmharic: string;
  englishTranslation: string;
  violencePresent: boolean;
  themes: Theme[];
  severity: string;
  targetType: string;
  threatPresent: boolean;
  incitementPresent: boolean;
  identityBased: boolean;
  sexualContent: boolean;
  privacyAbuse: boolean;
  aiConfidence: number;
  humanReviewStatus: string; // "pending" | "accepted" | "modified" | "rejected"
  humanThemes: Theme[];
  researcherNotes: string;
  likes: number | null;
  replies: number | null;
}

export const THEME_LABELS: Record<Theme, string> = {
  victim_blaming: "Victim-blaming",
  normalization_of_gbv: "Normalization of GBV",
  survivor_support: "Survivor support & solidarity",
  gender_stereotypes_misogyny: "Gender stereotypes & misogyny",
  online_harassment_abuse: "Online harassment & abuse",
  feminist_resistance: "Feminist resistance & advocacy",
  silence_self_censorship: "Silence & self-censorship",
  no_apparent_violence: "No apparent violence",
};

export const ALL_THEMES = Object.keys(THEME_LABELS) as Theme[];

/**
 * Reads every collection once and joins client-side. Fine at the scale
 * of a few hundred/thousand coded comments; if the corpus grows much
 * larger, move this aggregation into a scheduled Cloud Function that
 * writes a precomputed summary doc instead.
 */
export async function loadDataset(): Promise<DatasetRow[]> {
  const [imagesSnap, commentsSnap, classificationsSnap, annotationsSnap] =
    await Promise.all([
      getDocs(collection(db, "images")),
      getDocs(collection(db, "comments")),
      getDocs(collection(db, "classifications")),
      getDocs(collection(db, "annotations")),
    ]);

  const images = new Map<string, ScreenshotDoc>();
  imagesSnap.forEach((d) => images.set(d.id, d.data() as ScreenshotDoc));

  const classifications = new Map<string, ClassificationDoc>();
  classificationsSnap.forEach((d) =>
    classifications.set(d.id, d.data() as ClassificationDoc)
  );

  // A comment can have multiple researcher annotations; take the most
  // recent one per comment for the flat export/dashboard view (all of
  // them remain queryable individually for inter-rater analysis).
  const annotationsByComment = new Map<string, AnnotationDoc>();
  annotationsSnap.forEach((d) => {
    const a = d.data() as AnnotationDoc;
    const existing = annotationsByComment.get(a.commentId);
    if (!existing || a.createdAt > existing.createdAt) {
      annotationsByComment.set(a.commentId, a);
    }
  });

  const rows: DatasetRow[] = [];
  commentsSnap.forEach((d) => {
    const comment = d.data() as CommentDoc;
    const image = images.get(comment.imageId);
    const classification = classifications.get(comment.commentId);
    const annotation = annotationsByComment.get(comment.commentId);

    rows.push({
      imageId: comment.imageId,
      commentId: comment.commentId,
      platform: image?.platform ?? "unknown",
      date: comment.commentDate ?? "",
      rawAmharic: comment.rawAmharic,
      correctedAmharic: comment.correctedAmharic,
      englishTranslation: comment.englishTranslation,
      violencePresent: classification?.violencePresent ?? false,
      themes: classification?.themes ?? [],
      severity: classification?.severity ?? "none",
      targetType: classification?.targetType ?? "unclear",
      threatPresent: classification?.threatPresent ?? false,
      incitementPresent: classification?.incitementPresent ?? false,
      identityBased: classification?.identityBased ?? false,
      sexualContent: classification?.sexualContent ?? false,
      privacyAbuse: classification?.privacyAbuse ?? false,
      aiConfidence: classification?.confidence ?? 0,
      humanReviewStatus: annotation?.reviewStatus ?? "pending",
      humanThemes: annotation?.themes ?? [],
      researcherNotes: annotation?.notes ?? "",
      likes: comment.likes ?? null,
      replies: comment.replies ?? null,
    });
  });

  return rows;
}
