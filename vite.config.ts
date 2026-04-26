// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { componentTagger } from 'lovable-tagger';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';

import { cdnPrefixImages } from './vite-plugins/cdn-prefix-images';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  return {
    server: {
      host: '::',
      port: 8080,
    },
    plugins: [
      tailwindcss(),
      react(),
      mode === 'development' && componentTagger(),
      cdnPrefixImages(),
      // Ativo apenas em `npm run analyze` (mode=analyze): gera stats.html com mapa do bundle.
      mode === 'analyze' && visualizer({ open: true, gzipSize: true, brotliSize: true, filename: 'stats.html' }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // Proxy customizado de react-router-dom para integração com o editor Lovable.
        // O wrapper intercepta <Routes>, <HashRouter> e navegações para emitir eventos
        // via postMessage para o iframe pai (ROUTES_INFO, ROUTE_CHANGE, ROUTE_CONTROL).
        // Isso permite que o editor saiba as rotas disponíveis e navegue programaticamente.
        // Em produção, __ROUTE_MESSAGING_ENABLED__ é false por padrão (sem overhead).
        // O alias de 'react-router-dom-original' evita loop de importação circular.
        'react-router-dom': path.resolve(__dirname, './src/lib/react-router-dom-proxy.tsx'),
        'react-router-dom-original': 'react-router-dom',
      },
    },
    define: {
      // Em produção: false por padrão, a menos que VITE_ENABLE_ROUTE_MESSAGING=true
      // Em desenvolvimento/teste: true por padrão, a menos que =false
      __ROUTE_MESSAGING_ENABLED__: JSON.stringify(
        mode === 'production'
          ? process.env.VITE_ENABLE_ROUTE_MESSAGING === 'true'
          : process.env.VITE_ENABLE_ROUTE_MESSAGING !== 'false'
      ),
    },
    build: {
      // Sobe o aviso de chunk-size só para bibliotecas realmente pesadas
      // (recharts, xlsx) que ficam em chunks vendor separados.
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          // ── Vendor chunks manuais ────────────────────────────────────────
          // Separa libs pesadas em chunks dedicados para:
          //  • reduzir o bundle principal (index.js)
          //  • permitir cache agressivo (vendor não muda a cada deploy de app)
          //  • carregar recharts/xlsx só nas páginas que realmente usam
          manualChunks: {
            // React + Router (sempre carregados)
            'vendor-react': ['react', 'react-dom', 'react-router-dom-original'],
            // Radix UI — muitos primitivos usados em shadcn/ui
            'vendor-radix': [
              '@radix-ui/react-dialog',
              '@radix-ui/react-dropdown-menu',
              '@radix-ui/react-popover',
              '@radix-ui/react-select',
              '@radix-ui/react-tabs',
              '@radix-ui/react-tooltip',
              '@radix-ui/react-toast',
              '@radix-ui/react-checkbox',
              '@radix-ui/react-switch',
              '@radix-ui/react-slider',
              '@radix-ui/react-radio-group',
              '@radix-ui/react-scroll-area',
              '@radix-ui/react-separator',
              '@radix-ui/react-label',
              '@radix-ui/react-avatar',
              '@radix-ui/react-accordion',
              '@radix-ui/react-alert-dialog',
              '@radix-ui/react-context-menu',
              '@radix-ui/react-hover-card',
              '@radix-ui/react-menubar',
              '@radix-ui/react-navigation-menu',
              '@radix-ui/react-progress',
              '@radix-ui/react-collapsible',
              '@radix-ui/react-aspect-ratio',
              '@radix-ui/react-toggle',
              '@radix-ui/react-toggle-group',
              '@radix-ui/react-slot',
            ],
            // Supabase client (autenticação + realtime + queries)
            'vendor-supabase': ['@supabase/supabase-js'],
            // Recharts — só carrega quando Dashboard/PainelDiretoria/AnalyticsPanel renderizam
            'vendor-charts': ['recharts'],
            // XLSX — só carrega na página de importação
            'vendor-xlsx': ['@e965/xlsx'],
            // Date / form / utility libs
            'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod'],
            // Sentry — carrega apenas se VITE_SENTRY_DSN estiver definido (inicializado em main.tsx)
            'vendor-sentry': ['@sentry/react'],
          },
        },
      },
    },
  };
});
