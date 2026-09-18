"use client";

/**
 * Last resort: an error in the root layout itself, where the app's own chrome and
 * stylesheet may not have rendered. It therefore ships its own <html>/<body> and inline
 * styles rather than assuming anything survived.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0e1116",
          color: "#f4f3f0",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 800, margin: 0 }}>Edge could not start</h1>
          <p style={{ color: "#c9c7c1", lineHeight: 1.6, marginTop: "10px" }}>
            Something failed before the app loaded. Reloading usually fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "20px", padding: "12px 22px", borderRadius: "12px", border: 0,
              background: "#22a468", color: "#fff", fontWeight: 700, fontSize: "15px", cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ color: "#9a9892", fontSize: "12px", marginTop: "16px" }}>Reference {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
