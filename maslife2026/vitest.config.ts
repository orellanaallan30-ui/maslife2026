import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['**/*.{ts,tsx}'],
      exclude: [
        'node_modules/**',
        '__tests__/**',
        'vite.config.ts',
        'vitest.config.ts',
        'index.tsx',
        '**/*.d.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Los módulos de api/_lib viven fuera de esta carpeta, así que no alcanzan
      // node_modules por resolución normal. Sin este alias, cualquier test sobre
      // api/_lib que importe el cliente de Supabase falla al resolverlo — aunque
      // el test lo tenga simulado, Vite necesita resolver el identificador.
      '@supabase/supabase-js': path.resolve(__dirname, 'node_modules/@supabase/supabase-js'),
    },
  },
});
