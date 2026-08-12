/**
 * composicaoAcumulado.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * A composição do acumulado responde "de onde vieram estes reais?" e permite
 * tirar do total do setor as origens que não são dele.
 *
 * O caso real que a criou (BookPlay, agosto/2026): o relatório do Play 5 veio
 * com 2 linhas de operadores do Play Mix Marília e do Play 4 — R$ 1.933,21 que
 * o card do Play 5 exibia como se fossem dele, porque a soma é pelo carimbo do
 * relatório e o carimbo não sabe de quem é a pessoa.
 *
 * As garantias fixadas aqui:
 *   1. sem exclusão, o total é idêntico ao de antes (nada configurado = nada muda);
 *   2. a origem do próprio setor é reconhecida e nunca é tratada como estranha;
 *   3. a MESMA definição de "setor da pessoa" vale para a lista e para o filtro
 *      linha a linha — se divergirem, o card não fecha com a soma que ele mostra.
 */
import { describe, it, expect } from 'vitest';
import {
  montarOrigens,
  origemDaLinha,
  origemConta,
  totalLiquido,
  totalExcluido,
  ORIGEM_SEM_OPERADOR,
} from './composicaoAcumulado';
import { escopoDeSetor, linhaNoEscopo } from './escopoAnalitico';

const PLAY5    = 'setor-play-5';
const PLAY4    = 'setor-play-4';
const PLAYMIX  = 'setor-play-mix';

/** Espelha o relatório real do Play 5 em agosto/2026. */
const OPERADORES: Record<string, string> = {
  izadora:  PLAY5,
  eduarda:  PLAY5,
  isabela:  PLAY4,
  bruna:    PLAYMIX,
};
const setorDoOperador = (id: string) => OPERADORES[id] ?? null;

const LINHAS = [
  { operador_id: 'izadora', valor_recebido: 19279.62 },
  { operador_id: 'eduarda', valor_recebido: 11441.92 },
  { operador_id: 'bruna',   valor_recebido: 1500.00 },
  { operador_id: 'isabela', valor_recebido: 433.21 },
  { operador_id: null,      valor_recebido: 479.12 },
];

describe('origemDaLinha', () => {
  it('usa o setor da pessoa', () => {
    expect(origemDaLinha('isabela', setorDoOperador)).toBe(PLAY4);
  });

  it('linha sem operador tem origem própria, não vira setor nenhum', () => {
    expect(origemDaLinha(null, setorDoOperador)).toBe(ORIGEM_SEM_OPERADOR);
  });

  it('operador sem setor cai na mesma origem que quem não tem operador', () => {
    // Alguém cadastrado mas sem equipe nem setor não pertence a lugar nenhum;
    // inventar um setor para ele seria creditar dinheiro a um time por engano.
    expect(origemDaLinha('desconhecido', setorDoOperador)).toBe(ORIGEM_SEM_OPERADOR);
  });
});

describe('montarOrigens', () => {
  it('quebra o relatório por origem e soma cada uma', () => {
    const origens = montarOrigens({ setorId: PLAY5, linhas: LINHAS, setorDoOperador });

    expect(origens.map(o => o.chave)).toEqual([PLAY5, PLAYMIX, PLAY4, ORIGEM_SEM_OPERADOR]);
    expect(origens[0].total).toBeCloseTo(30721.54, 2);  // izadora + eduarda
    expect(origens[0].qtd).toBe(2);
    expect(origens[1].total).toBeCloseTo(1500.00, 2);
    expect(origens[2].total).toBeCloseTo(433.21, 2);
  });

  it('o próprio setor vem primeiro e a origem sem operador por último', () => {
    // A ordem é a de quem está conferindo: primeiro o que é meu, depois o
    // intruso maior, e no fim as linhas sem dono.
    const origens = montarOrigens({ setorId: PLAY5, linhas: LINHAS, setorDoOperador });
    expect(origens[0].propria).toBe(true);
    expect(origens.slice(1).every(o => !o.propria)).toBe(true);
    expect(origens[origens.length - 1].chave).toBe(ORIGEM_SEM_OPERADOR);
  });

  it('sem exclusões, o líquido é o total do relatório — nada muda', () => {
    const origens = montarOrigens({ setorId: PLAY5, linhas: LINHAS, setorDoOperador });
    expect(totalLiquido(origens)).toBeCloseTo(33133.87, 2);
    expect(totalExcluido(origens)).toBe(0);
    expect(origens.every(o => !o.excluida)).toBe(true);
  });

  it('desmarcar os dois setores estranhos tira exatamente R$ 1.933,21', () => {
    const origens = montarOrigens({
      setorId: PLAY5, linhas: LINHAS, setorDoOperador,
      excluidas: new Set([PLAYMIX, PLAY4]),
    });
    expect(totalExcluido(origens)).toBeCloseTo(1933.21, 2);
    expect(totalLiquido(origens)).toBeCloseTo(31200.66, 2);
  });

  it('marca `excluida` na origem certa e deixa as demais intactas', () => {
    const origens = montarOrigens({
      setorId: PLAY5, linhas: LINHAS, setorDoOperador, excluidas: new Set([PLAY4]),
    });
    expect(origens.find(o => o.chave === PLAY4)!.excluida).toBe(true);
    expect(origens.find(o => o.chave === PLAYMIX)!.excluida).toBe(false);
    expect(origens.find(o => o.chave === PLAY5)!.excluida).toBe(false);
  });

  it('devolve lista vazia quando o setor não tem linha nenhuma', () => {
    expect(montarOrigens({ setorId: PLAY5, linhas: [], setorDoOperador })).toEqual([]);
  });
});

