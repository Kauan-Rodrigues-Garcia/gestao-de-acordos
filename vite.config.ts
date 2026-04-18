// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { componentTagger } from 'lovable-tagger';
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
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        // Proxy react-router-dom para o wrapper customizado do projeto
        'react-router-dom': path.resolve(__dirname, './src/lib/react-router-dom-proxy.tsx'),
        // react-router-dom original acessível sob nome alternativo
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
  };
});
