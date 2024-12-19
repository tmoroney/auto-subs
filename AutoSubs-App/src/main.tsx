import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { GlobalProvider } from "@/GlobalContext";
import { Toaster } from "@/components/ui/sonner";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
      <GlobalProvider>
        <App />
        <Toaster />
      </GlobalProvider>
    </React.StrictMode>
);
