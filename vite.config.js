import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Use relative base in production so it works on custom domains and subpaths
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
});
