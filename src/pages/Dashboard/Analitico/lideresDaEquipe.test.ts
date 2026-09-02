/**
 * lideresDaEquipe.test.ts — "o explícito manda, o legado é reserva".
 *
 * O caso central é o que originou a correção: equipe com um líder em
 * `equipe_lideres` e OUTRO colado por `perfis.equipe_id`. A união mostrava os
 * dois, e o segundo não saía por tela nenhuma.
 */
import { describe, it, expect } from 'vitest';
import { lideresDaEquipe, type PerfilLider } from './lideresDaEquipe';

const bryan:  PerfilLider = { id: 'l-bryan',  nome: 'Bryan Queiroz',   foto_url: 'bryan.jpg',  equipe_id: null };
const kauan:  PerfilLider = { id: 'l-kauan',  nome: 'Kauan Rodrigues', foto_url: 'kauan.jpg',  equipe_id: 'eq-bryan' };
const amauri: PerfilLider = { id: 'l-amauri', nome: 'Amauri',          foto_url: 'amauri.jpg', equipe_id: null };

const nomes = (r: Record<string, { nome: string }[]>, eq: string) =>
  (r[eq] ?? []).map(l => l.nome);

describe('o vínculo explícito manda', () => {
  /** O caso real: Receptivo / equipe "Bryan", em 18/08/2026. */
  it('equipe com vínculo explícito ignora o líder colado por perfis.equipe_id', () => {
    const r = lideresDaEquipe({
      lideres:    [bryan, kauan],
      explicitos: [{ equipe_id: 'eq-bryan', lider_id: 'l-bryan' }],
      clones:     [],
    });
    expect(nomes(r, 'eq-bryan')).toEqual(['Bryan Queiroz']);
  });

  it('substitui a lista inteira, não completa', () => {
    const r = lideresDaEquipe({
      lideres:    [bryan, kauan, amauri],
      explicitos: [{ equipe_id: 'eq-bryan', lider_id: 'l-amauri' }],
      clones:     [{ equipe_id: 'eq-bryan', operador_id: 'l-bryan' }],
    });
    // Nem o legado (Kauan) nem o clone (Bryan) entram: há decisão explícita.
    expect(nomes(r, 'eq-bryan')).toEqual(['Amauri']);
  });

  it('vários líderes explícitos na mesma equipe convivem', () => {
    const r = lideresDaEquipe({
      lideres:    [bryan, amauri],
      explicitos: [
        { equipe_id: 'eq-1', lider_id: 'l-bryan' },
        { equipe_id: 'eq-1', lider_id: 'l-amauri' },
      ],
      clones: [],
    });
    expect(nomes(r, 'eq-1')).toEqual(['Bryan Queiroz', 'Amauri']);
  });
});

describe('sem vínculo explícito, a reserva vale', () => {
  /**
   * Não é caso raro: 22 dos 31 líderes da BookPlay não estão em
   * `equipe_lideres`. Sem a reserva, o card deles ficaria sem foto nenhuma.
   */
  it('cai em perfis.equipe_id', () => {
    const r = lideresDaEquipe({
      lideres: [kauan], explicitos: [], clones: [],
    });
    expect(nomes(r, 'eq-bryan')).toEqual(['Kauan Rodrigues']);
  });

  it('soma o líder clonado na equipe', () => {
    const r = lideresDaEquipe({
      lideres:    [kauan, amauri],
      explicitos: [],
      clones:     [{ equipe_id: 'eq-bryan', operador_id: 'l-amauri' }],
    });
    expect(nomes(r, 'eq-bryan')).toEqual(['Kauan Rodrigues', 'Amauri']);
  });

  it('clone que não é líder não vira líder', () => {
    const r = lideresDaEquipe({
      lideres:    [kauan],
      explicitos: [],
      clones:     [{ equipe_id: 'eq-bryan', operador_id: 'operador-qualquer' }],
    });
    expect(nomes(r, 'eq-bryan')).toEqual(['Kauan Rodrigues']);
  });

  it('o explícito de UMA equipe não afeta as outras', () => {
    const r = lideresDaEquipe({
      lideres:    [bryan, kauan],
      explicitos: [{ equipe_id: 'eq-outra', lider_id: 'l-bryan' }],
      clones:     [],
    });
    expect(nomes(r, 'eq-outra')).toEqual(['Bryan Queiroz']);
    expect(nomes(r, 'eq-bryan')).toEqual(['Kauan Rodrigues']);
  });
});

