import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'web',
  // Relative asset URLs so the built folder runs from any static host,
  // sub-path or plain file server with no rewrite rules.
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2022',
    // Split the two large vendor libraries into their own chunks so no single
    // bundle trips the 500 kB warning and browsers can cache them separately.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules') && id.includes('react')) return 'react';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5178',
      '/media': 'http://127.0.0.1:5178',
    },
  },
});
