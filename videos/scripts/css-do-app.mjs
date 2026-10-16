// Copia o CSS do app (../src/index.css) para src/estilo/app.css.
//
// É o MESMO arquivo — tokens do tema claro, camadas base e componentes —, só
// sem as três primeiras importações: a das fontes do Google (o vídeo usa as
// fontes locais do @fontsource, para renderizar sem rede) e as do Tailwind,
// que o src/estilo/index.css já faz a partir do node_modules do vídeo.
//
// Roda sozinho antes do estúdio e do render (`prerender`/`preestudio`). Mudou o
// visual do app? O vídeo pega na próxima vez.

import { readFileSync, writeFileSync } from 'node:fs';

const origem = new URL('../../src/index.css', import.meta.url);
const destino = new URL('../src/estilo/app.css', import.meta.url);

const css = readFileSync(origem, 'utf8')
  .replace(/^@import url\([^)]*\);\s*$/m, '')
  .replace(/^@import "tailwindcss";\s*$/m, '')
  .replace(/^@import "tw-animate-css";\s*$/m, '');

writeFileSync(destino, `/* GERADO por scripts/css-do-app.mjs a partir de ../src/index.css. Não edite aqui. */\n${css}`);
console.log('css do app copiado →', destino.pathname);

// O app do celular (/m) tem CSS próprio, escopado em `.tela-mobile` e `.v-*`.
for (const [de, para] of [
  ['../../src/pages/Mobile/mobile.css', '../src/estilo/mobile.css'],
  ['../../src/pages/Mobile/comum/comum.css', '../src/estilo/mobile-comum.css'],
]) {
  const texto = readFileSync(new URL(de, import.meta.url), 'utf8').replace(/^@import url\([^)]*\);\s*$/m, '');
  writeFileSync(new URL(para, import.meta.url), `/* GERADO por scripts/css-do-app.mjs a partir de ${de.replace('../../', '../')}. Não edite aqui. */\n${texto}`);
  console.log('css do celular copiado →', para);
}
