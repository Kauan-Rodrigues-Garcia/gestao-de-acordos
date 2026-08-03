// vite.config.ts
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { componentTagger } from 'lovable-tagger';
import { visualizer } from 'rollup-plugin-visualizer';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';

import { cdnPrefixImages } from './vite-plugins/cdn-prefix-images';
import { devApi } from './vite-plugins/dev-api';

// Versão do build: timestamp em produção, 'dev' em desenvolvimento.
// Injetada no bundle como __APP_VERSION__ e gravada em dist/version.json
// para que o polling de atualização detecte novos deploys.
const BUILD_VERSION = process.env.NODE_ENV === 'production' ? String(Date.now()) : 'dev';

// Release do Sentry. O timestamp de BUILD_VERSION serve para detectar deploy
// novo, mas não diz QUAL código está no ar — e é isso que se quer saber ao
// olhar um erro. A Vercel expõe o commit no build; fora dela, o timestamp fica
// como reserva para pelo menos separar um deploy do outro.
const COMMIT = (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7);
const APP_RELEASE = COMMIT || BUILD_VERSION;

// ─── Source maps para o Sentry ───────────────────────────────────────────────
//
// Sem eles o relatório de erro chega minificado — "t.n is not a function" na
// linha 1 de um bundle de 500 KB. Dá para saber que quebrou, não onde.
//
// O envio é OPT-IN: só acontece quando as três variáveis existem no ambiente de
// build. Sem elas, nada muda — nem plugin, nem source map gerado. É de
// propósito: o build local e o de quem clonar o repositório não podem depender
// de um token que só a Vercel tem.
//
// `SENTRY_AUTH_TOKEN` é SEGREDO de verdade, ao contrário da DSN: ele dá acesso
// de escrita ao projeto no Sentry. Nunca com prefixo VITE_ — o que tem VITE_ é
// embutido no bundle e chega ao navegador.
const SENTRY_TOKEN   = process.env.SENTRY_AUTH_TOKEN;
const SENTRY_ORG     = process.env.SENTRY_ORG;
const SENTRY_PROJECT = process.env.SENTRY_PROJECT;
const ENVIAR_SOURCEMAPS = Boolean(SENTRY_TOKEN && SENTRY_ORG && SENTRY_PROJECT);

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
      // DEV: serve as funções /api dentro do `vite dev` (só em `serve`, não no build).
      devApi(),
      // Grava dist/version.json ao final do build para o polling de atualização.
      // Usa emitFile (API Rollup) em vez de fs.writeFileSync para que o Vite
      // gerencie o outDir corretamente em qualquer ambiente (local, CI, Render).
      {
        name: 'version-json',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ v: BUILD_VERSION }),
          });
        },
      } satisfies Plugin,
      // Ativo apenas em `npm run analyze` (mode=analyze): gera stats.html com mapa do bundle.
      mode === 'analyze' && visualizer({ open: true, gzipSize: true, brotliSize: true, filename: 'stats.html' }),
      // Sobe os source maps para o Sentry e APAGA os .map do dist em seguida —
      // ver o bloco de comentário lá em cima. Precisa ser o último plugin: ele
      // trabalha sobre os arquivos já emitidos.
      ENVIAR_SOURCEMAPS && sentryVitePlugin({
        authToken: SENTRY_TOKEN,
        org:       SENTRY_ORG,
        project:   SENTRY_PROJECT,
        // Tem que bater com o `release` do `Sentry.init` (ver
        // `src/lib/observabilidade.ts`), senão o Sentry recebe os mapas mas não
        // os associa a erro nenhum e a pilha continua minificada.
        release: { name: APP_RELEASE },
        sourcemaps: {
          // Publicar o .map deixaria o código-fonte inteiro baixável do site.
          // Ele sobe para o Sentry e some do dist no mesmo passo.
          //
          // Verificado com um token inválido de propósito (2026-08-03): o
          // upload falha, o plugin registra o erro, o BUILD TERMINA COM
          // SUCESSO e o dist fica sem nenhum .map. Ou seja, token errado ou
          // vencido custa a pilha legível daquele deploy — não derruba o
          // deploy nem vaza o código-fonte.
          filesToDeleteAfterUpload: ['./dist/**/*.map'],
        },
      }),
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
      // Versão do build — usada pelo hook useVersionCheck para detectar novos deploys
      __APP_VERSION__: JSON.stringify(BUILD_VERSION),
      // Identifica o build no Sentry — ver `src/lib/observabilidade.ts`.
      __APP_RELEASE__: JSON.stringify(APP_RELEASE),
    },
    build: {
      // Só gera .map quando eles vão de fato subir para o Sentry — e mesmo
      // então o plugin os apaga do dist depois do upload. Sem o token, o build
      // continua exatamente como era.
      sourcemap: ENVIAR_SOURCEMAPS,
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
