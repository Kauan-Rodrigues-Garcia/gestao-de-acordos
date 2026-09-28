/**
 * equipeDoLider.test.ts — a regra pura de qual equipe o líder credita.
 *
 * A ligação com o banco (a composição realmente lê `equipe_lideres`) é coberta
 * em `analitico/composicaoLiderEquipe.test.ts`. Aqui só a decisão.
 */
import { describe, it, expect } from 'vitest';
import { equipeUnicaPorLider, equipeQueCredita, equipesDoPerfil } from './equipeDoLider';

const MATHEUS = 'lider-matheus';
const AMAURI  = 'lider-amauri';
const EQ_A    = 'eq-a';
const EQ_B    = 'eq-b';

describe('equipeUnicaPorLider', () => {
  it('mapeia quem lidera exatamente UMA equipe', () => {
    expect(equipeUnicaPorLider([{ equipe_id: EQ_A, lider_id: MATHEUS }]))
      .toEqual({ [MATHEUS]: EQ_A });
  });

  it('deixa de FORA quem lidera mais de uma', () => {
    // Creditar as duas contaria o mesmo recebimento duas vezes no setor, e
    // escolher uma seria inventar. O caso segue contando só no setor.
    const mapa = equipeUnicaPorLider([
      { equipe_id: EQ_A, lider_id: AMAURI },
      { equipe_id: EQ_B, lider_id: AMAURI },
    ]);
    expect(mapa[AMAURI]).toBeUndefined();
  });

  it('vínculo repetido para a MESMA equipe não conta como duas', () => {
    const mapa = equipeUnicaPorLider([
      { equipe_id: EQ_A, lider_id: MATHEUS },
      { equipe_id: EQ_A, lider_id: MATHEUS },
    ]);
    expect(mapa).toEqual({ [MATHEUS]: EQ_A });
  });

  it('lista vazia devolve mapa vazio', () => {
    expect(equipeUnicaPorLider([])).toEqual({});
  });

  it('ignora linha sem equipe ou sem líder', () => {
    const sujo = [
      { equipe_id: '', lider_id: MATHEUS },
      { equipe_id: EQ_A, lider_id: '' },
    ] as { equipe_id: string; lider_id: string }[];
    expect(equipeUnicaPorLider(sujo)).toEqual({});
  });
});

/*
 * `equipeQueCredita` — de quem é o dinheiro depois de uma troca de liderança.
 *
 * Cenário do banco (BookPlay, Play 4, 02/09/2026): trocaram a liderança de duas
 * equipes e só `equipe_lideres` acompanhou. Maria Oliveira passou a liderar
 * "Maria - Capitã" mas continuou com `perfis.equipe_id` = "Digital Bruno", e os
 * R$ 7.916,99 dela em agosto contavam no card do outro líder.
 */
describe('equipeQueCredita', () => {
  it('cargo lider: a equipe que ele LIDERA ganha, não a do cadastro', () => {
    expect(equipeQueCredita('lider', EQ_A, EQ_B)).toBe(EQ_B);
  });

  it('cargo lider sem vínculo explícito: cai no cadastro', () => {
    // Não é caso raro — a maioria dos líderes nunca foi para `equipe_lideres`.
    expect(equipeQueCredita('lider', EQ_A, null)).toBe(EQ_A);
  });

  it('cargo lider que lidera DUAS equipes: `lideranca` já veio nulo, vale o cadastro', () => {
    expect(equipeQueCredita('lider', EQ_A, undefined)).toBe(EQ_A);
  });

  it('membro: o cadastro manda, mesmo liderando outra equipe', () => {
    // Tirar o recebimento dele daqui esvaziaria a equipe de que ele faz parte.
    expect(equipeQueCredita('operador', EQ_A, EQ_B)).toBe(EQ_A);
  });

  it('membro sem cadastro: o vínculo de liderança serve de reserva', () => {
    expect(equipeQueCredita('operador', null, EQ_B)).toBe(EQ_B);
  });

  it('elite e gerencia seguem sendo membros — a tela de Equipes os trata assim', () => {
    expect(equipeQueCredita('elite', EQ_A, EQ_B)).toBe(EQ_A);
    expect(equipeQueCredita('gerencia', EQ_A, EQ_B)).toBe(EQ_A);
  });

  it('sem cadastro e sem liderança devolve null', () => {
    expect(equipeQueCredita('lider', null, null)).toBeNull();
    expect(equipeQueCredita(null, null, undefined)).toBeNull();
  });
});

// A pergunta «qual é a minha equipe?» feita pelas telas (28/09/2026). Tem de
// dizer o mesmo que fn_equipes_de_alcance / fn_equipe_principal no banco.
describe('equipesDoPerfil', () => {
  it('líder só com liderança (cadastro vazio — 33 dos 50 líderes) TEM equipe', () => {
    expect(equipesDoPerfil('lider', null, [EQ_A])).toEqual({ principal: EQ_A, todas: [EQ_A], lideradas: [EQ_A] });
  });
  it('líder que lidera: o cadastro é resíduo e fica de fora (caso Maria Oliveira)', () => {
    expect(equipesDoPerfil('lider', 'eq-antiga', [EQ_A])).toEqual({ principal: EQ_A, todas: [EQ_A], lideradas: [EQ_A] });
  });
  it('líder de várias: todas contam, e não há principal', () => {
    const r = equipesDoPerfil('lider', null, [EQ_A, 'eq-b', EQ_A]);
    expect(r.principal).toBeNull();
    expect(r.todas).toEqual([EQ_A, 'eq-b']);
  });
  it('líder sem liderança fica com o cadastro', () => {
    expect(equipesDoPerfil('lider', EQ_A, [])).toEqual({ principal: EQ_A, todas: [EQ_A], lideradas: [] });
  });
  it('membro: o cadastro manda, e a liderança soma', () => {
    expect(equipesDoPerfil('elite', EQ_A, ['eq-b'])).toEqual({ principal: EQ_A, todas: ['eq-b', EQ_A], lideradas: ['eq-b'] });
    expect(equipesDoPerfil('operador', EQ_A, [])).toEqual({ principal: EQ_A, todas: [EQ_A], lideradas: [] });
  });
  it('sem nada, nada', () => {
    expect(equipesDoPerfil('operador', null, [])).toEqual({ principal: null, todas: [], lideradas: [] });
  });
});
