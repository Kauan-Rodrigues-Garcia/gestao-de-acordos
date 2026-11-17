/**
 * O que está instalado, e as duas promessas da casca.
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Cada programa entra por `import()` ao ser aberto. Se a área de trabalho
 *    importar uma seção de forma estática, quem abre o Lab baixa tudo de uma
 *    vez — e ninguém percebe, porque a tela continua funcionando igual.
 * 2. Todo seletor do CSS do Lab começa com `.creators-lab`. É o que impede o
 *    tema de vazar para o Gestão.
 *
 * As duas são guardas de ARQUIVO: leem o código-fonte, porque nenhuma delas
 * aparece como defeito visível.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { LISTA_TEMAS, TEMAS } from '../../theme/themes';
import { LADO_ICONE, MAPAS, faixasDoMapa } from '../icones';
import { PROGRAMAS, programa } from '../programas';

const RAIZ = resolve(__dirname, '../..');
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), 'utf-8');

/** Tira comentários, para um exemplo escrito num comentário não contar como código. */
const semComentarios = (codigo: string) =>
  codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('os programas instalados', () => {
  it('cada id aparece uma vez só', () => {
    const ids = PROGRAMAS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo programa tem nome nos três sistemas, e todo nome tem programa', () => {
    const instalados = PROGRAMAS.map(p => p.id).sort();
    for (const t of LISTA_TEMAS) {
      expect(Object.keys(t.vocab.programas).sort(), t.id).toEqual(instalados);
    }
  });

  it('todo programa tem ícone desenhado e um tamanho de janela que faz sentido', () => {
    for (const p of PROGRAMAS) {
      expect(MAPAS[p.icone], `${p.id} sem ícone`).toBeDefined();
      expect(p.largura).toBeGreaterThanOrEqual(320);
      expect(p.altura).toBeGreaterThanOrEqual(320);
    }
  });

  it('os programas pedidos estão todos lá', () => {
    for (const id of [
      'terminal', 'fliperama', 'criadores', 'projetos', 'mathlab',
      'conquistas', 'descobridores', 'configuracoes', 'desligar',
    ]) {
      expect(programa(id), id).toBeDefined();
    }
  });

  it('id desconhecido devolve nada, em vez de quebrar', () => {
    expect(programa('nao-existe')).toBeUndefined();
    expect(programa('')).toBeUndefined();
  });

  it('o nome do sistema aparece em todo tema', () => {
    for (const t of LISTA_TEMAS) expect(TEMAS[t.id].vocab.sistema).toBeTruthy();
  });
});

describe('os ícones', () => {
  it('todo mapa tem 12 linhas de 12 caracteres, só `#` e `.`', () => {
    for (const [id, mapa] of Object.entries(MAPAS)) {
      expect(mapa, id).toHaveLength(LADO_ICONE);
      for (const linha of mapa) {
        expect(linha, `${id}: "${linha}"`).toMatch(new RegExp(`^[#.]{${LADO_ICONE}}$`));
      }
    }
  });

  it('nenhum ícone é vazio, e nenhum é igual a outro', () => {
    const desenhos = Object.values(MAPAS).map(m => m.join(''));
    for (const d of desenhos) expect(d).toContain('#');
    expect(new Set(desenhos).size).toBe(desenhos.length);
  });

  /** Juntar pixels em faixas é só economia de nós: nenhum pixel some ou sobra. */
  it('as faixas cobrem exatamente os pixels acesos', () => {
    for (const [id, mapa] of Object.entries(MAPAS)) {
      const acesos = mapa.join('').split('').filter(c => c === '#').length;
      const cobertos = faixasDoMapa(mapa).reduce((soma, f) => soma + f.l, 0);
      expect(cobertos, id).toBe(acesos);
      for (const f of faixasDoMapa(mapa)) {
        expect(mapa[f.y].slice(f.x, f.x + f.l)).toBe('#'.repeat(f.l));
      }
    }
  });
});

