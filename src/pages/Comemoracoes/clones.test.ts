/**
 * clones.test.ts — a pergunta "qual setor exibe a comemoração?".
 *
 * Errar aqui é a festa explodindo no setor errado, ou não explodindo em
 * nenhum — que é o caso do operador que só existe como clone.
 */
import { describe, it, expect } from 'vitest';
import {
  setoresDoOperador, homenageadosAmbiguos, precisaPerguntarSetor,
  setoresEscolhidosPara, TODOS_OS_SETORES, type MapasVinculo,
} from './clones';

const SETOR_A = 's-a';
const SETOR_B = 's-b';

/** Ana é do setor A e clone numa equipe do setor B. Bruno é só do A. */
const MAPAS: MapasVinculo = {
  perfis: [
    { id: 'ana',   setor_id: SETOR_A },
    { id: 'bruno', setor_id: SETOR_A },
    { id: 'sem',   setor_id: null },
  ],
  equipes: [
    { id: 'eq-a', setor_id: SETOR_A },
    { id: 'eq-b', setor_id: SETOR_B },
    { id: 'eq-orfa', setor_id: null },
  ],
  clones: [
    { operador_id: 'ana', equipe_id: 'eq-b' },
    { operador_id: 'sem', equipe_id: 'eq-b' },
  ],
};

describe('setoresDoOperador', () => {
  it('clone aparece no setor do perfil e no da equipe clonada', () => {
    expect(setoresDoOperador('ana', MAPAS)).toEqual([SETOR_A, SETOR_B]);
  });

  it('quem não é clone tem só o setor do perfil', () => {
    expect(setoresDoOperador('bruno', MAPAS)).toEqual([SETOR_A]);
  });

  it('sem setor no perfil, vale só o da equipe clonada', () => {
    expect(setoresDoOperador('sem', MAPAS)).toEqual([SETOR_B]);
  });

  it('desconhecido não estoura', () => {
    expect(setoresDoOperador('ninguem', MAPAS)).toEqual([]);
  });

  it('equipe sem setor não entra na lista', () => {
    const m: MapasVinculo = {
      ...MAPAS,
      clones: [{ operador_id: 'bruno', equipe_id: 'eq-orfa' }],
    };
    expect(setoresDoOperador('bruno', m)).toEqual([SETOR_A]);
  });

  it('clone na mesma equipe do próprio setor não duplica', () => {
    const m: MapasVinculo = {
      ...MAPAS,
      clones: [{ operador_id: 'bruno', equipe_id: 'eq-a' }],
    };
    expect(setoresDoOperador('bruno', m)).toEqual([SETOR_A]);
  });
});

describe('quando perguntar', () => {
  it('pergunta só por quem está em 2+ setores', () => {
    expect(homenageadosAmbiguos(['ana', 'bruno'], MAPAS))
      .toEqual([{ operadorId: 'ana', setores: [SETOR_A, SETOR_B] }]);
  });

  it('lista só de gente com um setor não abre pergunta', () => {
    // Um modal com uma opção só é obstáculo, não decisão.
    expect(precisaPerguntarSetor(['bruno', 'sem'], MAPAS)).toBe(false);
  });

  it('basta um clone na lista para perguntar', () => {
    expect(precisaPerguntarSetor(['bruno', 'ana'], MAPAS)).toBe(true);
  });

  it('lista vazia não pergunta', () => {
    expect(precisaPerguntarSetor([], MAPAS)).toBe(false);
  });
});

describe('o que vai gravado', () => {
  it('a escolha vira o único setor', () => {
    expect(setoresEscolhidosPara('ana', SETOR_B, MAPAS)).toEqual([SETOR_B]);
  });

  it('"todos" grava os dois — o comportamento antigo, agora deliberado', () => {
    expect(setoresEscolhidosPara('ana', TODOS_OS_SETORES, MAPAS))
      .toEqual([SETOR_A, SETOR_B]);
  });

  it('sem resposta grava todos', () => {
    expect(setoresEscolhidosPara('ana', undefined, MAPAS)).toEqual([SETOR_A, SETOR_B]);
  });

  it('resposta de um setor que não é dele é ignorada', () => {
    // Setor apagado entre abrir a pergunta e confirmar, por exemplo.
    expect(setoresEscolhidosPara('ana', 's-fantasma', MAPAS)).toEqual([SETOR_A, SETOR_B]);
  });

  it('quem não é clone grava o próprio setor, explícito', () => {
    expect(setoresEscolhidosPara('bruno', undefined, MAPAS)).toEqual([SETOR_A]);
  });

  it('operador só-clone grava o setor da equipe, não uma lista vazia', () => {
    // É por isto que o cliente escreve sempre: o fallback do banco é o setor do
    // perfil, que aqui é NULL — a comemoração sairia sem plateia.
    expect(setoresEscolhidosPara('sem', undefined, MAPAS)).toEqual([SETOR_B]);
  });
});
