import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

/* =========================================================================
   Two landing pages, one app.

   There is no router here on purpose: the whole app is a single screen, and the
   only thing /lv changes is the accent colour. A router would add a dependency
   and a load of client-side navigation for a page that is chosen once, at load,
   from the URL.

   /lv sets a data attribute on <html>, and one CSS rule (see index.css) swaps
   --accent and --accent-deep. Every `lime-*` utility in the app reads those two
   variables, so the entire page re-skins — buttons, dots, rings, the G mark, the
   launch screen — without a single component knowing about it.
   ========================================================================= */

const isLV = /^\/lv\/?$/.test(window.location.pathname);

if (isLV) {
  document.documentElement.setAttribute("data-theme", "lv");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
