import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { fetch } from '@tauri-apps/plugin-http';
import { GlobalProvider } from "@/GlobalContext";

const resolveAPI = "http://localhost:5016/";

const MainComponent: React.FC = () => {
  useEffect(() => {
    getCurrentWindow().once("tauri://close-requested", async function () {
      console.log("Exiting...");
      try {
        await fetch(resolveAPI, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ func: "Exit" }),
        });
      } catch (error) {
        console.error('Error during exit request:', error);
      }
      await getCurrentWindow().close();
    });
  }, []);

  return (
    <React.StrictMode>
      <GlobalProvider>
        <App />
      </GlobalProvider>
    </React.StrictMode>
  );
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <MainComponent />
);