describe('origemConta', () => {
  it('sem conjunto de exclusão, tudo conta', () => {
    expect(origemConta(PLAY4, undefined)).toBe(true);
    expect(origemConta(PLAY4, new Set())).toBe(true);
  });

  it('origem no conjunto sai', () => {
    expect(origemConta(PLAY4, new Set([PLAY4]))).toBe(false);
  });
});

describe('linhaNoEscopo com exclusão — as telas têm que concordar', () => {
  const escopo = (excluidas?: Set<string>) => escopoDeSetor({
    setorId: PLAY5,
    alternativo: false,
    operadores: new Set(['izadora', 'eduarda']),
    temCarimbo: true,
    origensExcluidas: excluidas,
    setorDoOperador,
  });

  it('sem exclusão, o carimbo continua mandando sozinho', () => {
    const e = escopo();
    expect(linhaNoEscopo({ operador_id: 'bruna',   setor_id: PLAY5 }, e)).toBe(true);
    expect(linhaNoEscopo({ operador_id: 'izadora', setor_id: PLAY5 }, e)).toBe(true);
    expect(linhaNoEscopo({ operador_id: 'izadora', setor_id: PLAY4 }, e)).toBe(false);
  });

  it('com a origem desmarcada, a linha carimbada aqui deixa de contar', () => {
    const e = escopo(new Set([PLAYMIX]));
    expect(linhaNoEscopo({ operador_id: 'bruna',   setor_id: PLAY5 }, e)).toBe(false);
    expect(linhaNoEscopo({ operador_id: 'izadora', setor_id: PLAY5 }, e)).toBe(true);
  });

  it('desmarcar "sem operador" tira a órfã sem levar mais ninguém', () => {
    const e = escopo(new Set([ORIGEM_SEM_OPERADOR]));
    expect(linhaNoEscopo({ operador_id: null,      setor_id: PLAY5 }, e)).toBe(false);
    expect(linhaNoEscopo({ operador_id: 'bruna',   setor_id: PLAY5 }, e)).toBe(true);
  });

  it('exclusão vale também no setor alternativo, que soma pelos operadores', () => {
    const alt = escopoDeSetor({
      setorId: PLAY5,
      alternativo: true,
      operadores: new Set(['izadora', 'isabela']),
      temCarimbo: true,
      origensExcluidas: new Set([PLAY4]),
      setorDoOperador,
    });
    // `isabela` é membro emprestado, mas a origem dela está desmarcada.
    expect(linhaNoEscopo({ operador_id: 'isabela', setor_id: PLAY5 }, alt)).toBe(false);
    expect(linhaNoEscopo({ operador_id: 'izadora', setor_id: PLAY5 }, alt)).toBe(true);
  });

  it('a soma linha a linha bate com a soma das origens exibidas', () => {
    // É a garantia que importa para o usuário: o card e a lista embaixo dele
    // não podem contar coisas diferentes.
    const excluidas = new Set([PLAYMIX, PLAY4]);
    const origens = montarOrigens({ setorId: PLAY5, linhas: LINHAS, setorDoOperador, excluidas });
    const e = escopo(excluidas);

    const somaLinhaALinha = LINHAS
      .filter(l => linhaNoEscopo({ operador_id: l.operador_id, setor_id: PLAY5 }, e))
      .reduce((s, l) => s + l.valor_recebido, 0);

    expect(somaLinhaALinha).toBeCloseTo(totalLiquido(origens), 2);
  });
});
