import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import { loadDataset, ALL_THEMES, THEME_LABELS, NO_THEME_LABEL, type DatasetRow } from "../lib/dataset";
import { exportToExcel, exportToCsv, exportToJson } from "../lib/exportDataset";
import { saveAnnotation } from "../lib/firestore";
import { auth } from "../firebase";
import type { ReviewStatus, Severity, TargetType, Theme } from "../types/research";

const TARGET_TYPES: TargetType[] = ["individual", "group", "women_general", "unclear"];
const REVIEW_STATUSES: ReviewStatus[] = ["pending", "accepted", "modified", "rejected"];

const SEVERITY_ORDER: Severity[] = ["none", "low", "moderate", "high", "critical"];
const SEVERITY_COLOR: Record<Severity, string> = {
  none: "var(--sev-none)",
  low: "var(--sev-low)",
  moderate: "var(--sev-moderate)",
  high: "var(--sev-high)",
  critical: "var(--sev-critical)",
};
const THEME_COLOR: Record<Theme, string> = {
  victim_blaming: "var(--t-victim-blaming)",
  normalization_of_gbv: "var(--t-normalization)",
  survivor_support: "var(--t-survivor-support)",
  gender_stereotypes_misogyny: "var(--t-misogyny)",
  online_harassment_abuse: "var(--t-harassment)",
  feminist_resistance: "var(--t-feminist-resistance)",
  silence_self_censorship: "var(--t-silence)",
};
const NO_THEME_COLOR = "var(--t-none)";

function resolveColor(cssVar: string): string {
  if (typeof window === "undefined") return "#999";
  const varName = cssVar.replace("var(", "").replace(")", "");
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#999";
}

