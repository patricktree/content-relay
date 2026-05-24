import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/latin-800.css";
import "material-symbols/rounded.css";
import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "#pkg/app/App.tsx";
import { GlobalProviders } from "#pkg/app/global-providers.js";
import { cssBase, cssReset } from "#pkg/app/global-styles.ts";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Expected #root element to exist.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <GlobalProviders>
      <style dangerouslySetInnerHTML={{ __html: cssReset }} />
      <style dangerouslySetInnerHTML={{ __html: cssBase }} />

      <App />
    </GlobalProviders>
  </React.StrictMode>,
);
