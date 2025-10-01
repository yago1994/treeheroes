import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/treeheroes/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
});
