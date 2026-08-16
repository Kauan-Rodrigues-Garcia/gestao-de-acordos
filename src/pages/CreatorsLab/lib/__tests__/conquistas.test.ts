/**
 * O sistema de conquistas.
 *
 * A armadilha aqui é conceder cedo demais: "abriu tudo" é trivialmente
 * verdadeiro quando não há nada para abrir, e "desbloqueou tudo" fica
 * impossível se a última conquista contar a si mesma.
 */
import { describe, it, expect } from 'vitest';
import {
  CONQUISTAS, PROGRESSO_VAZIO, conquistasDesbloqueadas, mesclarProgresso,
  normalizarProgresso, novasConquistas,
  type Progresso,
} from '../conquistas';

const com = (over: Partial<Progresso>): Progresso => ({ ...PROGRESSO_VAZIO, ...over });

describe('conquistasDesbloqueadas', () => {
  it('progresso zerado não dá nada', () => {
    expect(conquistasDesbloqueadas(PROGRESSO_VAZIO).size).toBe(0);
  });

  it('entrar já garante a primeira', () => {
    expect(conquistasDesbloqueadas(com({ entrou: true })).has('curious-mind')).toBe(true);
  });

  it('só as duas realidades destravam a troca', () => {
    expect(conquistasDesbloqueadas(com({ temasVistos: ['cyberpunk'] })).has('reality-shifter')).toBe(false);
    expect(conquistasDesbloqueadas(com({ temasVistos: ['cyberpunk', 'arcade'] })).has('reality-shifter')).toBe(true);
  });

  /**
   * O arquivo pessoal começa vazio (nada foi informado ainda). Sem esta guarda,
   * "abriu todos os itens" seria verdade para quem nunca abriu nada.
   */
  it('sem itens para abrir, ninguém vira Movie Nerd de graça', () => {
    expect(conquistasDesbloqueadas(com({ totalItens: 0, itensAbertos: [] })).has('movie-nerd')).toBe(false);
  });

  it('abrir todos os itens destrava', () => {
    const p = com({ totalItens: 3, itensAbertos: ['a', 'b', 'c'] });
    expect(conquistasDesbloqueadas(p).has('movie-nerd')).toBe(true);
  });

  it('faltando um item, não destrava', () => {
    const p = com({ totalItens: 3, itensAbertos: ['a', 'b'] });
    expect(conquistasDesbloqueadas(p).has('movie-nerd')).toBe(false);
  });

  it('cinco comandos distintos fazem o Terminal Hacker', () => {
    const quatro = com({ comandosUsados: ['help', 'about', 'kauan', 'phi'] });
    const cinco  = com({ comandosUsados: ['help', 'about', 'kauan', 'phi', 'stack'] });
    expect(conquistasDesbloqueadas(quatro).has('terminal-hacker')).toBe(false);
    expect(conquistasDesbloqueadas(cinco).has('terminal-hacker')).toBe(true);
  });

  it('mesma guarda vale para os experimentos de matemática', () => {
    expect(conquistasDesbloqueadas(com({ totalExperimentos: 0 })).has('math-doesnt-lie')).toBe(false);
    expect(conquistasDesbloqueadas(com({
      totalExperimentos: 2, experimentosUsados: ['ondas', 'orbita'],
    })).has('math-doesnt-lie')).toBe(true);
  });

  it('o botão proibido só cede no quinto clique', () => {
    expect(conquistasDesbloqueadas(com({ cliquesProibidos: 4 })).has('dont-touch-this')).toBe(false);
    expect(conquistasDesbloqueadas(com({ cliquesProibidos: 5 })).has('dont-touch-this')).toBe(true);
  });
});

describe('a conquista final', () => {
  const tudo: Progresso = {
    entrou: true,
    temasVistos: ['cyberpunk', 'arcade'],
    itensAbertos: ['a'], totalItens: 1,
    comandosUsados: ['a', 'b', 'c', 'd', 'e'],
    experimentosUsados: ['x'], totalExperimentos: 1,
    cliquesProibidos: 5,
    segredoArcade: true,
  };

  it('exige todas as outras', () => {
    expect(conquistasDesbloqueadas(tudo).has('free-time')).toBe(true);
  });

  it('faltando uma só, não sai', () => {
    expect(conquistasDesbloqueadas({ ...tudo, segredoArcade: false }).has('free-time')).toBe(false);
  });

  /** Se ela contasse a si mesma, a lista nunca fecharia. */
  it('não depende de si mesma', () => {
    expect(conquistasDesbloqueadas(tudo).size).toBe(CONQUISTAS.length);
  });
});

describe('novasConquistas', () => {
  it('devolve só o que acabou de cair', () => {
    const antes  = conquistasDesbloqueadas(com({ entrou: true }));
    const depois = conquistasDesbloqueadas(com({ entrou: true, cliquesProibidos: 5 }));
    expect(novasConquistas(antes, depois)).toEqual(['dont-touch-this']);
  });

  it('sem mudança, lista vazia', () => {
    const s = conquistasDesbloqueadas(com({ entrou: true }));
    expect(novasConquistas(s, s)).toEqual([]);
  });
});

