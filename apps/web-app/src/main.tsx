import "material-symbols/rounded.css";
import "@fontsource/rubik/400.css";
import "@fontsource/rubik/700.css";
import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "#src/app/app.js";
import { AppErrorBoundary } from "#src/app/components/app-error-boundary.js";
import { GlobalProviders } from "#src/app/global-providers.js";
import { cssBase, cssReset } from "#src/app/global-styles.ts";

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
