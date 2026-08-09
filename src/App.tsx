import { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import UploadPage from "./pages/Upload";
import DashboardPage from "./pages/Dashboard";
import ReviewPage from "./pages/Review";
import { ensureSignedIn } from "./lib/auth";

export default function App() {
  const location = useLocation();
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    ensureSignedIn()
      .then(() => setAuthReady(true))
      .catch((err) => setAuthError(err.message));
  }, []);

  const navLink = (to: string, label: string) => {
    const active = location.pathname === to;
    return (
      <Link
        to={to}
        className={active ? "pill" : "pill"}
        style={{
          marginRight: 8,
          textDecoration: "none",
          background: active ? "var(--ink)" : "transparent",
          color: active ? "var(--surface)" : "var(--ink-muted)",
          borderColor: active ? "var(--ink)" : "var(--line)",
        }}
      >
        {label}
      </Link>
    );
  };

  if (authError) {
    return (
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
        <div className="card">
          <strong>Couldn't sign in.</strong>
          <p className="mono" style={{ fontSize: 13, color: "var(--ink-muted)" }}>{authError}</p>
          <p style={{ fontSize: 13, color: "var(--ink-muted)" }}>
            Confirm the Anonymous provider is enabled in the Firebase console
            (Authentication → Sign-in method → Anonymous).
          </p>
        </div>
      </div>
    );
  }

  if (!authReady) {
    return (
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24, color: "var(--ink-muted)" }}>
        Signing in…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
      <header style={{ marginBottom: 24, display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 19, fontWeight: 600, margin: 0 }}>Mapping the Silence</h1>
        <nav>
          {navLink("/", "Upload")}
          {navLink("/review", "Review")}
          {navLink("/dashboard", "Dashboard")}
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </main>
    </div>
  );
}
