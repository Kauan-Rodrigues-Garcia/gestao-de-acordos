import { describe, expect, it } from 'vitest';
import { compartilhadosNoMes, gerarPrevia, outrosNoMes, painelDaPrevia, type RegistroPrevia } from './previa';

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
    expect(painel.meta).toBe(150); // a meta da equipe inteira
    expect(painel.sou_membro && painel.pode_gerir).toBe(true);
  });

  it('a meta individual vale só para a pessoa; a do grupo é da equipe, não de cada um', () => {
    const estado = gerarPrevia('acesso', '2026-11-04', eu);
    const painel = painelDaPrevia({ ...estado, metas: [100, 130], metasPessoa: { 'previa-1': [150, 170, 190] } }, 'acesso', '2026-11-04');
    const bruno = painel.pessoas.find(p => p.id === 'previa-1')!;
    const ana = painel.pessoas.find(p => p.id === 'previa-0')!;
    expect([bruno.meta, bruno.meta_propria, bruno.metas]).toEqual([150, true, [150, 170, 190]]);
    expect([ana.meta, ana.meta_propria, ana.metas]).toEqual([null, false, []]);
    expect(painel.metas).toEqual([100, 130]);
  });
});

describe('o mesmo NR com pessoas diferentes (10/11/2026)', () => {
  const reg = (id: string, nr: string, perfil: string, nome: string, data: string): RegistroPrevia =>
    ({ id, nr, perfil_id: perfil, nome, data, criado_em: `${data}T12:00:00Z` });
  const lista = [
    reg('1', '777', 'cami', 'Camila', '2026-11-03'),
    reg('2', '777', 'leo', 'Léo', '2026-11-10'),
    reg('3', '777', 'leo', 'Léo', '2026-11-04'),     // o 1º dia do Léo é o que vale
    reg('4', '777', 'ana', 'Ana', '2026-10-30'),     // outro mês: não conta
    reg('5', '888', 'cami', 'Camila', '2026-11-05'), // só a Camila: não é compartilhado
  ];

  it('outros: quem mais tem o NR no mês, com o 1º dia de cada um', () => {
    expect(outrosNoMes(lista, lista[0])).toEqual([{ perfil_id: 'leo', nome: 'Léo', data: '2026-11-04' }]);
    expect(outrosNoMes(lista, lista[1])).toEqual([{ perfil_id: 'cami', nome: 'Camila', data: '2026-11-03' }]);
    expect(outrosNoMes(lista, lista[4])).toEqual([]);
  });

  it('compartilhados: só os NRs com 2+ pessoas no mês', () => {
    expect(compartilhadosNoMes(lista, '2026-11')).toEqual([{ nr: '777', pessoas: [
      { perfil_id: 'cami', nome: 'Camila', data: '2026-11-03' },
      { perfil_id: 'leo', nome: 'Léo', data: '2026-11-04' },
    ] }]);
  });

  it('a prévia já vem com clientes compartilhados, e o painel marca cada lançamento', () => {
    const estado = gerarPrevia('acesso', '2026-11-20', eu);
    const painel = painelDaPrevia(estado, 'acesso', '2026-11-20');
    expect(painel.compartilhados.length).toBeGreaterThan(0);
    const { nr, pessoas } = painel.compartilhados[0];
    const dia = pessoas[1].data;
    const doDia = painelDaPrevia(estado, 'acesso', dia).registros.find(r => r.nr === nr && r.perfil_id === pessoas[1].perfil_id);
    expect(doDia?.outros.map(o => o.perfil_id)).toContain(pessoas[0].perfil_id);
  });
});
