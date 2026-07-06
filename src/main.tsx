import ReactDOM, { type Root } from "react-dom/client";
import App from "./App";
import { CapturePane } from "./CapturePane";
import "./styles.css";

const isCapture = window.location.hash === "#capture";

if (isCapture) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

// HMR-safe: if a full-page module invalidation re-runs this file, reuse the
// existing root instead of mounting a second React tree over the first.
const w = window as unknown as { __flowRoot?: Root };
const root = (w.__flowRoot ??= ReactDOM.createRoot(document.getElementById("root")!));
root.render(isCapture ? <CapturePane /> : <App />);
