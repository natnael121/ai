import * as XLSX from "xlsx";
import type { DatasetRow } from "./dataset";
import { NO_THEME_LABEL, THEME_LABELS } from "./dataset";

function toExportRow(row: DatasetRow) {
  return {
    "Image ID": row.imageId,
    "Comment ID": row.commentId,
    Platform: row.platform,
    Date: row.date,
    "Raw Amharic": row.rawAmharic,
    "Corrected Amharic": row.correctedAmharic,
    "English Translation": row.englishTranslation,
    "Violence Present": row.violencePresent ? "Yes" : "No",
    Theme: row.theme ? THEME_LABELS[row.theme] : NO_THEME_LABEL,
    Severity: row.severity,
    "Target Type": row.targetType,
    Threat: row.threatPresent ? "Yes" : "No",
    Incitement: row.incitementPresent ? "Yes" : "No",
    "Identity Based": row.identityBased ? "Yes" : "No",
    "Sexual Content": row.sexualContent ? "Yes" : "No",
    "Privacy Abuse": row.privacyAbuse ? "Yes" : "No",
    "AI Confidence": row.aiConfidence,
    "Human Review Status": row.humanReviewStatus,
    "Human Theme": row.humanTheme ? THEME_LABELS[row.humanTheme] : NO_THEME_LABEL,
    "Researcher Notes": row.researcherNotes,
    Likes: row.likes ?? "",
    Replies: row.replies ?? "",
  };
}

function summaryRows(rows: DatasetRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = row.theme ? THEME_LABELS[row.theme] : NO_THEME_LABEL;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const total = rows.length || 1;
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([theme, count]) => ({
      Theme: theme,
      "Coded comments": count,
      "% of coded comments": `${((count / total) * 100).toFixed(1)}%`,
    }));
}

/** Two-sheet workbook: full coded dataset + a theme-frequency summary. */
export function exportToExcel(rows: DatasetRow[], filename = "mapping-the-silence-dataset.xlsx") {
  const wb = XLSX.utils.book_new();

  const dataSheet = XLSX.utils.json_to_sheet(rows.map(toExportRow));
  XLSX.utils.book_append_sheet(wb, dataSheet, "Coded Comments");

  const summarySheet = XLSX.utils.json_to_sheet(summaryRows(rows));
  XLSX.utils.book_append_sheet(wb, summarySheet, "Theme Summary");

  XLSX.writeFile(wb, filename);
}

export function exportToCsv(rows: DatasetRow[], filename = "mapping-the-silence-dataset.csv") {
  const sheet = XLSX.utils.json_to_sheet(rows.map(toExportRow));
  const csv = XLSX.utils.sheet_to_csv(sheet);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, filename);
}

export function exportToJson(rows: DatasetRow[], filename = "mapping-the-silence-dataset.json") {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
