import { describe, expect, it } from 'vitest';
import type { Perfil } from '@/lib/supabase';
import { FILTROS_VAZIOS, infoDosSetores, listaEmCsv, passaNosFiltros, temPendencia, type ContextoPendencia } from './modelo';

const pessoa = (o: Partial<Perfil> & Record<string, unknown>): Perfil => ({
  id: 'p', nome: 'Ana', email: 'ana@x', perfil: 'operador', setor_id: 's-bir', situacao: 'ativo', ...o,
} as unknown as Perfil);

const ctx: ContextoPendencia = { temEquipe: u => u.id !== 'sem-eq', comMeta: new Set(['p']) };

describe('a marca é da cidade do setor; a regra é do setor', () => {
  const info = infoDosSetores(
    [{ id: 's-bir', cidade_id: 'c1', regra: 'nosso_produto' }, { id: 's-cp', cidade_id: 'c2', regra: 'cofen' }, { id: 's-0', cidade_id: null }],
    [{ id: 'c1', nome: 'Birigui' }, { id: 'c2', nome: 'Marília' }],
  );
  it('Birigui é BookPlay, Marília é PaguePlay, sem cidade não tem marca', () => {
    expect(info.get('s-bir')).toEqual({ marca: 'bp', regra: 'nosso_produto' });
    expect(info.get('s-cp')).toEqual({ marca: 'pp', regra: 'cofen' });
    expect(info.get('s-0')).toEqual({ marca: null, regra: null });
  });
});

describe('o que precisa de alguém', () => {
  it('sem setor: quem precisa de setor e não tem; a diretoria pertence à empresa', () => {
    expect(temPendencia(pessoa({ setor_id: null }), 'sem_setor', ctx)).toBe(true);
    expect(temPendencia(pessoa({ setor_id: null, perfil: 'diretoria' }), 'sem_setor', ctx)).toBe(false);
  });

  it('sem equipe e sem meta: só a operação ativa', () => {
    expect(temPendencia(pessoa({ id: 'sem-eq' }), 'sem_equipe', ctx)).toBe(true);
    expect(temPendencia(pessoa({ id: 'sem-eq', perfil: 'lider' }), 'sem_equipe', ctx)).toBe(false);
    expect(temPendencia(pessoa({ id: 'outro' }), 'sem_meta', ctx)).toBe(true);
    expect(temPendencia(pessoa({ id: 'outro', situacao: 'ferias' }), 'sem_meta', ctx)).toBe(false);
    expect(temPendencia(pessoa({}), 'sem_meta', ctx)).toBe(false);
  });

  it('senha provisória: quem ainda não trocou; login de IA nunca é pendência', () => {
    expect(temPendencia(pessoa({ senha_alterada: false }), 'senha', ctx)).toBe(true);
    expect(temPendencia(pessoa({ senha_alterada: true }), 'senha', ctx)).toBe(false);
    expect(temPendencia(pessoa({ senha_alterada: false, robo: true }), 'senha', ctx)).toBe(false);
  });
});

describe('os filtros', () => {
  const c = { ...ctx, marcaDe: (u: Perfil) => (u.setor_id === 's-bir' ? 'bp' as const : 'pp' as const), online: (id: string) => id === 'p' };
  it('marca, cargo, situação, online e pendência', () => {
    const u = pessoa({});
    expect(passaNosFiltros(u, FILTROS_VAZIOS, c)).toBe(true);
    expect(passaNosFiltros(u, { ...FILTROS_VAZIOS, marca: 'pp' }, c)).toBe(false);
    expect(passaNosFiltros(u, { ...FILTROS_VAZIOS, cargo: 'lider' }, c)).toBe(false);
    expect(passaNosFiltros(u, { ...FILTROS_VAZIOS, situacao: 'online' }, c)).toBe(true);
    expect(passaNosFiltros(pessoa({ id: 'x' }), { ...FILTROS_VAZIOS, situacao: 'online' }, c)).toBe(false);
    expect(passaNosFiltros(u, { ...FILTROS_VAZIOS, situacao: 'ferias' }, c)).toBe(false);
    expect(passaNosFiltros(pessoa({ id: 'outro' }), { ...FILTROS_VAZIOS, pendencia: 'sem_meta' }, c)).toBe(true);
  });
});

describe('exportar', () => {
  it('CSV com «;», BOM para o Excel e aspas onde precisa', () => {
    const csv = listaEmCsv([{ nome: 'Ana; Paula', login: 'ana', email: 'a@x', cargo: 'Operador', setor: 'Play 1', equipe: '', marca: 'BookPlay', situacao: 'Ativo' }]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    const linhas = csv.slice(1).split('\r\n');
    expect(linhas[0]).toBe('Nome;Login;E-mail;Cargo;Setor;Equipe;Marca;Situação');
    expect(linhas[1]).toBe('"Ana; Paula";ana;a@x;Operador;Play 1;;BookPlay;Ativo');
  });
});
