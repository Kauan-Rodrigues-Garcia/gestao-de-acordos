/**
 * O Museu: estrutura, fatos e isolamento.
 * ─────────────────────────────────────────────────────────────────────────────
 * Três coisas que não aparecem como defeito na tela e por isso precisam de
 * teste:
 *
 *  1. **Estrutura** — toda sala pertence a uma época que existe, tem arte e
 *     fonte, e a visita passa por todas.
 *  2. **Não inventar história** — toda data escrita numa sala precisa aparecer
 *     na fonte que a sala cita: no texto do arquivo, no nome de uma migration
 *     daquele dia ou na data de commit declarada. Uma data digitada de memória
 *     não passa.
 *  3. **Isolamento** — as peças e as artes não alcançam o banco, nem
 *     diretamente nem pelo que importam. Do arquivo morto só entra desenho.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { estaPendente } from '../../creators.config';
import { PROGRESSO_VAZIO } from '../../lib/conquistas';
import { ARTES_DA_EPOCA, temArteDaEpoca } from '../artesDaEpoca';
import { CORREDORES_DO_MUSEU } from '../bichinhos';
import {
  EPOCAS, SALAS, ordemDaVisita, salasDaEpoca, salasVisitadas, vizinhas,
} from '../museu.config';
import { LADO_PLACA, PLACAS, faixasDaPlaca } from '../placas';

const MUSEU = resolve(__dirname, '..');
const REPO = resolve(MUSEU, '../../../..');
const MIGRATIONS = readdirSync(resolve(REPO, 'supabase/migrations'));

const DATA = /^\d{2}\/\d{2}\/\d{4}$/;
/** `dd/mm/aaaa` → `aaaammdd`, que é como as migrations começam. */
const comoPrefixo = (d: string) => d.split('/').reverse().join('');
const comoNumero = (d: string) => Number(comoPrefixo(d));

/** Todas as datas de uma sala, com o lugar de onde vieram. */
function datasDaSala(s: typeof SALAS[number]): { onde: string; data: string }[] {
  return [
    { onde: 'inicio', data: s.inicio },
    ...(s.fim === null ? [] : [{ onde: 'fim', data: s.fim }]),
    ...(s.marcos ?? []).map((m, i) => ({ onde: `marcos[${i}]`, data: m.data })),
  ];
}

