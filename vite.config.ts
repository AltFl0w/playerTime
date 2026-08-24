import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Relative base so the same build works at any path (GitHub Pages serves
  // from /playerTime/, local preview from /).
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: ["macbook-pro.taila8b7da.ts.net"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
