import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker, startLocationReporting } from "./lib/push";

createRoot(document.getElementById("root")!).render(<App />);

// Register the PWA service worker (enables installability + push notifications).
registerServiceWorker();

// Keep this device's location fresh for new-work push distance hints. No-ops unless
// the associate has subscribed to notifications and already granted location access.
void startLocationReporting();
