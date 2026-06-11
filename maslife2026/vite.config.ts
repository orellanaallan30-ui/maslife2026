import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    define: {
      // VITE_AI_ENABLED=true en Vercel activa el indicador de IA en el cliente.
      // La API key real (ANTHROPIC_API_KEY / GEMINI_API_KEY) solo vive en el servidor.
      'process.env.AI_ENABLED': JSON.stringify(env.VITE_AI_ENABLED || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
