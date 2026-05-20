import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    css: false,
    env: {
      VITE_API_BASE_URL: 'http://localhost:4000',
      VITE_SOCKET_URL: 'http://localhost:4000',
      VITE_APP_ENV: 'development',
    },
  },
});
