import { describe, expect, it } from 'vitest';
import { gerarPrevia, painelDaPrevia } from './previa';

const eu = { id: 'eu', nome: 'Você' };

describe('prévia da aba do Jornada', () => {
  it('é sempre a mesma, com o super_admin zerado hoje', () => {
    const a = gerarPrevia('acesso', '2026-11-04', eu);
    const b = gerarPrevia('acesso', '2026-11-04', eu);
    expect(a.registros.length).toBe(b.registros.length);
    expect(a.registros.some(r => r.perfil_id === 'eu' && r.data === '2026-11-04')).toBe(false);
    expect(a.registros.some(r => r.data === '2026-11-01')).toBe(false); // domingo
  });

  it('o painel conta dia e mês por pessoa', () => {
    const estado = gerarPrevia('retencao', '2026-11-04', eu);
    const painel = painelDaPrevia(estado, 'retencao', '2026-11-03');
    const total = painel.pessoas.reduce((s, p) => s + p.no_dia, 0);
    expect(painel.registros).toHaveLength(total);
    expect(painel.dias.find(d => d.dia === '2026-11-03')?.total).toBe(total);
    expect(painel.meta).toBe(30);
    expect(painel.sou_membro && painel.pode_gerir).toBe(true);
  });

  it('a meta individual vale só para a pessoa; o resto segue a do grupo', () => {
    const estado = gerarPrevia('acesso', '2026-11-04', eu);
    const painel = painelDaPrevia({ ...estado, meta: 100, metasPessoa: { 'previa-1': 150 } }, 'acesso', '2026-11-04');
    const bruno = painel.pessoas.find(p => p.id === 'previa-1')!;
    const ana = painel.pessoas.find(p => p.id === 'previa-0')!;
    expect([bruno.meta, bruno.meta_propria]).toEqual([150, true]);
    expect([ana.meta, ana.meta_propria]).toEqual([100, false]);
  });
});
