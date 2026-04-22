/// <reference types="vitest" />
// ──────────────────────────────────────────────────────────────────────────────
// Vitest config (separada do vite.config.ts para isolar o ambiente de testes)
//
// Por que separada?
//   • vite.config.ts tem um proxy custom de `react-router-dom` que interfere
//     em testes de componente que renderizam rotas.
//   • vite.config.ts inclui plugins (lovable-tagger, cdn-prefix-images,
//     tailwindcss) desnecessários e possivelmente pesados para testes.
//   • Configuração dedicada facilita CI futura.
//
// Ambiente: happy-dom (mais leve que jsdom, suficiente para Testing Library).
// ──────────────────────────────────────────────────────────────────────────────
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Por padrão ignora node_modules, dist etc. — mantemos o padrão.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Excluímos arquivos de tipo e mocks compartilhados.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/test/__mocks__/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/**/*.d.ts',
        'src/main.tsx',
        'src/vite-env.d.ts',
      ],
      thresholds: {
        // Baixos inicialmente — subiremos conforme a cobertura crescer.
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },
    },
  },
});
