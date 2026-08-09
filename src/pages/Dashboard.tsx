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
import { loadDataset, ALL_THEMES, THEME_LABELS, type DatasetRow } from "../lib/dataset";
import { exportToExcel, exportToCsv, exportToJson } from "../lib/exportDataset";
import type { Severity, Theme } from "../types/research";

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
  no_apparent_violence: "var(--t-none)",
};

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
      if (themeFilter !== "all" && !r.themes.includes(themeFilter as Theme)) return false;
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
  const nonViolentCount = filtered.filter(
    (r) => !r.violencePresent && r.themes.length > 0 && !r.themes.includes("no_apparent_violence")
  ).length;
  const uncertainCount = filtered.length - violentCount - nonViolentCount;

  const themeFrequency = useMemo(() => {
    const counts = new Map<Theme, number>();
    for (const t of ALL_THEMES) counts.set(t, 0);
    for (const row of filtered) {
      for (const t of row.themes) counts.set(t, (counts.get(t) ?? 0) + 1);
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
        row[t] = filtered.filter((r) => r.platform === platform && r.themes.includes(t)).length;
      }
      return row;
    });
  }, [filtered, platforms]);

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
          options={["all", ...ALL_THEMES]}
          labels={{ all: "All", ...THEME_LABELS }}
        />
        <FilterSelect
          label="Review status"
          value={reviewFilter}
          onChange={setReviewFilter}
          options={["all", "pending", "accepted", "modified", "rejected"]}
        />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => exportToExcel(filtered)}>Export Excel</button>
          <button className="btn btn-outline" onClick={() => exportToCsv(filtered)}>CSV</button>
          <button className="btn btn-outline" onClick={() => exportToJson(filtered)}>JSON</button>
        </div>
      </div>

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
