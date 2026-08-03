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
  // Constantes que o `vite.config.ts` injeta no build. Sem elas aqui, qualquer
  // módulo que as leia no topo do arquivo estoura com "is not defined" no teste.
  // Constantes que o `vite.config.ts` injeta no build. Sem elas aqui, qualquer
  // módulo que as leia no topo do arquivo estoura com "is not defined".
  define: {
    __APP_RELEASE__: JSON.stringify('teste'),
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
        // Cola de build, não código de produto: só existe quando o alias de
        // `vite.config.ts` está ativo, e o alias não existe aqui. Sem ele o
        // import de 'react-router-dom-original' não resolve, a transformação
        // falha, e o v8 acaba tentando ler o TSX cru como JavaScript:
        // "RolldownError: Parse failed". O arquivo já ficava fora da conta —
        // isto só troca o erro por uma exclusão declarada.
        'src/lib/react-router-dom-proxy.tsx',
      ],
      thresholds: {
        // Catraca: cada valor fica logo abaixo do que a suíte entrega hoje
        // (27,93 / 22,94 / 21,56 / 26,84 em 2026-08-03). A folga é pequena de
        // propósito — o portão só serve enquanto doer descer. Ao subir a
        // cobertura, suba estes números junto, no mesmo commit.
        lines: 27.5,
        functions: 22.5,
        branches: 21,
        statements: 26.5,
      },
    },
  },
});
