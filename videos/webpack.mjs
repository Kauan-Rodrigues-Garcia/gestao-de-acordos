// Ajuste do bundler, usado pelo `remotion.config.ts` (estúdio e render) e
// pelos scripts que chamam `bundle()` direto (scripts/quadros.mjs).
//
// - Tailwind v4, para as telas usarem as MESMAS classes do app.
// - `@/` aponta para o `src/` do app: os componentes de `src/components/ui`
//   (shadcn) entram no vídeo sem cópia.
// - Os pacotes que esses componentes importam são procurados em
//   `videos/node_modules` também, e o React é sempre o do vídeo: se o app tiver
//   o próprio `node_modules` instalado ao lado, dois Reacts na mesma árvore
//   quebrariam os hooks.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enableTailwind } from '@remotion/tailwind-v4';

// O Remotion lê o remotion.config.ts como CommonJS, e lá `import.meta` vem
// vazio: aí vale a pasta de onde o comando roda (os scripts do npm rodam em
// videos/).
const raiz = import.meta?.url ? path.dirname(fileURLToPath(import.meta.url)) : process.cwd();
const modulos = path.join(raiz, 'node_modules');

/** @param {import('webpack').Configuration} config */
export function ajustarWebpack(config) {
  const comTailwind = enableTailwind(config);
  return {
    ...comTailwind,
    resolve: {
      ...comTailwind.resolve,
      modules: [...(comTailwind.resolve?.modules ?? ['node_modules']), modulos],
      alias: {
        ...(comTailwind.resolve?.alias ?? {}),
        '@': path.join(raiz, '..', 'src'),
        react: path.join(modulos, 'react'),
        'react-dom': path.join(modulos, 'react-dom'),
      },
    },
  };
}
