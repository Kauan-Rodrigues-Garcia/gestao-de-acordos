/**
 * build.mjs — empacota o robô num arquivo só.
 *
 * ## Por que empacotar
 *
 * O PC do trabalho não precisa do projeto, nem de TypeScript, nem de
 * `node_modules`. Ele precisa do Node e de um arquivo. O empacotamento traz
 * junto o parser do 59, o mapeamento das 28 colunas e o cliente do Supabase —
 * tudo o que o robô usa, sem nada que ele não use.
 *
 * ## O truque que mantém uma verdade só
 *
 * `@/lib/supabase` é apontado para `supabaseNode.ts`. É isso que permite ao
 * robô chamar `importarMestre59`, a MESMA função da tela, sem nenhuma cópia:
 * o resto da cadeia (`supabaseSemTipo` → `mestre.service`) não sabe que está
 * rodando fora do navegador.
 *
 * Sem esse apontamento eu teria que reescrever a importação aqui, e uma segunda
 * implementação do mesmo fluxo diverge num dia qualquer — silenciosamente, que
 * é o pior jeito.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..', '..');

await build({
  entryPoints: [resolve(aqui, 'robo59.ts')],
  outfile:     resolve(aqui, 'dist', 'robo59.mjs'),
  bundle:   true,
  platform: 'node',
  target:   'node18',
  format:   'esm',
  // Legível de propósito: quando algo falhar às 3 da manhã, alguém vai abrir
  // este arquivo. Ele não é servido pela rede, então o tamanho não paga nada.
  minify:   false,
  sourcemap: 'inline',
  alias: {
    // O cliente do navegador dá lugar ao do robô. Ver o cabeçalho.
    '@/lib/supabase': resolve(aqui, 'supabaseNode.ts'),
    '@': resolve(raiz, 'src'),
  },
  logLevel: 'info',
});

console.log('\nPronto: scripts/robo59/dist/robo59.mjs');
console.log('Leve DOIS arquivos para o PC do trabalho: este .mjs e o .env preenchido.');
console.log('Nada mais — o cliente do Supabase e o parser vão dentro do pacote, e as');
console.log('únicas dependências externas são `node:fs`, `node:path` e `node:url`.');
