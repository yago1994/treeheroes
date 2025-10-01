import React from "react";
import ReactDOM from "react-dom/client";
import { HeroUIProvider } from "@heroui/react";
import { ThemeProvider, useTheme } from "./contexts/ThemeContext";
import App from "./App";
import "./index.css";
import "ol/ol.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to find root element");
}

function AppWithTheme() {
  return (
    <HeroUIProvider>
      <App />
    </HeroUIProvider>
  );
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppWithTheme />
    </ThemeProvider>
  </React.StrictMode>
);
