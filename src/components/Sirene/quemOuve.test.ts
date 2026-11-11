import { describe, expect, it } from 'vitest';
import {
  HORARIO_NOVO, NINGUEM, TODOS, agruparPorSetor, faltaNoHorario, juntar, alternarEquipe, alternarSetor, doBanco, paraBanco, resumoDeQuemOuve, semNinguem,
} from './quemOuve';

const setores = [{ id: 's2', nome: 'Play 2' }, { id: 's1', nome: 'Play 1' }, { id: 's3', nome: 'Receptivo' }];
const equipes = [
  { id: 'e1', nome: 'Elite', setor_id: 's1' },
  { id: 'e2', nome: 'Águia', setor_id: 's1' },
  { id: 'e3', nome: 'Falcão', setor_id: 's2' },
  { id: 'e4', nome: 'Avulsa', setor_id: null },
];

describe('para quem a sirene toca', () => {
  it('começa sem ninguém, e ninguém não vira «todos» no banco', () => {
    expect(semNinguem(NINGUEM)).toBe(true);
    expect(semNinguem(TODOS)).toBe(false);
    expect(doBanco([], [])).toEqual(TODOS);
    expect(paraBanco(TODOS)).toEqual({ setor_ids: [], equipe_ids: [] });
    expect(doBanco(['s1'], ['e3'])).toEqual({ todos: false, setores: ['s1'], equipes: ['e3'] });
  });

  it('marcar o setor inteiro tira as equipes dele (já estão incluídas)', () => {
    let a = alternarEquipe(NINGUEM, equipes[0]);
    a = alternarEquipe(a, equipes[2]);
    expect(a.equipes).toEqual(['e1', 'e3']);
    a = alternarSetor(a, 's1', equipes);
    expect(a).toEqual({ todos: false, setores: ['s1'], equipes: ['e3'] });
    // Equipe de setor já inteiro não muda nada.
    expect(alternarEquipe(a, equipes[1])).toBe(a);
    // Desmarca o setor.
    expect(alternarSetor(a, 's1', equipes).setores).toEqual([]);
  });

  it('agrupa por setor em ordem de nome, equipes sem setor no fim', () => {
    const g = agruparPorSetor(setores, equipes);
    expect(g.map(x => x.setor?.nome ?? '—')).toEqual(['Play 1', 'Play 2', 'Receptivo', '—']);
    expect(g[0].equipes.map(e => e.nome)).toEqual(['Águia', 'Elite']);
    expect(g[3].equipes.map(e => e.id)).toEqual(['e4']);
  });

  it('busca sem acento: setor que bate vem inteiro, senão só as equipes que batem', () => {
    expect(agruparPorSetor(setores, equipes, 'aguia').map(g => [g.setor?.id, g.equipes.map(e => e.id)]))
      .toEqual([['s1', ['e2']]]);
    expect(agruparPorSetor(setores, equipes, 'play 1')[0].equipes).toHaveLength(2);
    expect(agruparPorSetor(setores, equipes, 'nada')).toEqual([]);
  });

  it('resume em palavras', () => {
    expect(resumoDeQuemOuve(TODOS, setores, equipes)).toBe('Todos os setores e equipes');
    expect(resumoDeQuemOuve(NINGUEM, setores, equipes)).toBe('Ninguém escolhido');
    expect(resumoDeQuemOuve({ todos: false, setores: ['s1', 's2'], equipes: ['e4'] }, setores, equipes))
      .toBe('Play 1, Play 2 e equipe Avulsa');
  });
});

describe('horário novo', () => {
  it('vem sem hora, sem dias e sem ninguém, e o salvar diz o que falta', () => {
    expect(faltaNoHorario(HORARIO_NOVO)).toEqual(['a hora', 'os dias', 'para quem toca']);
    expect(juntar(faltaNoHorario(HORARIO_NOVO))).toBe('a hora, os dias e para quem toca');
    expect(faltaNoHorario({ hora: '09:30', dias: [1], alvo: TODOS })).toEqual([]);
  });
});
