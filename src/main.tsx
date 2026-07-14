import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";

if (Capacitor.getPlatform() === "android") {
  document.documentElement.classList.add("capacitor-android");
}

createRoot(document.getElementById("root")!).render(<App />);