describe('cada programa entra por import dinâmico', () => {
  const CASCA = [
    'index.tsx',
    ...readdirSync(resolve(RAIZ, 'desktop'))
      .filter(f => /\.tsx?$/.test(f))
      .map(f => `desktop/${f}`),
  ];

  /** `import x from '...'` e `export ... from '...'`: o que entra no MESMO pedaço. */
  const importsEstaticos = (codigo: string) =>
    [...semComentarios(codigo).matchAll(/^\s*(?:import|export)\b[^;]*?from\s+['"]([^'"]+)['"]/gm)]
      .map(m => m[1]);

  it('a casca não importa seção nem programa de forma estática', () => {
    for (const arquivo of CASCA) {
      for (const de of importsEstaticos(ler(arquivo))) {
        expect(de, `${arquivo} importa "${de}" de forma estática`)
          .not.toMatch(/(^|\/)(sections|programas)\//);
      }
    }
  });

  it('a lista de programas usa `lazy(() => import(...))` para cada um', () => {
    const codigo = semComentarios(ler('desktop/programas.ts'));
    const dinamicos = [...codigo.matchAll(/lazy\(\(\)\s*=>\s*import\(['"]\.\.\/programas\/(\w+)['"]\)\)/g)]
      .map(m => m[1]);
    expect(dinamicos).toHaveLength(PROGRAMAS.length);
    expect(new Set(dinamicos).size).toBe(PROGRAMAS.length);
  });

  it('todo arquivo de `programas/` é aberto por alguém, e exporta `default`', () => {
    const codigo = ler('desktop/programas.ts');
    for (const f of readdirSync(resolve(RAIZ, 'programas')).filter(x => x.endsWith('.tsx'))) {
      const nome = f.replace(/\.tsx$/, '');
      expect(codigo, `programas/${f} não está instalado`).toContain(`'../programas/${nome}'`);
      expect(ler(`programas/${f}`), `programas/${f} sem export default`).toMatch(/export default function/);
    }
  });
});

describe('o CSS do Lab não vaza', () => {
  const CSS = semComentarios(ler('creators-lab.css'));

  /**
   * Percorre o CSS e devolve os seletores das regras de estilo, pulando o
   * interior de `@keyframes` (onde `from`, `to` e `50%` não são seletores).
   */
  function seletores(css: string): string[] {
    const achados: string[] = [];
    let i = 0;
    let dentroDeKeyframes = 0;   // profundidade em que o @keyframes abriu, ou 0
    let profundidade = 0;
    let inicio = 0;

    while (i < css.length) {
      const c = css[i];
      if (c === '{') {
        const cabeca = css.slice(inicio, i).trim();
        profundidade++;
        if (cabeca.startsWith('@keyframes')) dentroDeKeyframes = profundidade;
        else if (!cabeca.startsWith('@') && !dentroDeKeyframes) achados.push(cabeca);
        inicio = i + 1;
      } else if (c === '}') {
        if (dentroDeKeyframes === profundidade) dentroDeKeyframes = 0;
        profundidade--;
        inicio = i + 1;
      } else if (c === ';') {
        inicio = i + 1;
      }
      i++;
    }
    return achados;
  }

  it('todo seletor começa com .creators-lab', () => {
    const lista = seletores(CSS);
    expect(lista.length).toBeGreaterThan(100);
    for (const regra of lista) {
      for (const seletor of regra.split(',').map(s => s.trim()).filter(Boolean)) {
        expect(seletor.startsWith('.creators-lab'), `seletor solto: "${seletor}"`).toBe(true);
      }
    }
  });

  it('nenhuma regra toca :root, html ou body', () => {
    expect(CSS).not.toMatch(/(^|[\s,}]):root\b/);
    expect(CSS).not.toMatch(/(^|[\s,}])(html|body)\s*[{,]/);
  });

  /**
   * Forma é decidida por token (`data-forma`, `data-barra`...), não pelo nome
   * do tema. Um seletor com `data-tema="..."` é o `tema === 'cyberpunk'` do
   * CSS: funciona para os temas de hoje e esquece o próximo.
   */
  it('nenhum seletor compara o nome do tema', () => {
    expect(CSS).not.toMatch(/\[data-tema[=~|^$*]/);
  });

  it('todo keyframe tem o prefixo do Lab', () => {
    for (const m of CSS.matchAll(/@keyframes\s+([\w-]+)/g)) {
      expect(m[1].startsWith('creators-'), `keyframe sem prefixo: ${m[1]}`).toBe(true);
    }
  });
});

describe('nenhum componente compara o nome do tema', () => {
  /**
   * "Se você encontrar `tema === 'cyberpunk'` dentro de um componente, faltou
   * um token." A regra está no manual desde a primeira versão; com três temas,
   * uma condicional de dois lados passou a estar ERRADA, não só feia.
   */
  it('nem `tema ===`, nem `tokens.id ===`, em arquivo .tsx do Lab', () => {
    const pastas = ['components', 'sections', 'desktop', 'programas'];
    const arquivos = [
      'index.tsx',
      ...pastas.flatMap(p =>
        readdirSync(resolve(RAIZ, p)).filter(f => f.endsWith('.tsx')).map(f => `${p}/${f}`)),
    ];

    for (const arquivo of arquivos) {
      const codigo = semComentarios(ler(arquivo));
      expect(codigo, arquivo).not.toMatch(/\b(tema|tokens\.id|t\.id)\s*[!=]==\s*['"]/);
    }
  });
});