describe('bordas', () => {
  it('vínculo apontando para alguém que não é líder é ignorado', () => {
    const r = lideresDaEquipe({
      lideres:    [bryan],
      explicitos: [{ equipe_id: 'eq-1', lider_id: 'fantasma' }],
      clones:     [],
    });
    // Sem ninguém válido, a equipe não entra no mapa — e não vira lista vazia
    // que a tela teria de distinguir de "não carregou".
    expect(r['eq-1']).toBeUndefined();
  });

  it('não repete quem chega por duas fontes', () => {
    const r = lideresDaEquipe({
      lideres:    [kauan],
      explicitos: [],
      clones:     [{ equipe_id: 'eq-bryan', operador_id: 'l-kauan' }],
    });
    expect(nomes(r, 'eq-bryan')).toEqual(['Kauan Rodrigues']);
  });

  /** Homônimos são duas pessoas — a versão antiga deduplicava por nome. */
  it('dois líderes de mesmo nome continuam sendo dois', () => {
    const a: PerfilLider = { id: 'l-a', nome: 'Ana Silva', foto_url: 'a.jpg', equipe_id: null };
    const b: PerfilLider = { id: 'l-b', nome: 'Ana Silva', foto_url: 'b.jpg', equipe_id: null };
    const r = lideresDaEquipe({
      lideres:    [a, b],
      explicitos: [
        { equipe_id: 'eq-1', lider_id: 'l-a' },
        { equipe_id: 'eq-1', lider_id: 'l-b' },
      ],
      clones: [],
    });
    expect(r['eq-1']).toHaveLength(2);
    expect(r['eq-1'].map(l => l.foto_url)).toEqual(['a.jpg', 'b.jpg']);
  });

  it('entrada vazia devolve mapa vazio', () => {
    expect(lideresDaEquipe({ lideres: [], explicitos: [], clones: [] })).toEqual({});
  });
});

/*
 * A troca de liderança entre duas equipes — BookPlay, Play 4, 02/09/2026.
 *
 * Trocaram quem lidera "Digital Bruno" e "Maria - Capitã" e só `equipe_lideres`
 * acompanhou. Maria Oliveira lidera a segunda e continua com `perfis.equipe_id`
 * apontando para a primeira; Tamires Valentin ficou presa na segunda sem
 * liderar nada. É desse resíduo que saem "duas fotos" e "a foto do líder
 * antigo".
 */
describe('quem já lidera alguma equipe não volta pela reserva', () => {
  const maria: PerfilLider = {
    id: 'l-maria', nome: 'Maria Oliveira', foto_url: 'maria.jpg', equipe_id: 'eq-digital-bruno',
  };
  const brunno: PerfilLider = {
    id: 'l-brunno', nome: 'Brunno Piccolo', foto_url: 'brunno.jpg', equipe_id: null,
  };

  it('a equipe antiga não mostra o líder que saiu, nem quando perde o vínculo próprio', () => {
    const r = lideresDaEquipe({
      lideres:    [maria, brunno],
      // "Digital Bruno" ficou sem vínculo explícito — é quando a reserva entra.
      explicitos: [{ equipe_id: 'eq-maria-capita', lider_id: 'l-maria' }],
      clones:     [],
    });
    expect(nomes(r, 'eq-maria-capita')).toEqual(['Maria Oliveira']);
    expect(r['eq-digital-bruno']).toBeUndefined();
  });

  it('duas fotos: o líder de hoje e o preso pelo cadastro não se somam', () => {
    const r = lideresDaEquipe({
      lideres:    [maria, brunno],
      explicitos: [
        { equipe_id: 'eq-digital-bruno', lider_id: 'l-brunno' },
        { equipe_id: 'eq-maria-capita',  lider_id: 'l-maria'  },
      ],
      clones: [],
    });
    expect(nomes(r, 'eq-digital-bruno')).toEqual(['Brunno Piccolo']);
  });

  it('o clone também não ressuscita quem lidera outra equipe', () => {
    const r = lideresDaEquipe({
      lideres:    [maria],
      explicitos: [{ equipe_id: 'eq-maria-capita', lider_id: 'l-maria' }],
      clones:     [{ equipe_id: 'eq-antiga', operador_id: 'l-maria' }],
    });
    expect(r['eq-antiga']).toBeUndefined();
  });

  it('quem não lidera nada continua valendo como reserva', () => {
    // Tamires: presa em "Maria - Capitã" pelo cadastro, sem vínculo nenhum. A
    // reserva é o que sustenta os 22 líderes da BookPlay fora de equipe_lideres.
    const tamires: PerfilLider = {
      id: 'l-tamires', nome: 'Tamires Valentin', foto_url: 't.jpg', equipe_id: 'eq-sozinha',
    };
    const r = lideresDaEquipe({ lideres: [tamires], explicitos: [], clones: [] });
    expect(nomes(r, 'eq-sozinha')).toEqual(['Tamires Valentin']);
  });
});
