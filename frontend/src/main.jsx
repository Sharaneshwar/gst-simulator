import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "../portal.css";
import "../fixes.css";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
