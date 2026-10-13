import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server on http://localhost:5173 — the origin the FastAPI CORS list allows.
export default defineConfig({
  plugins: [react()],
  server: { host: "localhost", port: 5173, strictPort: true },
});
