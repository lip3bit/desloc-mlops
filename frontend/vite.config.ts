import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Swagger do backend acessível pelo mesmo endereço do app
      '/docs': 'http://localhost:8000',
      '/openapi.json': 'http://localhost:8000',
    },
  },
  preview: {
    port: 4173,
  },
});
