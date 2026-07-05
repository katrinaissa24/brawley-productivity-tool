import ReactDOM from "react-dom/client";
import App from "./App";
import { CapturePane } from "./CapturePane";
import "./styles.css";

const isCapture = window.location.hash === "#capture";

if (isCapture) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  isCapture ? <CapturePane /> : <App />,
);
