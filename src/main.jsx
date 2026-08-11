import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import { RoleProvider } from "./RoleContext.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RoleProvider>
      <App />
    </RoleProvider>
  </React.StrictMode>,
);
