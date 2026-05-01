import React from "react";
import ReactDOM from "react-dom/client";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Expected #root element to exist.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#000000",
        color: "#ffffff",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        padding: "24px",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "360px",
          border: "1px solid #ffffff",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "32px" }}>Content Relay</h1>
        <p style={{ margin: "16px 0 0", fontSize: "16px", lineHeight: 1.5 }}>Hello world.</p>
      </section>
    </main>
  </React.StrictMode>,
);
