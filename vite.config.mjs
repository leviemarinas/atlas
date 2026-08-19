import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    // Honour an assigned PORT so the dev server can start when 5173 is taken.
    port: Number(process.env.PORT) || 5173,
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  preview: {
    allowedHosts: ["atlas-mockup.onrender.com"],
  },
  plugins: [react()],
});
