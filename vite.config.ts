import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // O servidor de desenvolvimento recusa por padrão requisições cujo host
    // não seja localhost. Isso impede abrir o app por túnel, proxy reverso ou
    // ambiente de preview, que é como o time costuma testar em celular.
    // O ponto inicial libera os subdomínios do domínio informado.
    allowedHosts: ['.e2b.app', '.loca.lt', '.ngrok-free.app', 'localhost'],
    host: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
