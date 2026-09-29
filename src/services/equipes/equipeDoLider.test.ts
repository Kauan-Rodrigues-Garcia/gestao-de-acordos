/**
 * equipeDoLider.test.ts — em que equipes a pessoa está (regra de 29/09/2026).
 *
 * «Ou a pessoa está em uma equipe e tem uma equipe, ou não está e não tem.»
 * «Se tem 2 equipes, soma em todas que faz parte.»
 *
 * A ligação com o banco (a composição realmente lê `equipe_lideres`) é coberta
 * em `analitico/composicaoLiderEquipe.test.ts`. Aqui só a decisão.
 */
import { describe, it, expect } from 'vitest';
import { equipesLideradasPorPessoa, equipesDaPessoa, equipesDoPerfil } from './equipeDoLider';

const MATHEUS = 'lider-matheus';
const BRUNNO  = 'lider-brunno';
const EQ_A    = 'eq-a';
const EQ_B    = 'eq-b';
const EQ_C    = 'eq-c';

describe('equipesLideradasPorPessoa', () => {
  it('lista TODAS as equipes que cada um lidera', () => {
    expect(equipesLideradasPorPessoa([
      { equipe_id: EQ_A, lider_id: BRUNNO },
      { equipe_id: EQ_B, lider_id: BRUNNO },
      { equipe_id: EQ_C, lider_id: MATHEUS },
    ])).toEqual({ [BRUNNO]: [EQ_A, EQ_B], [MATHEUS]: [EQ_C] });
  });

  it('vínculo repetido para a MESMA equipe não conta como dois', () => {
    expect(equipesLideradasPorPessoa([
      { equipe_id: EQ_A, lider_id: MATHEUS },
      { equipe_id: EQ_A, lider_id: MATHEUS },
    ])).toEqual({ [MATHEUS]: [EQ_A] });
  });

  it('ignora linha sem equipe ou sem líder', () => {
    const sujo = [
      { equipe_id: '', lider_id: MATHEUS },
      { equipe_id: EQ_A, lider_id: '' },
    ] as { equipe_id: string; lider_id: string }[];
    expect(equipesLideradasPorPessoa(sujo)).toEqual({});
  });
});

describe('equipesDaPessoa', () => {
  it('líder de três equipes está nas três', () => {
    expect(equipesDaPessoa('lider', null, [EQ_A, EQ_B, EQ_C])).toEqual([EQ_A, EQ_B, EQ_C]);
  });

  it('líder: o `perfis.equipe_id` não existe (caso Maria Oliveira)', () => {
    // Lidera «Maria - Capitã», resíduo em «Digital Bruno» — que é do Brunno.
    expect(equipesDaPessoa('lider', 'digital-bruno', ['maria-capita'])).toEqual(['maria-capita']);
  });

  it('líder que não lidera nada não está em equipe nenhuma, mesmo com resíduo', () => {
    // Caso Tamires Valentin: nenhuma liderança, resíduo em «Maria - Capitã».
    expect(equipesDaPessoa('lider', 'maria-capita', [])).toEqual([]);
  });

  it('membro: a equipe de membro vem primeiro, e a que lidera soma', () => {
    expect(equipesDaPessoa('elite', EQ_A, [EQ_B])).toEqual([EQ_A, EQ_B]);
  });

  it('operador clonado está na própria e nas clonadas', () => {
    expect(equipesDaPessoa('operador', EQ_A, [], [EQ_B, EQ_C])).toEqual([EQ_A, EQ_B, EQ_C]);
  });

  it('líder clonado como operador: lideradas e clones, sem repetir', () => {
    expect(equipesDaPessoa('lider', null, [EQ_A], [EQ_A, EQ_B])).toEqual([EQ_A, EQ_B]);
  });

  it('sem vínculo nenhum, nenhuma equipe', () => {
    expect(equipesDaPessoa('operador', null, [], [])).toEqual([]);
    expect(equipesDaPessoa(null, null)).toEqual([]);
  });
});

// A pergunta «quais são as minhas equipes?» feita pelas telas. Tem de dizer o
// mesmo que fn_equipes_de_alcance / fn_equipe_principal no banco.
describe('equipesDoPerfil', () => {
  it('líder só com liderança TEM equipe', () => {
    expect(equipesDoPerfil('lider', null, [EQ_A])).toEqual({ principal: EQ_A, todas: [EQ_A], lideradas: [EQ_A] });
  });

  it('líder com resíduo: o resíduo some de todas e da principal', () => {
    expect(equipesDoPerfil('lider', 'eq-antiga', [EQ_A])).toEqual({ principal: EQ_A, todas: [EQ_A], lideradas: [EQ_A] });
  });

  it('líder sem liderança não tem equipe, mesmo com resíduo', () => {
    expect(equipesDoPerfil('lider', EQ_A, [])).toEqual({ principal: null, todas: [], lideradas: [] });
  });

  it('líder de várias: todas contam, e não há principal', () => {
    const r = equipesDoPerfil('lider', null, [EQ_A, EQ_B, EQ_A]);
    expect(r.principal).toBeNull();
    expect(r.todas).toEqual([EQ_A, EQ_B]);
    expect(r.lideradas).toEqual([EQ_A, EQ_B]);
  });

  it('membro que também lidera: está nas duas, e a principal é a de membro', () => {
    expect(equipesDoPerfil('elite', EQ_A, [EQ_B])).toEqual({ principal: EQ_A, todas: [EQ_A, EQ_B], lideradas: [EQ_B] });
  });

  it('membro comum', () => {
    expect(equipesDoPerfil('operador', EQ_A, [])).toEqual({ principal: EQ_A, todas: [EQ_A], lideradas: [] });
  });

  it('sem nada, nada', () => {
    expect(equipesDoPerfil('operador', null, [])).toEqual({ principal: null, todas: [], lideradas: [] });
  });
});
