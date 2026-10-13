import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server on http://localhost:5173 — the origin the FastAPI CORS list allows.
export default defineConfig({
  plugins: [react()],
  // 127.0.0.1 (IPv4) so both http://localhost:5173 and http://127.0.0.1:5173 work;
  // with host "localhost" Vite bound only to IPv6 ::1 and 127.0.0.1 refused to connect.
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
