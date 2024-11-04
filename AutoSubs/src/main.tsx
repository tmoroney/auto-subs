import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { GlobalProvider } from './GlobalContext';

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <GlobalProvider>
      <App />
    </GlobalProvider>
  </React.StrictMode>,
);
