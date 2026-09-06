import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const appRoot = document.getElementById("root");

if (!appRoot) throw new Error("Application root was not found.");

createRoot(appRoot).render(
  <StrictMode>
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-bold text-slate-900">
        GSoC Contributor Copilot
      </h1>
      <p className="mt-3 text-slate-600">
        Foundation setup is complete.
      </p>
    </main>
  </StrictMode>,
);
