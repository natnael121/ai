import { useEffect, useState } from "react";
import { uploadToImageBb } from "../lib/imagebb";
import { createScreenshotDoc, createOcrResultDoc, updateScreenshotStatus } from "../lib/firestore";
import { runOcr, terminateOcrWorker } from "../lib/ocr";
import { processImage } from "../lib/api";
import { auth } from "../firebase";

type RowStatus =
  | "queued"
  | "uploading"
  | "ocr running"
  | "ocr done"
  | "classifying"
  | "done"
  | "error";

interface Row {
  file: File;
  status: RowStatus;
  imageId?: string;
  detail?: string; // OCR progress text or error message
}

// researcherId comes from the anonymous Firebase Auth session (App.tsx
// guarantees auth.currentUser is set before this page renders — see
// src/lib/auth.ts). TODO: swap for a real research project selector.
const RESEARCH_PROJECT_ID = "project_default";

export default function UploadPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);

  // Free the Tesseract.js worker's memory when the researcher navigates away.
  useEffect(() => () => void terminateOcrWorker(), []);

  function onFilesSelected(files: FileList | null) {
    if (!files) return;
    const newRows: Row[] = Array.from(files).map((file) => ({ file, status: "queued" }));
    setRows((prev) => [...prev, ...newRows]);
  }

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  // Screenshots are processed one at a time, each through all four
  // stages, so Tesseract.js (single shared worker) and the Groq API
  // aren't hit with 100 parallel requests at once.
  async function startProcessing() {
    setRunning(true);

    for (let i = 0; i < rows.length; i++) {
      if (rows[i].status !== "queued") continue;

      try {
        updateRow(i, { status: "uploading" });
        const { imageUrl, deleteUrl } = await uploadToImageBb(rows[i].file);
        const imageId = await createScreenshotDoc({
          imageUrl,
          deleteUrl,
          fileName: rows[i].file.name,
          researchProjectId: RESEARCH_PROJECT_ID,
          researcherId: auth.currentUser!.uid,
        });
        updateRow(i, { imageId });

        updateRow(i, { status: "ocr running" });
        await updateScreenshotStatus(imageId, "ocr_pending");
        const { rawText, confidence } = await runOcr(rows[i].file, (detail) => updateRow(i, { detail }));
        await createOcrResultDoc({ imageId, rawText, confidence });
        await updateScreenshotStatus(imageId, "ocr_done");
        updateRow(i, { status: "ocr done", detail: undefined });

        updateRow(i, { status: "classifying" });
        await processImage(imageId); // OCR text -> Groq: split, correct, translate, classify
        updateRow(i, { status: "done" });
      } catch (err) {
        updateRow(i, { status: "error", detail: (err as Error).message });
      }
    }

    setRunning(false);
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="card">
        <p style={{ marginTop: 0 }}>
          Upload screenshots of social-media posts and comments for analysis. Each
          screenshot is uploaded to ImageBB, processed with Amharic optical character
          recognition (Tesseract.js, running locally in your browser at no cost), and
          then classified using Groq.
        </p>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={running}
          onChange={(e) => onFilesSelected(e.target.files)}
        />
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button className="btn" onClick={startProcessing} disabled={running || rows.every((r) => r.status !== "queued")}>
            {running ? "Processing…" : `Process ${rows.filter((r) => r.status === "queued").length} screenshot(s)`}
          </button>
          <button
            className="btn btn-outline"
            onClick={() => setRows([])}
            disabled={running || rows.length === 0}
          >
            Reset
          </button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="card">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>
                <th style={{ padding: "6px 4px" }}>File</th>
                <th style={{ padding: "6px 4px" }}>Status</th>
                <th style={{ padding: "6px 4px" }}>Image ID</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "6px 4px" }}>{row.file.name}</td>
                  <td style={{ padding: "6px 4px" }}>
                    <span className="pill" style={{ borderColor: row.status === "error" ? "var(--sev-critical)" : undefined, color: row.status === "error" ? "var(--sev-critical)" : undefined }}>
                      {row.status}
                    </span>
                    {row.detail ? <span style={{ marginLeft: 8, color: "var(--ink-muted)" }}>{row.detail}</span> : null}
                  </td>
                  <td className="mono" style={{ padding: "6px 4px", fontSize: 11 }}>{row.imageId ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
