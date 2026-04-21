import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./App.css";
import { GlobalProvider } from "@/contexts/GlobalProvider";
import { Toaster } from "@/components/ui/sonner";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
      <GlobalProvider>
        <App />
        <Toaster />
      </GlobalProvider>
    </React.StrictMode>
);
