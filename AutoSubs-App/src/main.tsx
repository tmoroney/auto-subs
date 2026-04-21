import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/figtree/300.css";
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";
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
