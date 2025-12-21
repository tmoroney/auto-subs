import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { GlobalProvider } from "@/contexts/GlobalProvider";
import { Toaster } from "@/components/ui/sonner";
import { initI18n } from "@/i18n";

initI18n("en");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
      <GlobalProvider>
        <App />
        <Toaster />
      </GlobalProvider>
    </React.StrictMode>
);
