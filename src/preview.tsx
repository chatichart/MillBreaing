import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./components/App";
import { PreviewRepository } from "./repositories/PreviewRepository";
const repo = new PreviewRepository();
createRoot(document.getElementById("root")!).render(
  <App repository={repo} user="Preview Purchasing User" />,
);
