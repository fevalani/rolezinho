import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";
import "./styles/seasons/natal.css";
import "./styles/seasons/republica.css";
import "./styles/seasons/anonovo.css";
import "./styles/seasons/pascoa.css";
import "./styles/seasons/generic.css";
import "./styles/seasons/letras.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register Service Worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => console.log("SW registered:", reg.scope))
      .catch((err) => console.log("SW registration failed:", err));
  });
}
