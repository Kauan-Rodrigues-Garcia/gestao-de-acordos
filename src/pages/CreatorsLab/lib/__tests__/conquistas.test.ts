/**
 * O sistema de conquistas.
 *
 * A armadilha aqui é conceder cedo demais: "abriu tudo" é trivialmente
 * verdadeiro quando não há nada para abrir, e "desbloqueou tudo" fica
 * impossível se a última conquista contar a si mesma.
 */
import { describe, it, expect } from 'vitest';
import {
  CONQUISTAS, PROGRESSO_VAZIO, conquistasDesbloqueadas, novasConquistas,
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
