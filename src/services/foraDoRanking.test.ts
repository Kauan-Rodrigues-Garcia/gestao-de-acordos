/**
 * Quem fica fora do ranking (06/10/2026): férias e cargo de liderança. O
 * recebimento do líder conta na equipe e no setor; só o ranking não o mostra.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctl = vi.hoisted(() => ({
  perfis: [] as { id: string; situacao: string | null; perfil: string | null }[],
  retrato: [] as { operador_id: string; situacao: string | null; cargo: string | null }[],
}));

function consulta<T>(dados: () => T[]) {
  const q = {
    select: () => q,
    eq: () => q,
    then: (ok: (r: { data: T[]; error: null }) => unknown) => Promise.resolve({ data: dados(), error: null }).then(ok),
  };
  return q;
}

vi.mock('@/lib/supabase', () => ({ supabase: { from: () => consulta(() => ctl.perfis) } }));
vi.mock('@/lib/supabaseSemTipo', () => ({
  tabelaSemTipo: () => consulta(() => ctl.retrato),
  rpcSemTipo: vi.fn(),
}));
vi.mock('@/lib/mesReferencia', () => ({ ehMesAtual: (mes: string) => mes === '2026-10' }));
vi.mock('@/services/analitico/composicaoCache', () => ({ invalidarComposicaoEquipes: vi.fn() }));

const { buscarForaDoRanking, cargoForaDoRanking } = await import('./situacaoUsuario.service');

describe('cargoForaDoRanking', () => {
  it('líder, gerência e afins saem; operador e elite ficam', () => {
    for (const c of ['lider', 'gerencia', 'diretoria', 'ouvidoria', 'administrador']) {
      expect(cargoForaDoRanking(c)).toBe(true);
    }
    expect(cargoForaDoRanking('operador')).toBe(false);
    expect(cargoForaDoRanking('elite')).toBe(false);
  });

  it('cargo desconhecido não some ninguém', () => {
    expect(cargoForaDoRanking(null)).toBe(false);
    expect(cargoForaDoRanking(undefined)).toBe(false);
  });
});

describe('buscarForaDoRanking', () => {
  beforeEach(() => {
    ctl.perfis = [
      { id: 'op', situacao: 'ativo', perfil: 'operador' },
      { id: 'elite', situacao: 'ativo', perfil: 'elite' },
      { id: 'lider', situacao: 'ativo', perfil: 'lider' },
      { id: 'ferias', situacao: 'ferias', perfil: 'operador' },
    ];
    ctl.retrato = [];
  });

  it('mês corrente: férias e líder pelo cadastro', async () => {
    expect([...await buscarForaDoRanking('emp', '2026-10')].sort()).toEqual(['ferias', 'lider']);
  });

  it('mês fechado: o cargo do retrato manda, não o de hoje', async () => {
    // Em setembro era operador; virou líder em outubro — setembro não muda.
    ctl.retrato = [
      { operador_id: 'lider', situacao: 'ativo', cargo: 'operador' },
      { operador_id: 'op', situacao: 'ativo', cargo: 'lider' },
    ];
    expect([...await buscarForaDoRanking('emp', '2026-09')]).toEqual(['op']);
  });
});