export default function DashboardPage() {
  const [rows, setRows] = useState<DatasetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [themeFilter, setThemeFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [showRawTable, setShowRawTable] = useState(false);

  useEffect(() => {
    loadDataset()
      .then(setRows)
      .catch((err) => setError(err.message));
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (platformFilter !== "all" && r.platform !== platformFilter) return false;
      if (severityFilter !== "all" && r.severity !== severityFilter) return false;
      if (themeFilter === "__none__" && r.theme !== null) return false;
      if (themeFilter !== "all" && themeFilter !== "__none__" && r.theme !== themeFilter) return false;
      if (reviewFilter !== "all" && r.humanReviewStatus !== reviewFilter) return false;
      return true;
    });
  }, [rows, platformFilter, severityFilter, themeFilter, reviewFilter]);

  const platforms = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.platform))).sort(),
    [rows]
  );

  const screenshotCount = useMemo(() => new Set(filtered.map((r) => r.imageId)).size, [filtered]);
  const violentCount = filtered.filter((r) => r.violencePresent).length;
  const nonViolentCount = filtered.filter((r) => !r.violencePresent && r.theme !== null).length;
  const uncertainCount = filtered.length - violentCount - nonViolentCount;

  const themeFrequency = useMemo(() => {
    const counts = new Map<Theme, number>();
    for (const t of ALL_THEMES) counts.set(t, 0);
    for (const row of filtered) {
      if (row.theme) counts.set(row.theme, (counts.get(row.theme) ?? 0) + 1);
    }
    return ALL_THEMES.map((t) => ({
      theme: t,
      label: THEME_LABELS[t],
      count: counts.get(t) ?? 0,
    })).sort((a, b) => b.count - a.count);
  }, [filtered]);

  const severityBreakdown = useMemo(() => {
    const counts = new Map<Severity, number>();
    for (const s of SEVERITY_ORDER) counts.set(s, 0);
    for (const row of filtered) {
      counts.set(row.severity as Severity, (counts.get(row.severity as Severity) ?? 0) + 1);
    }
    return SEVERITY_ORDER.map((s) => ({ name: s, value: counts.get(s) ?? 0 }));
  }, [filtered]);

  const platformComparison = useMemo(() => {
    return platforms.map((platform) => {
      const row: Record<string, string | number> = { platform };
      for (const t of ALL_THEMES) {
        row[t] = filtered.filter((r) => r.platform === platform && r.theme === t).length;
      }
      return row;
    });
  }, [filtered, platforms]);

  const noThemeCount = filtered.filter((r) => r.theme === null).length;
  const totalCoded = filtered.length || 1;

  if (error) {
    return (
      <div className="card">
        <strong>Couldn't load the dataset.</strong>
        <p className="mono" style={{ fontSize: 13, color: "var(--ink-muted)" }}>{error}</p>
        <p style={{ fontSize: 13, color: "var(--ink-muted)" }}>
          Confirm Firebase Auth is wired up and Firestore rules allow reads for signed-in
          researchers (see README).
        </p>
      </div>
    );
  }

  if (rows === null) {
    return <div style={{ color: "var(--ink-muted)" }}>Loading dataset…</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 48 }}>
        <h2 style={{ marginTop: 0 }}>No coded comments yet</h2>
        <p style={{ color: "var(--ink-muted)" }}>
          Nothing has been processed into <span className="mono">comments</span> /{" "}
          <span className="mono">classifications</span> yet.
        </p>
        <Link to="/" className="btn" style={{ textDecoration: "none", display: "inline-block" }}>
          Go to Upload
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Filters */}
      <div className="card" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <FilterSelect label="Platform" value={platformFilter} onChange={setPlatformFilter} options={["all", ...platforms]} />
        <FilterSelect label="Severity" value={severityFilter} onChange={setSeverityFilter} options={["all", ...SEVERITY_ORDER]} />
        <FilterSelect
          label="Theme"
          value={themeFilter}
          onChange={setThemeFilter}
          options={["all", "__none__", ...ALL_THEMES]}
          labels={{ all: "All", __none__: NO_THEME_LABEL, ...THEME_LABELS }}
        />
        <FilterSelect
          label="Review status"
          value={reviewFilter}
          onChange={setReviewFilter}
          options={["all", "pending", "accepted", "modified", "rejected"]}
        />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setShowRawTable((v) => !v)}>
            {showRawTable ? "Hide raw table" : "View raw table"}
          </button>
          <button className="btn" onClick={() => exportToExcel(filtered)}>Export Excel</button>
          <button className="btn btn-outline" onClick={() => exportToCsv(filtered)}>CSV</button>
          <button className="btn btn-outline" onClick={() => exportToJson(filtered)}>JSON</button>
        </div>
      </div>

      {showRawTable && (
        <RawTable
          rows={filtered}
          onAnnotationSaved={(commentId, patch) =>
            setRows((prev) =>
              prev ? prev.map((r) => (r.commentId === commentId ? { ...r, ...patch } : r)) : prev
            )
          }
        />
      )}

      {/* Signature: signal vs. silence composition bar */}
      <div className="card">
        <div className="stat-label" style={{ marginBottom: 10 }}>Theme composition — signal vs. silence</div>
        <div style={{ display: "flex", height: 28, borderRadius: 4, overflow: "hidden", border: "1px solid var(--line)" }}>
          {themeFrequency
            .filter((t) => t.count > 0)
            .map((t) => (
              <div
                key={t.theme}
                title={`${t.label}: ${t.count} (${((t.count / totalCoded) * 100).toFixed(1)}%)`}
                style={{
                  width: `${(t.count / totalCoded) * 100}%`,
                  background: resolveColor(THEME_COLOR[t.theme]),
                  backgroundImage:
                    t.theme === "silence_self_censorship"
                      ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.5) 0 4px, transparent 4px 8px)"
                      : undefined,
                }}
              />
            ))}
          {noThemeCount > 0 && (
            <div
              title={`${NO_THEME_LABEL}: ${noThemeCount} (${((noThemeCount / totalCoded) * 100).toFixed(1)}%)`}
              style={{ width: `${(noThemeCount / totalCoded) * 100}%`, background: resolveColor(NO_THEME_COLOR) }}
            />
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 12, fontSize: 12 }}>
          {themeFrequency.map((t) => (
            <span key={t.theme} style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-muted)" }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: resolveColor(THEME_COLOR[t.theme]),
                  display: "inline-block",
                }}
              />
              {t.label} <span className="mono">{t.count}</span>
            </span>
          ))}
          {noThemeCount > 0 && (
            <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-muted)" }}>
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: resolveColor(NO_THEME_COLOR),
                  display: "inline-block",
                }}
              />
              {NO_THEME_LABEL} <span className="mono">{noThemeCount}</span>
            </span>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Stat label="Screenshots" value={screenshotCount} />
        <Stat label="Coded comments" value={filtered.length} />
        <Stat label="Violent" value={violentCount} accent="var(--sev-critical)" />
        <Stat label="Non-violent" value={nonViolentCount} accent="var(--t-survivor-support)" />
        <Stat label="Uncertain / mixed" value={Math.max(uncertainCount, 0)} accent="var(--amber)" />
      </div>

      {/* Theme frequency */}
      <div className="card">
        <div className="stat-label" style={{ marginBottom: 12 }}>Theme frequency</div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={themeFrequency} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} />
            <YAxis
              type="category"
              dataKey="label"
              width={200}
              tick={{ fontFamily: "Space Grotesk", fontSize: 12 }}
            />
            <Tooltip />
            <Bar dataKey="count" radius={[0, 3, 3, 0]}>
              {themeFrequency.map((t) => (
                <Cell key={t.theme} fill={resolveColor(THEME_COLOR[t.theme])} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Severity breakdown */}
        <div className="card">
          <div className="stat-label" style={{ marginBottom: 12 }}>Severity breakdown</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={severityBreakdown}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
              >
                {severityBreakdown.map((s) => (
                  <Cell key={s.name} fill={resolveColor(SEVERITY_COLOR[s.name as Severity])} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Platform x theme comparison */}
        <div className="card">
          <div className="stat-label" style={{ marginBottom: 12 }}>Platform comparison</div>
          {platforms.length === 0 ? (
            <p style={{ color: "var(--ink-muted)", fontSize: 13 }}>
              No platform set on any screenshot yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={platformComparison}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="platform" tick={{ fontFamily: "Space Grotesk", fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontFamily: "IBM Plex Mono", fontSize: 11 }} />
                <Tooltip />
                {ALL_THEMES.map((t) => (
                  <Bar key={t} dataKey={t} stackId="a" fill={resolveColor(THEME_COLOR[t])} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

interface EditState {
  theme: Theme | "";
  severity: Severity;
  targetType: TargetType;
  reviewStatus: ReviewStatus;
  notes: string;
}

function RawTable({
  rows,
  onAnnotationSaved,
}: {
  rows: DatasetRow[];
  onAnnotationSaved: (commentId: string, patch: Partial<DatasetRow>) => void;
}) {
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEdit(row: DatasetRow) {
    setEditingCommentId(row.commentId);
    setSaveError(null);
    setEditState({
      theme: row.humanTheme ?? row.theme ?? "",
      severity: (row.severity as Severity) || "none",
      targetType: (row.targetType as TargetType) || "unclear",
      reviewStatus:
        (row.humanReviewStatus as ReviewStatus) === "pending" ? "accepted" : (row.humanReviewStatus as ReviewStatus),
      notes: row.researcherNotes,
    });
  }

  function cancelEdit() {
    setEditingCommentId(null);
    setEditState(null);
    setSaveError(null);
  }

  async function save(row: DatasetRow) {
    const researcherId = auth.currentUser?.uid;
    if (!editState || !researcherId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveAnnotation({
        commentId: row.commentId,
        imageId: row.imageId,
        researcherId,
        reviewStatus: editState.reviewStatus,
        theme: editState.theme || null,
        severity: editState.severity,
        targetType: editState.targetType,
        notes: editState.notes || undefined,
      });
      onAnnotationSaved(row.commentId, {
        humanReviewStatus: editState.reviewStatus,
        humanTheme: editState.theme || null,
        researcherNotes: editState.notes,
      });
      setEditingCommentId(null);
      setEditState(null);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="stat-label" style={{ marginBottom: 12 }}>
        Raw data ({rows.length.toLocaleString()} row{rows.length === 1 ? "" : "s"}) — edits save as your
        independent review, the AI's own coding is never overwritten
      </div>
      {saveError && (
        <p className="mono" style={{ fontSize: 12, color: "var(--sev-critical)" }}>{saveError}</p>
      )}
      <div style={{ overflow: "auto", maxHeight: 480 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, whiteSpace: "nowrap" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>
              {[
                "Screenshot",
                "Image ID",
                "Comment ID",
                "Platform",
                "Date",
                "Raw Amharic",
                "Corrected Amharic",
                "English Translation",
                "Violence",
                "Theme",
                "Severity",
                "Target",
                "AI Confidence",
                "Human Review",
                "Human Theme",
                "Notes",
                "Likes",
                "Replies",
                "",
              ].map((h) => (
                <th key={h} style={{ padding: "6px 10px", position: "sticky", top: 0, background: "var(--surface)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isEditing = editingCommentId === r.commentId;
              return (
                <tr key={r.commentId} style={{ borderBottom: "1px solid var(--line)" }}>
                  <td style={{ padding: "6px 10px" }}>
                    {r.imageUrl ? (
                      <a href={r.imageUrl} target="_blank" rel="noreferrer">
                        View
                      </a>
                    ) : (
                      ""
                    )}
                  </td>
                  <td className="mono" style={{ padding: "6px 10px" }}>{r.imageId}</td>
                  <td className="mono" style={{ padding: "6px 10px" }}>{r.commentId}</td>
                  <td style={{ padding: "6px 10px" }}>{r.platform}</td>
                  <td style={{ padding: "6px 10px" }}>{r.date}</td>
                  <td style={{ padding: "6px 10px", whiteSpace: "normal", maxWidth: 220 }}>{r.rawAmharic}</td>
                  <td style={{ padding: "6px 10px", whiteSpace: "normal", maxWidth: 220 }}>{r.correctedAmharic}</td>
                  <td style={{ padding: "6px 10px", whiteSpace: "normal", maxWidth: 260 }}>{r.englishTranslation}</td>
                  <td style={{ padding: "6px 10px" }}>{r.violencePresent ? "Yes" : "No"}</td>
                  <td style={{ padding: "6px 10px" }}>
                    {isEditing && editState ? (
                      <select
                        className="select"
                        value={editState.theme}
                        onChange={(e) => setEditState({ ...editState, theme: e.target.value as Theme | "" })}
                      >
                        <option value="">{NO_THEME_LABEL}</option>
                        {ALL_THEMES.map((t) => (
                          <option key={t} value={t}>{THEME_LABELS[t]}</option>
                        ))}
                      </select>
                    ) : (
                      r.theme ? THEME_LABELS[r.theme] : NO_THEME_LABEL
                    )}
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    {isEditing && editState ? (
                      <select
                        className="select"
                        value={editState.severity}
                        onChange={(e) => setEditState({ ...editState, severity: e.target.value as Severity })}
                      >
                        {SEVERITY_ORDER.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      r.severity
                    )}
                  </td>
                  <td style={{ padding: "6px 10px" }}>
                    {isEditing && editState ? (
                      <select
                        className="select"
                        value={editState.targetType}
                        onChange={(e) => setEditState({ ...editState, targetType: e.target.value as TargetType })}
                      >
                        {TARGET_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    ) : (
                      r.targetType
                    )}
                  </td>
                  <td className="mono" style={{ padding: "6px 10px" }}>{r.aiConfidence.toFixed(2)}</td>
                  <td style={{ padding: "6px 10px" }}>
                    {isEditing && editState ? (
                      <select
                        className="select"
                        value={editState.reviewStatus}
                        onChange={(e) => setEditState({ ...editState, reviewStatus: e.target.value as ReviewStatus })}
                      >
                        {REVIEW_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    ) : (
                      r.humanReviewStatus
                    )}
                  </td>
                  <td style={{ padding: "6px 10px" }}>{r.humanTheme ? THEME_LABELS[r.humanTheme] : NO_THEME_LABEL}</td>
                  <td style={{ padding: "6px 10px", whiteSpace: "normal", maxWidth: 200 }}>
                    {isEditing && editState ? (
                      <input
                        className="select"
                        style={{ width: "100%" }}
                        value={editState.notes}
                        onChange={(e) => setEditState({ ...editState, notes: e.target.value })}
                      />
                    ) : (
                      r.researcherNotes
                    )}
                  </td>
                  <td className="mono" style={{ padding: "6px 10px" }}>{r.likes ?? ""}</td>
                  <td className="mono" style={{ padding: "6px 10px" }}>{r.replies ?? ""}</td>
                  <td style={{ padding: "6px 10px" }}>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn" disabled={saving} onClick={() => save(r)}>
                          {saving ? "Saving…" : "Save"}
                        </button>
                        <button className="btn btn-outline" disabled={saving} onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-outline" onClick={() => startEdit(r)}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="card">
      <div className="stat-value" style={accent ? { color: accent } : undefined}>
        {value.toLocaleString()}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <label style={{ fontSize: 12, color: "var(--ink-muted)", display: "flex", flexDirection: "column", gap: 4 }}>
      {label}
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? (o === "all" ? "All" : o)}
          </option>
        ))}
      </select>
    </label>
  );
}
