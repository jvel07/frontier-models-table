import React from "react";
import { createRoot } from "react-dom/client";
import FrontierModelsTable from "./FrontierModelsTable.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FrontierModelsTable />
  </React.StrictMode>
);
