import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    // Aquí vivía 'process.env.AI_ENABLED', que exponía VITE_AI_ENABLED al cliente.
    // Se retira porque no encendía nada: la ficha lo usaba solo para pintar un
    // indicador y el saludo del chat, mientras las llamadas a /api/clinical-agent
    // se hacían igual. Una palanca que aparenta gobernar la IA sin gobernarla es
    // peor que no tenerla. La API key real solo vive en el servidor.
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
