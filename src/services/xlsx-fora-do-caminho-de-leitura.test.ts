/**
 * xlsx-fora-do-caminho-de-leitura.test.ts
 *
 * Trava de bundle. `@e965/xlsx` pesa ~484 KB e só é necessário para LER um
 * arquivo do ERP. Quando um módulo do caminho de leitura (services, hooks e
 * telas que apenas EXIBEM dados) importa o parser estaticamente, o Vite coloca
 * o chunk do xlsx no grafo daquela página — e a aba Analítico passa a baixar
 * meio megabyte de parser de planilha para desenhar uma tabela.
 *
 * Foi exatamente o que aconteceu: `analitico.service.ts` importava
 * `mesReferencia` (uma função de data) de `analiticoParser.ts`, e as telas do
 * diário importavam `normDiario` / `formaKindDiario` de `diarioParser.ts`.
 *
 * Este teste percorre o grafo de imports ESTÁTICOS a partir dos módulos do
 * caminho de leitura e falha se algum deles chegar ao xlsx. Imports DINÂMICOS
 * (`await import(...)`) são ignorados de propósito — são justamente a forma
 * correta de carregar o parser sob demanda.
 *
 * Se este teste falhar: mova o helper que você precisa para `analiticoComum.ts`
 * / `diarioComum.ts` (sem xlsx) e importe de lá, ou troque o import por
 * dinâmico dentro do handler que lê o arquivo.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const RAIZ = resolve(__dirname, '..', '..');   // .../gestao-de-acordos
const SRC  = join(RAIZ, 'src');

const PACOTE_XLSX = '@e965/xlsx';

/**
 * Módulos que NÃO devem arrastar xlsx: o que roda ao abrir a aba Analítico e
 * ao exibir o recebimento diário.
 */
const CAMINHO_DE_LEITURA = [
  'services/analitico/analitico.service.ts',
  'services/analitico/analiticoComum.ts',
  'services/diario/diario.service.ts',
  'services/diario/diarioComum.ts',
  'services/diario/diarioMensalGuard.ts',
  'pages/Analitico/Diario/helpers.ts',
  // `DiarioOperador.tsx` e `DiarioLider.tsx` estavam aqui até a aba Recebimento
  // diário sair do código. Quem herdou o papel delas — o mapa do mês e a faixa
  // de pulso do recorte Dia — entra no lugar: são as telas que hoje EXIBEM o
  // recebimento, e a trava tem de segui-las, não o nome antigo do arquivo.
  'pages/Analitico/Diario/DiaDetalhado.tsx',
  'pages/Analitico/FaixaPulso.tsx',
  'pages/Analitico/Diario/FormaChip.tsx',
  'hooks/useAnalitico.ts',
  'hooks/useAnaliticoDashboard.ts',
  'hooks/useDiario.ts',
];

const EXTENSOES = ['.ts', '.tsx', '/index.ts', '/index.tsx', '.js'];

/** Resolve um especificador de import para um caminho de arquivo real. */
function resolverModulo(especificador: string, arquivoAtual: string): string | null {
  let base: string;
  if (especificador.startsWith('@/')) {
    base = join(SRC, especificador.slice(2));
  } else if (especificador.startsWith('.')) {
    base = resolve(dirname(arquivoAtual), especificador);
  } else {
    return null;   // pacote de node_modules — não percorremos
  }

  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSOES) {
    const alvo = base + ext;
    if (existsSync(alvo) && statSync(alvo).isFile()) return alvo;
  }
  return null;
}

/**
 * Especificadores importados ESTATICAMENTE por um arquivo.
 * Cobre `import x from 'y'`, `export { x } from 'y'`, `export * from 'y'` e
 * `import 'y'` (efeito colateral). NÃO casa `await import('y')`, que não tem
 * a cláusula `from` nem começa a linha com `import`/`export`.
 */
function importsEstaticos(conteudo: string): string[] {
  const achados: string[] = [];
  const comFrom = /^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/gm;
  const semFrom = /^[ \t]*import\s*['"]([^'"]+)['"]/gm;
  for (const re of [comFrom, semFrom]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(conteudo)) !== null) achados.push(m[1]);
  }
  return achados;
}

/**
 * Percorre o grafo estático a partir de `entrada`. Devolve a cadeia de imports
 * até o xlsx, ou null se ele não for alcançado.
 */
function cadeiaAteXlsx(entrada: string): string[] | null {
  const visitados = new Set<string>();

  function visitar(arquivo: string, trilha: string[]): string[] | null {
    if (visitados.has(arquivo)) return null;
    visitados.add(arquivo);

    const conteudo = readFileSync(arquivo, 'utf8');
    const trilhaAqui = [...trilha, arquivo.replace(RAIZ, '').replace(/\\/g, '/')];

    for (const espec of importsEstaticos(conteudo)) {
      if (espec === PACOTE_XLSX) return [...trilhaAqui, PACOTE_XLSX];

      const alvo = resolverModulo(espec, arquivo);
      if (!alvo) continue;
      const r = visitar(alvo, trilhaAqui);
      if (r) return r;
    }
    return null;
  }

  return visitar(entrada, []);
}

describe('xlsx fora do caminho de leitura', () => {
  it.each(CAMINHO_DE_LEITURA)('%s não arrasta @e965/xlsx', (relativo) => {
    const arquivo = join(SRC, relativo);
    expect(existsSync(arquivo), `arquivo não encontrado: ${relativo}`).toBe(true);

    const cadeia = cadeiaAteXlsx(arquivo);
    expect(
      cadeia,
      cadeia
        ? `${relativo} chega ao xlsx por import estático:\n  ${cadeia.join('\n  → ')}\n` +
          'Mova o helper para *Comum.ts ou use import() dinâmico.'
        : '',
    ).toBeNull();
  });

  // Sanidade do próprio teste: se os parsers deixarem de importar xlsx, a
  // detecção acima passa a ser vacuamente verdadeira e não guarda mais nada.
  it('detecta o xlsx nos parsers (o teste realmente funciona)', () => {
    expect(cadeiaAteXlsx(join(SRC, 'services/analitico/analiticoParser.ts'))).not.toBeNull();
    expect(cadeiaAteXlsx(join(SRC, 'services/diario/diarioParser.ts'))).not.toBeNull();
  });
});
