"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "grid",
          placeItems: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#F8FAFC",
          color: "#0F172A",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center", padding: 24 }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: "0 auto 16px",
              display: "grid",
              placeItems: "center",
              borderRadius: 18,
              background: "#FEE2E2",
              color: "#DC2626",
              fontSize: 28,
              fontWeight: 800,
            }}
          >
            X
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Xcel hit a critical error
          </h1>
          <p style={{ color: "#64748B", fontSize: 14, lineHeight: 1.6 }}>
            The application failed to render. Reload the page — if the problem
            persists, contact support with this code:{" "}
            <span style={{ fontFamily: "monospace", fontSize: 12 }}>
              {error.digest ?? "n/a"}
            </span>
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              padding: "10px 22px",
              borderRadius: 999,
              border: "none",
              background: "#059669",
              color: "#fff",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reload Xcel
          </button>
        </div>
      </body>
    </html>
  );
}
