import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/main.scss";

const rootElement = document.getElementById("root");
if (!rootElement) {
  console.error("Root element not found!");
} else {
  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Error rendering React app:", error);
  }
}
``;
