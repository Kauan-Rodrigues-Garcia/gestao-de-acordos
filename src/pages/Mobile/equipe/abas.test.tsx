/**
 * Tela da equipe: o que cada aba mostra e o que some.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QUARTIS_PADRAO } from '@/lib/diasUteis';
import { montarEquipe, type FontesEquipe } from './montarEquipe';
import { AbaQuartis } from './AbaQuartis';
import { AbaEquipe } from './AbaEquipe';
import { AbaHoje } from './AbaHoje';
import { AbaGrafico } from './AbaGrafico';
import { marcasDosQuartis } from './regua';
import type { ResumoOperadorAnalitico } from '@/services/analitico/analitico.service';

// Movimento reduzido: os números animados mostram o valor final na hora.
beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce'), media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const resumo = (id: string, total: number): ResumoOperadorAnalitico => ({
  operador_id: id, operador_usuario: id, operador_nome: id,
  total_recebido: total, total_ho: 0, total_pagamentos: 3,
});
const info = { equipe_id: 'eq1', equipe_nome: 'Equipe Bryan', setor_id: 's1' };
const op = (id: string, nome: string) => ({
  id, nome, foto_url: null, setor_id: 's1', equipe_id: 'eq1', situacao: 'ativo',
});

function fontes(parcial: Partial<FontesEquipe> = {}): FontesEquipe {
  return {
    // 18 de 22 dias úteis decorridos (contarHoje = true, hoje = 24/09).
    mes: '2026-09', hojeISO: '2026-09-24', emHO: false, ho: 0.25,
    equipes: [{ id: 'eq1', nome: 'Equipe Bryan', setor_id: 's1' }],
    operadorEquipeMap: { a: info, b: info, c: info, d: info },
    equipesExtrasPorOperador: {},
    resumos: [resumo('a', 22_000), resumo('b', 15_000), resumo('c', 5_000)],
    creditosDeOrigem: [],
    metasEquipe: { eq1: 60_000 },
    metasOperador: { a: 20_000, b: 20_000, c: 20_000 },
    metasIndiretas: {}, indiretoMap: {},
    feriados: [], contarHoje: true, quartis: QUARTIS_PADRAO, treinoMap: {},
    operadores: [op('a', 'ANA PAULA RIBEIRO'), op('b', 'BRUNO ALVES'), op('c', 'CARLA DIAS'), op('d', 'DIEGO SEM META')],
    setores: { s1: 'Receptivo' },
    ...parcial,
  };
}

describe('régua', () => {
  it('marcas são as faixas da aba Metas, sem a de 0%', () => {
    expect(marcasDosQuartis(QUARTIS_PADRAO)).toEqual([50, 80, 100]);
  });
});

describe('AbaQuartis', () => {
  const equipe = montarEquipe(fontes(), 'eq1')!;

  it('uma linha por operador com meta, melhor projeção primeiro', () => {
    render(<AbaQuartis equipe={equipe} mes="2026-09" />);
    const linhas = screen.getAllByRole('button', { name: /Ver detalhe/ });
    expect(linhas.map(l => l.textContent)).toEqual([
      expect.stringContaining('Ana R.'),
      expect.stringContaining('Bruno A.'),
      expect.stringContaining('Carla D.'),
    ]);
    expect(screen.getByText(/1 pessoa sem meta fica fora/)).toBeTruthy();
  });

  it('a faixa vira filtro, e tocar de novo volta a mostrar todos', () => {
    render(<AbaQuartis equipe={equipe} mes="2026-09" />);
    const q4 = screen.getByRole('button', { name: /4º quartil/ });
    fireEvent.click(q4);
    expect(screen.getAllByRole('button', { name: /Ver detalhe/ })).toHaveLength(1);
    fireEvent.click(q4);
    expect(screen.getAllByRole('button', { name: /Ver detalhe/ })).toHaveLength(3);
  });

  it('a folha abre fora da aba (no <body>), presa na tela, e fecha ao tocar fora', () => {
    const { container } = render(<AbaQuartis equipe={equipe} mes="2026-09" />);
    fireEvent.click(screen.getAllByRole('button', { name: /Ver detalhe/ })[0]);
    const folha = screen.getByRole('dialog');
    expect(container.contains(folha)).toBe(false);
    expect(document.body.style.position).toBe('fixed');
    fireEvent.click(document.querySelector('.e-veu')!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.position).toBe('');
  });

  it('o toque abre a folha com faixas, ritmo e o botão do WhatsApp', () => {
    render(<AbaQuartis equipe={equipe} mes="2026-09" />);
    fireEvent.click(screen.getAllByRole('button', { name: /Ver detalhe/ })[1]);
    const folha = screen.getByRole('dialog');
    expect(within(folha).getByText('BRUNO ALVES')).toBeTruthy();
    expect(within(folha).getByText('Fecha o mês em')).toBeTruthy();
    expect(within(folha).getByRole('table', { name: 'Quanto falta por faixa' })).toBeTruthy();
    expect(within(folha).getByRole('button', { name: /Mandar resumo no WhatsApp/ })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('sem ninguém com meta, explica em vez de mostrar lista vazia', () => {
    const vazia = montarEquipe(fontes({ metasOperador: {} }), 'eq1')!;
    render(<AbaQuartis equipe={vazia} mes="2026-09" />);
    expect(screen.getByText('Ninguém com meta nesta equipe')).toBeTruthy();
  });
});

describe('AbaEquipe', () => {
  it('com meta: régua, frase da projeção, ritmo e faixas', () => {
    const equipe = montarEquipe(fontes(), 'eq1')!;
    render(<AbaEquipe equipe={equipe} rodape={null} />);
    expect(screen.getByText(/esperado hoje/)).toBeTruthy();
    expect(screen.getByText(/No ritmo de hoje, o mês fecha em/)).toBeTruthy();
    expect(screen.getByText('Precisa por dia daqui pra frente')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Quanto falta por faixa' })).toBeTruthy();
  });

  it('sem meta: diz isso e não inventa ritmo', () => {
    const equipe = montarEquipe(fontes({ metasEquipe: {} }), 'eq1')!;
    render(<AbaEquipe equipe={equipe} rodape={null} />);
    expect(screen.getByText(/Sem meta configurada/)).toBeTruthy();
    expect(screen.queryByText('Ritmo')).toBeNull();
  });
});

describe('AbaHoje', () => {
  const equipe = montarEquipe(fontes(), 'eq1')!;
  const linha = (op: string, valor: number, data = '2026-09-24') => ({
    operador_id: op, setor_id: 's1', importado_por_id: null, valor_recebido: valor, data_pagamento: data,
  });

  it('soma só hoje e só a equipe; sem permissão, explica a lista vazia', () => {
    render(<AbaHoje
      conjunto={{ operadorIds: equipe.operadorIds, nomes: equipe.nomes,
        totalPessoas: equipe.detalhe.totalOperadores, rotulo: 'da equipe' }}
      hojeISO="2026-09-24"
      linhas={[linha('a', 300), linha('b', 200), linha('a', 999, '2026-09-23'), linha('x', 500)]}
      carregando={false} pagamentos={[]} carregandoPagamentos={false} isPaguePlay={false} />);
    expect(screen.getByText('500,00')).toBeTruthy();
    expect(screen.getByText(/2 de 4 operadores receberam/)).toBeTruthy();
    expect(screen.getByText(/aparecem para quem vê o analítico da equipe/)).toBeTruthy();
  });
});

describe('AbaGrafico', () => {
  const equipe = montarEquipe(fontes(), 'eq1')!;
  const linha = (op: string, valor: number, data: string) => ({
    operador_id: op, setor_id: 's1', importado_por_id: null, valor_recebido: valor, data_pagamento: data,
  });
  const linhas = [linha('a', 1_000, '2026-09-01'), linha('b', 3_000, '2026-09-02'), linha('a', 500, '2026-09-24')];

  it('mostra todos os dias do mês no eixo e lê o dia tocado no topo do cartão', () => {
    render(<AbaGrafico escopo={{ tipo: 'equipe', operadores: new Set(equipe.operadorIds) }} mes="2026-09" hojeISO="2026-09-24" linhas={linhas}
      carregando={false} erro={false} isPaguePlay={false} />);
    const svg = screen.getByRole('img', { name: 'Recebido por dia do mês' });
    const dias = [...svg.querySelectorAll('text')].map(t => t.textContent);
    expect(dias).toEqual(Array.from({ length: 30 }, (_, i) => String(i + 1)));
    // Abre em hoje, parcial.
    expect(screen.getByText(/Qui, 24 de setembro · hoje/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Qua, 2 de setembro/ }));
    expect(screen.getByText('Qua, 2 de setembro')).toBeTruthy();
    expect(screen.getByText(/acima da média/, { selector: '.e-graf-pill' })).toBeTruthy();
  });
});
