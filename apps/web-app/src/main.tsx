import "material-symbols/rounded.css";
import "@fontsource/rubik/400.css";
import "@fontsource/rubik/700.css";
import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "#pkg/app/app.js";
import { AppErrorBoundary } from "#pkg/app/components/app-error-boundary.js";
import { GlobalProviders } from "#pkg/app/global-providers.js";
import { cssBase, cssReset } from "#pkg/app/global-styles.ts";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Expected #root element to exist.");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <style dangerouslySetInnerHTML={{ __html: cssReset }} />
    <style dangerouslySetInnerHTML={{ __html: cssBase }} />

    <GlobalProviders>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </GlobalProviders>
  </React.StrictMode>,
);
