import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/calculator/",
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: false,
  }
});
