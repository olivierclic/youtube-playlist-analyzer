import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Cible du backend pour le proxy de dev (override possible via VITE_API_TARGET).
const apiTarget = process.env.VITE_API_TARGET || "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Le client appelle /api/... en relatif ; Vite proxifie vers le backend.
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
