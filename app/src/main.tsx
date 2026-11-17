import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// Полноэкранный тач-режим: гасим масштабирование по двойному тапу
let lastTouchEnd = 0;
document.addEventListener(
  "touchend",
  (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable]")) return;
      e.preventDefault();
    }
    lastTouchEnd = now;
  },
  { passive: false }
);
document.addEventListener("gesturestart", (e) => e.preventDefault());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
