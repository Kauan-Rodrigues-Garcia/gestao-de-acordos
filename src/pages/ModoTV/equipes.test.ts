/**
 * Modo TV, 06/11/2026: a cena «Ranking de equipes» e o estilo «Natal» do Destaque.
 */
import { describe, expect, it } from 'vitest';
import { AGUARDANDO_ATUALIZACAO, MAX_EQUIPES_NA_TELA, equipesDaTela, montarVisao } from './numeros';
import { opcao, templateDe } from './templates';
import { numerosDemo } from './demo';
import type { NumerosTv, TelaDoPainel } from './tipos';

const tela = (opcoes: Record<string, unknown> = {}): Pick<TelaDoPainel, 'template' | 'opcoes'> => ({ template: 'equipes', opcoes });
const visao = (parcial: Partial<NumerosTv> = {}) => montarVisao({ ...numerosDemo(), ...parcial }, 'bruto');

// As equipes da demonstração (demo.ts).
const ROSA = '00000000-0000-4000-8000-000000000001';
const AZUL = '00000000-0000-4000-8000-000000000002';
const VERDE = '00000000-0000-4000-8000-000000000003';
const LARANJA = '00000000-0000-4000-8000-000000000004';

describe('equipesDaTela', () => {
  it('padrão: todas as equipes, pelo recebido, com o nome «Equipe X» e o 1º de cada uma', () => {
    const r = equipesDaTela(visao(), tela());
    expect(r.motivo).toBe('');
    expect(r.itens.map(e => e.nome)).toEqual(['Equipe Rosa', 'Equipe Azul', 'Equipe Verde', 'Equipe Laranja']);
    expect(r.itens[0].primeiro?.nome).toBe('Ana Beatriz Lima');
    expect(r.itens[0].fracao).toBeCloseTo(128_400.55 / 150_000, 6);
    // Laranja não tem meta.
    expect(r.itens[3]).toMatchObject({ meta: null, fracao: null });
  });

  it('pelo % da meta: quem bateu na frente, sem meta no fim', () => {
    const r = equipesDaTela(visao(), tela({ ordem: 'meta' }));
    expect(r.porMeta).toBe(true);
    expect(r.itens.map(e => e.id)).toEqual([AZUL, ROSA, VERDE, LARANJA]);
  });

  it('só as equipes escolhidas', () => {
    const r = equipesDaTela(visao(), tela({ equipes: [LARANJA, VERDE] }));
    expect(r.itens.map(e => e.id)).toEqual([VERDE, LARANJA]);
  });

  it('a escolhida aparece mesmo zerada; em «Todas», a zerada some', () => {
    const n = numerosDemo();
    const zerada = { id: '00000000-0000-4000-8000-0000000000ff', nome: 'Nova', valor: 0, valor_ho: 0, meta: 0 };
    const v = visao({ equipes_ranking: [...(n.equipes_ranking ?? []), zerada] });
    expect(equipesDaTela(v, tela()).itens.some(e => e.id === zerada.id)).toBe(false);
    expect(equipesDaTela(v, tela({ equipes: [zerada.id, ROSA] })).itens.map(e => e.id)).toEqual([ROSA, zerada.id]);
  });

  it('equipe escolhida que saiu do setor: avisa em vez de mostrar tela vazia', () => {
    const r = equipesDaTela(visao(), tela({ equipes: ['00000000-0000-4000-8000-0000000000aa'] }));
    expect(r.itens).toEqual([]);
    expect(r.motivo).toMatch(/não estão mais no setor/);
  });

  it('projeção: recebido × dias úteis ÷ decorridos, o % é o da projeção e a ordem é por ele', () => {
    const r = equipesDaTela(visao(), tela({ ordem: 'projecao' }));
    const rosa = r.itens.find(e => e.id === ROSA)!;
    const esperado = Math.round(128_400.55 * 22 / 17 * 100) / 100;
    expect(rosa.valor).toBe(esperado);
    expect(rosa.fracao).toBeCloseTo(esperado / 150_000, 6);
    // Não a ordem do recebido (Rosa, Azul…): Azul está mais perto da meta.
    expect(r.porMeta).toBe(true);
    expect(r.itens.map(e => e.id)).toEqual([AZUL, ROSA, VERDE, LARANJA]);
  });

  it('pacote antigo, sem as equipes: avisa', () => {
    expect(equipesDaTela(visao({ equipes_ranking: undefined }), tela()).motivo).toBe(AGUARDANDO_ATUALIZACAO);
  });

  it(`no máximo ${MAX_EQUIPES_NA_TELA} na tela, e conta as que ficaram fora`, () => {
    const muitas = Array.from({ length: 10 }, (_, i) => ({
      id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`, nome: `E${i}`, valor: 1000 * (i + 1), valor_ho: 0, meta: 0,
    }));
    const r = equipesDaTela(visao({ equipes_ranking: muitas }), tela());
    expect(r.itens).toHaveLength(MAX_EQUIPES_NA_TELA);
    expect(r.fora).toBe(10 - MAX_EQUIPES_NA_TELA);
    expect(r.itens[0].nome).toBe('Equipe E9');
  });

  it('a lista de equipes do jsonb é saneada: só ids, sem repetir', () => {
    expect(opcao<string[]>(tela({ equipes: ['x', ROSA, ROSA, 3, null] }), 'equipes')).toEqual([ROSA]);
    expect(opcao<string[]>(tela({ equipes: 'todas' }), 'equipes')).toEqual([]);
  });
});

describe('estilo Natal do Destaque', () => {
  it('é uma escolha válida do campo «Estilo»', () => {
    const t = { template: 'destaque' as const, opcoes: { estilo: 'natal' } };
    expect(opcao<string>(t, 'estilo')).toBe('natal');
  });

  it('a vitrine tem a cena «Ranking de equipes» na categoria Ranking', () => {
    expect(templateDe('equipes')?.categoria).toBe('ranking');
  });
});