/** O caminho de arquivo de uma fonte, ou `null` se a fonte não é um arquivo. */
function arquivoDaFonte(fonte: string): string | null {
  if (!/^(arquivo-morto|docs|src)\//.test(fonte)) return null;
  return fonte.replace(/\s*\(.*\)\s*$/, '');
}

describe('estrutura', () => {
  it('cada sala tem um id único', () => {
    const ids = SALAS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('toda sala pertence a uma época que existe, e nenhuma época fica vazia', () => {
    const epocas = new Set(EPOCAS.map(e => e.id));
    for (const s of SALAS) expect(epocas.has(s.epoca), `${s.id}: época "${s.epoca}"`).toBe(true);
    for (const e of EPOCAS) expect(salasDaEpoca(e.id).length, e.id).toBeGreaterThan(0);
  });

  it('a visita passa por todas as salas, uma vez cada', () => {
    const ordem = ordemDaVisita().map(s => s.id);
    expect(ordem.slice().sort()).toEqual(SALAS.map(s => s.id).sort());
    expect(new Set(ordem).size).toBe(ordem.length);
  });

  it('toda sala tem nome, texto e pelo menos uma fonte', () => {
    for (const s of SALAS) {
      expect(s.nome.trim(), s.id).toBeTruthy();
      expect(s.texto.trim().length, s.id).toBeGreaterThan(40);
      expect(s.fontes.length, `${s.id} sem fonte`).toBeGreaterThan(0);
    }
  });

  it('o material pedido está todo lá', () => {
    for (const id of [
      // arquivo-morto/
      'caca', 'halloween', 'modo-tv', 'comemoracoes-1', 'pet', 'ouvidoria', 'pesquisa', 'colchao',
      // eventos do código vivo, e o álbum de insígnias
      'corrida-de-cavalos', 'guerra-na-corrida', 'sirene', 'natal', 'insignias',
    ]) {
      expect(SALAS.some(s => s.id === id), id).toBe(true);
    }
  });

  it('o que foi arquivado tem data de saída e motivo; o que está vivo, não', () => {
    for (const s of SALAS) {
      if (s.situacao === 'arquivado') {
        expect(s.fim, `${s.id} arquivado sem data de saída`).not.toBeNull();
        expect(s.porQueSaiu, `${s.id} arquivado sem motivo`).toBeTruthy();
      } else {
        expect(s.fim, `${s.id} está vivo mas tem data de saída`).toBeNull();
        expect(s.porQueSaiu, `${s.id} está vivo mas tem motivo de saída`).toBeUndefined();
      }
    }
  });

  it('as vizinhas ligam a visita de ponta a ponta', () => {
    const ordem = ordemDaVisita();
    expect(vizinhas(ordem[0].id).anterior).toBeNull();
    expect(vizinhas(ordem[ordem.length - 1].id).proxima).toBeNull();
    for (let i = 0; i < ordem.length - 1; i++) {
      expect(vizinhas(ordem[i].id).proxima?.id).toBe(ordem[i + 1].id);
      expect(vizinhas(ordem[i + 1].id).anterior?.id).toBe(ordem[i].id);
    }
    expect(vizinhas('nao-existe')).toEqual({ anterior: null, proxima: null });
  });
});

describe('não inventar história', () => {
  it('toda data é dd/mm/aaaa ou uma lacuna declarada', () => {
    for (const s of SALAS) {
      for (const { onde, data } of datasDaSala(s)) {
        expect(DATA.test(data) || estaPendente(data), `${s.id}.${onde} = "${data}"`).toBe(true);
      }
    }
  });

  it('as datas existem no calendário', () => {
    for (const s of SALAS) {
      for (const { onde, data } of datasDaSala(s).filter(d => DATA.test(d.data))) {
        const [d, m, a] = data.split('/').map(Number);
        const dt = new Date(a, m - 1, d);
        expect(dt.getDate() === d && dt.getMonth() === m - 1, `${s.id}.${onde} = "${data}"`).toBe(true);
      }
    }
  });

  it('nenhuma sala termina antes de começar, e nenhum marco está fora de ordem', () => {
    for (const s of SALAS) {
      if (DATA.test(s.inicio) && s.fim && DATA.test(s.fim)) {
        expect(comoNumero(s.inicio), s.id).toBeLessThanOrEqual(comoNumero(s.fim));
      }
      const marcos = (s.marcos ?? []).map(m => m.data).filter(d => DATA.test(d)).map(comoNumero);
      expect(marcos, `${s.id}: marcos fora de ordem`).toEqual(marcos.slice().sort((a, b) => a - b));
    }
  });

  it('toda fonte que é arquivo existe no repositório', () => {
    for (const s of SALAS) {
      for (const fonte of s.fontes) {
        const arquivo = arquivoDaFonte(fonte);
        if (arquivo) expect(existsSync(resolve(REPO, arquivo)), `${s.id}: ${arquivo}`).toBe(true);
      }
    }
  });

  it('toda migration citada como fonte existe', () => {
    for (const s of SALAS) {
      for (const fonte of s.fontes.filter(f => f.startsWith('supabase/migrations:'))) {
        for (const nome of fonte.replace('supabase/migrations:', '').split(',').map(x => x.trim())) {
          expect(MIGRATIONS.some(m => m.startsWith(nome)), `${s.id}: migration ${nome}`).toBe(true);
        }
      }
    }
  });

  /**
   * A guarda principal. Uma data só pode estar numa sala se a fonte que a sala
   * cita a confirma, de um destes três jeitos:
   *
   *   • a data está escrita no texto de um arquivo citado;
   *   • a sala cita uma migration cujo nome começa com aquele dia;
   *   • a sala cita o git, e a própria citação declara a data.
   */
  it('toda data escrita numa sala aparece numa fonte que a sala cita', () => {
    for (const s of SALAS) {
      const textos = s.fontes
        .map(arquivoDaFonte)
        .filter((a): a is string => a !== null && existsSync(resolve(REPO, a)))
        .map(a => readFileSync(resolve(REPO, a), 'utf-8'));
      const migrationsCitadas = s.fontes
        .filter(f => f.startsWith('supabase/migrations:'))
        .flatMap(f => f.replace('supabase/migrations:', '').split(',').map(x => x.trim()));
      const citacoesDoGit = s.fontes.filter(f => f.startsWith('git:'));

      for (const { onde, data } of datasDaSala(s).filter(d => DATA.test(d.data))) {
        const noTexto = textos.some(t => t.includes(data));
        const naMigration = migrationsCitadas.some(m => m.startsWith(comoPrefixo(data)));
        const noGit = citacoesDoGit.some(c => c.includes(data));
        expect(
          noTexto || naMigration || noGit,
          `${s.id}.${onde}: ${data} não está em nenhuma fonte citada`,
        ).toBe(true);
      }
    }
  });

  /** O README de cada pasta do arquivo morto diz quando ela foi arquivada. */
  it('a data de saída confere com o «Arquivado em» do README', () => {
    for (const s of SALAS.filter(x => x.situacao === 'arquivado' && x.fim && DATA.test(x.fim))) {
      const readmes = s.fontes
        .map(arquivoDaFonte)
        .filter((a): a is string => !!a && a.startsWith('arquivo-morto/') && a.endsWith('README.md'))
        .map(a => readFileSync(resolve(REPO, a), 'utf-8'));
      expect(readmes.length, `${s.id} não cita README do arquivo morto`).toBeGreaterThan(0);
      expect(
        readmes.some(t => new RegExp(`Arquivad[oa] em:\\*\\*\\s*${s.fim}`).test(t)),
        `${s.id}: nenhum README citado diz "Arquivado em: ${s.fim}"`,
      ).toBe(true);
    }
  });

  it('as lacunas dizem o que falta', () => {
    const lacunas = SALAS.flatMap(s => [s.inicio, s.fim ?? '', s.porQueSaiu ?? '', ...(s.marcos ?? []).map(m => m.data)])
      .filter(estaPendente);
    expect(lacunas.length).toBeGreaterThan(0);
    for (const l of lacunas) expect(l.length, l).toBeGreaterThan(25);
  });
});

describe('a arte', () => {
  it('toda sala tem um desenho: o sprite da época ou uma placa', () => {
    for (const s of SALAS) {
      const temPlaca = Object.prototype.hasOwnProperty.call(PLACAS, s.arte);
      expect(temArteDaEpoca(s.arte) || temPlaca, `${s.id}: arte "${s.arte}" sem desenho`).toBe(true);
    }
  });

  /** A tela diz «arte da época» ou «reconstituição» — e não pode mentir. */
  it('a origem declarada da arte é a verdadeira', () => {
    for (const s of SALAS) {
      expect(s.origemDaArte, s.id).toBe(temArteDaEpoca(s.arte) ? 'da-epoca' : 'reconstituicao');
    }
  });

  it('nenhuma arte é placa e sprite ao mesmo tempo', () => {
    for (const id of ARTES_DA_EPOCA) {
      expect(Object.prototype.hasOwnProperty.call(PLACAS, id), id).toBe(false);
    }
  });

  it('toda placa tem 14 linhas de 14 caracteres, e toda letra tem cor', () => {
    for (const [id, p] of Object.entries(PLACAS)) {
      expect(p.mapa, id).toHaveLength(LADO_PLACA);
      for (const linha of p.mapa) {
        expect(linha.length, `${id}: "${linha}"`).toBe(LADO_PLACA);
        for (const letra of linha) {
          if (letra !== '.') expect(p.paleta[letra], `${id}: letra "${letra}" sem cor`).toBeTruthy();
        }
      }
    }
  });

  it('as faixas cobrem exatamente os pixels acesos de cada placa', () => {
    for (const [id, p] of Object.entries(PLACAS)) {
      const acesos = p.mapa.join('').split('').filter(c => c !== '.').length;
      expect(faixasDaPlaca(p).reduce((soma, f) => soma + f.l, 0), id).toBe(acesos);
      expect(acesos, `${id} vazia`).toBeGreaterThan(20);
    }
  });
});

describe('as peças e as artes não alcançam o banco', () => {
  const arquivosDe = (pasta: string) =>
    readdirSync(resolve(MUSEU, pasta)).filter(f => /\.tsx?$/.test(f)).map(f => resolve(MUSEU, pasta, f));

  const DO_MUSEU = [
    ...arquivosDe('pecas'), ...arquivosDe('artes'),
    resolve(MUSEU, 'ArteDaSala.tsx'), resolve(MUSEU, 'PecaDaSala.tsx'),
    resolve(MUSEU, 'bichinhos.ts'), resolve(MUSEU, 'museu.config.ts'),
    resolve(MUSEU, '../programas/Museu.tsx'),
  ];

  const semComentarios = (codigo: string) =>
    codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /** Os caminhos de `import ... from '...'` e `import('...')` de um arquivo. */
  const importsDe = (codigo: string) =>
    [...semComentarios(codigo).matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g)].map(m => m[1]);

  /** Resolve um import para um arquivo do repositório, ou `null` (pacote, CSS...). */
  function resolver(de: string, alvo: string): string | null {
    const base = alvo.startsWith('@/') ? resolve(REPO, 'src', alvo.slice(2))
      : alvo.startsWith('.') ? resolve(dirname(de), alvo)
      : null;
    if (!base) return null;
    for (const fim of ['', '.ts', '.tsx', '.js', '/index.ts', '/index.tsx']) {
      if (existsSync(base + fim) && /\.(tsx?|js)$/.test(base + fim)) return base + fim;
    }
    return null;
  }

  /** Tudo o que um arquivo puxa, direta ou indiretamente. */
  function alcance(inicio: string[]): Set<string> {
    const visto = new Set<string>();
    const fila = [...inicio];
    while (fila.length) {
      const atual = fila.pop()!;
      if (visto.has(atual)) continue;
      visto.add(atual);
      for (const alvo of importsDe(readFileSync(atual, 'utf-8'))) {
        const arquivo = resolver(atual, alvo);
        if (arquivo && !visto.has(arquivo)) fila.push(arquivo);
      }
    }
    return visto;
  }

  const relativo = (a: string) => a.slice(REPO.length + 1).replace(/\\/g, '/');
  const ALCANCE = alcance(DO_MUSEU);

  /**
   * O que o Museu tem licença para puxar de fora da própria pasta: o provider
   * do Lab e desenho puro. Tudo o mais (serviço, cliente do banco, hook de
   * dados, o resto da Caça) fica de fora.
   */
  it('do arquivo morto, só entra desenho', () => {
    const PERMITIDOS = /^arquivo-morto\/caca-zumbis-bruxas\/src\/components\/CacaAbobora\/(SpriteZumbi\.tsx|zumbis\.ts|pixels\.ts|chefaoArte\.ts|fisica\.ts|bruxas\/(SpriteBruxa\.tsx|arte\.ts|pixels\.ts|queda\.ts|figurinos\.ts))$/;
    const doArquivoMorto = [...ALCANCE].map(relativo).filter(a => a.startsWith('arquivo-morto/'));
    expect(doArquivoMorto.length).toBeGreaterThan(0);
    for (const a of doArquivoMorto) expect(PERMITIDOS.test(a), `fora da lista: ${a}`).toBe(true);
  });

  it('nada do que o Museu alcança fala com o banco ou com a rede', () => {
    // O provider do Lab grava o progresso, e é o único caminho permitido até o
    // serviço. Ele não é peça nem arte: fica fora desta varredura, e tudo o
    // que só ELE alcança também.
    const semProvider = alcance(DO_MUSEU.filter(a => !a.endsWith('Museu.tsx')))
    // Dois crivos: o que o arquivo IMPORTA e o que o código FAZ. Separados
    // porque a palavra «supabase» aparece legitimamente em texto — as fontes
    // das salas citam `supabase/migrations` — e o que conta é a importação.
    const IMPORT_PROIBIDO = /supabase|@\/services\/|@\/hooks\/useAuth|@\/integrations\//;
    const CODIGO_PROIBIDO = /\bfetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|\.rpc\(/;

    for (const arquivo of semProvider) {
      const nome = relativo(arquivo);
      if (nome.endsWith('theme/CreatorsProvider.tsx')) continue;
      if (nome.startsWith('src/services/') || nome.startsWith('src/lib/supabase')) {
        // Só chega aqui por dentro do provider; qualquer outro caminho é erro.
        const quemImporta = [...semProvider].filter(a =>
          importsDe(readFileSync(a, 'utf-8')).some(i => resolver(a, i) === arquivo));
        for (const q of quemImporta) {
          expect(
            relativo(q).startsWith('src/services/') || relativo(q).startsWith('src/lib/')
            || relativo(q).endsWith('theme/CreatorsProvider.tsx'),
            `${relativo(q)} importa ${nome}`,
          ).toBe(true);
        }
        continue;
      }
      if (!/^(src\/pages\/CreatorsLab\/museu|arquivo-morto|src\/components\/Corrida)\//.test(nome)) continue;
      const codigo = readFileSync(arquivo, 'utf-8');
      for (const alvo of importsDe(codigo)) {
        expect(IMPORT_PROIBIDO.test(alvo), `${nome} importa "${alvo}"`).toBe(false);
      }
      expect(
        CODIGO_PROIBIDO.test(semComentarios(codigo)),
        `${nome} fala com banco, rede ou armazenamento`,
      ).toBe(false);
    }
  });

  it('as peças e as artes só importam do Museu, do provider do Lab e de desenho', () => {
    const PERMITIDO = /^(react|framer-motion|\.\.?\/|@\/components\/Corrida\/(MiniBichinho|motor\/bichinhos|guerra\/SpriteCavaloDaGuerra)$)/;
    for (const arquivo of [...arquivosDe('pecas'), ...arquivosDe('artes')]) {
      for (const alvo of importsDe(readFileSync(arquivo, 'utf-8'))) {
        expect(PERMITIDO.test(alvo), `${relativo(arquivo)} importa "${alvo}"`).toBe(true);
      }
    }
  });

  it('as peças não têm placar, ranking nem recorde', () => {
    for (const arquivo of arquivosDe('pecas')) {
      expect(semComentarios(readFileSync(arquivo, 'utf-8')), relativo(arquivo))
        .not.toMatch(/placar|ranking|recorde|pontos|score/i);
    }
  });

  it('quem corre na peça da corrida tem nome de mentira', () => {
    for (const nome of CORREDORES_DO_MUSEU) expect(nome).toMatch(/^Corredor [A-Z]$/);
  });
});

describe('as salas visitadas', () => {
  it('conta só sala que existe, e não conta repetida', () => {
    expect(salasVisitadas([])).toBe(0);
    expect(salasVisitadas(['pet', 'pet', 'sirene'])).toBe(2);
    expect(salasVisitadas(['pet', 'sala-que-saiu-do-museu'])).toBe(1);
  });

  it('visitar tudo dá o total, nunca mais que ele', () => {
    const todas = SALAS.map(s => s.id);
    expect(salasVisitadas(todas)).toBe(SALAS.length);
    expect(salasVisitadas([...todas, ...todas, 'extra'])).toBe(SALAS.length);
  });

  it('o progresso vazio tem o campo que o Museu usa', () => {
    expect(PROGRESSO_VAZIO.museuVisto).toEqual([]);
  });
});