/**
 * A junção existe porque o progresso passou a ter duas moradas: o navegador,
 * que responde na hora, e o banco, que segue a pessoa de máquina em máquina.
 * As duas versões podem discordar — e a única resposta errada é esquecer algo.
 */
describe('mesclarProgresso', () => {
  it('listas se juntam sem repetir', () => {
    const a = com({ comandosUsados: ['ajuda', 'quem'] });
    const b = com({ comandosUsados: ['quem', 'matrix'] });
    expect(mesclarProgresso(a, b).comandosUsados.sort())
      .toEqual(['ajuda', 'matrix', 'quem']);
  });

  it('número vale o maior, nunca o mais recente', () => {
    expect(mesclarProgresso(com({ cliquesProibidos: 5 }), com({ cliquesProibidos: 1 })).cliquesProibidos)
      .toBe(5);
  });

  it('booleano é "algum dos dois"', () => {
    expect(mesclarProgresso(com({ segredoArcade: true }), com({ segredoArcade: false })).segredoArcade)
      .toBe(true);
    expect(mesclarProgresso(com({ entrou: false }), com({ entrou: true })).entrou).toBe(true);
  });

  /** Sem árbitro de relógio, a ordem não pode decidir nada. */
  it('a ordem dos argumentos é irrelevante', () => {
    const a = com({ entrou: true, itensAbertos: ['x'], totalItens: 3, cliquesProibidos: 2 });
    const b = com({ segredoArcade: true, itensAbertos: ['y'], totalItens: 5 });

    const ab = mesclarProgresso(a, b);
    const ba = mesclarProgresso(b, a);
    expect({ ...ab, itensAbertos: [...ab.itensAbertos].sort() })
      .toEqual({ ...ba, itensAbertos: [...ba.itensAbertos].sort() });
  });

  /** O caso que motivou tudo: navegador limpo não pode apagar o que já existe. */
  it('progresso vazio de um lado não apaga o do outro', () => {
    const cheio = com({
      entrou: true, temasVistos: ['cyberpunk', 'arcade'], cliquesProibidos: 5,
      segredoArcade: true, comandosUsados: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(mesclarProgresso(PROGRESSO_VAZIO, cheio)).toEqual(cheio);
    expect(mesclarProgresso(cheio, PROGRESSO_VAZIO)).toEqual(cheio);
  });

  it('as conquistas sobrevivem à junção', () => {
    const casa     = com({ entrou: true, cliquesProibidos: 5 });
    const trabalho = com({ segredoArcade: true });
    const juntos   = conquistasDesbloqueadas(mesclarProgresso(casa, trabalho));
    expect(juntos.has('dont-touch-this')).toBe(true);
    expect(juntos.has('arcade-master')).toBe(true);
  });
});

/**
 * O que volta do banco é `jsonb`: pode estar velho, incompleto, ou com o tipo
 * errado se alguém editou à mão. Confiar nisso é como confiar em resposta de
 * formulário.
 */
describe('normalizarProgresso', () => {
  it('nulo e lixo viram progresso zerado', () => {
    expect(normalizarProgresso(null)).toEqual(PROGRESSO_VAZIO);
    expect(normalizarProgresso('texto')).toEqual(PROGRESSO_VAZIO);
    expect(normalizarProgresso(42)).toEqual(PROGRESSO_VAZIO);
  });

  it('objeto incompleto ganha os campos que faltam', () => {
    expect(normalizarProgresso({ entrou: true })).toEqual({ ...PROGRESSO_VAZIO, entrou: true });
  });

  it('lista com tipo errado dentro é filtrada, não aceita', () => {
    const p = normalizarProgresso({ comandosUsados: ['ok', 3, null, { a: 1 }, 'bom'] });
    expect(p.comandosUsados).toEqual(['ok', 'bom']);
  });

  it('lista que não é lista vira lista vazia', () => {
    expect(normalizarProgresso({ itensAbertos: 'tudo' }).itensAbertos).toEqual([]);
  });

  it('número negativo, NaN ou string não passam por número', () => {
    expect(normalizarProgresso({ cliquesProibidos: -9 }).cliquesProibidos).toBe(0);
    expect(normalizarProgresso({ cliquesProibidos: NaN }).cliquesProibidos).toBe(0);
    expect(normalizarProgresso({ totalItens: '12' }).totalItens).toBe(0);
  });

  it('booleano só é verdadeiro quando é o booleano true', () => {
    expect(normalizarProgresso({ entrou: 'true' }).entrou).toBe(false);
    expect(normalizarProgresso({ entrou: 1 }).entrou).toBe(false);
    expect(normalizarProgresso({ entrou: true }).entrou).toBe(true);
  });

  /** Uma linha estragada no banco não pode derrubar a página. */
  it('o resultado sempre serve para calcular conquistas', () => {
    for (const cru of [null, {}, { itensAbertos: 7 }, { temasVistos: null }, []]) {
      expect(() => conquistasDesbloqueadas(normalizarProgresso(cru))).not.toThrow();
    }
  });
});
