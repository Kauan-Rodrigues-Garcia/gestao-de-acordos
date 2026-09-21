/**
 * PaineisComercial.test.tsx — os dois painéis no desenho da BookPlay (16/09/2026).
 *
 * O pedido foi de ESTÉTICA e de MODELO DE INFORMAÇÃO, e as duas coisas regridem
 * sem erro nenhum: basta alguém trazer de volta um bloco chapado, ou somar a
 * automação entre as pessoas. Os testes prendem o que a troca decidiu:
 *
 * Painel Líder
 *   1. as abas da cobrança — Desempenho Equipes, Pessoas, Gráfico — e Desafios,
 *      que deixou de ser item de menu, só com a chave;
 *   2. um card de setor e um por equipe, na unidade da régua da meta;
 *   3. a fila de assinatura no alto da aba Pessoas, e o robô fora da disputa.
 *
 * Painel Diretoria
 *   4. Visão geral, Setores e equipes e Por pessoa;
 *   5. a comparação é no mesmo corte do mês anterior;
 *   6. a automação soma no faturamento e fica fora do ranking.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Venda } from '@/services/vendas/vendas.service';
import type { PessoaComAusencia } from '@/services/vendas/placar.service';

/* ── Dublês ───────────────────────────────────────────────────────────────── */

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({
    empresa: { id: 'e-comercial', nome: 'COMERCIAL', tenant_slug: 'comercial' },
    loading: false, tenantSlug: 'comercial',
  }),
}));

const temPermissao = vi.fn((_chave: string) => true);
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao, permissoes: {}, loading: false }),
}));

/*
 * O perfil de quem olha. Entrou em 21/09/2026, com o filtro de setor do Painel
 * Líder: `resolverEscopoPainel` pergunta o setor da pessoa para travar quem não
 * pode escolher. Aqui `setor_id: null` é a cúpula — quem enxerga tudo —, que é
 * o ponto de vista dos testes destes painéis.
 */
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    perfil: { id: 'quem-olha', nome: 'Quem Olha', perfil: 'diretoria', setor_id: null },
    loading: false,
  }),
}));

vi.mock('@/providers/MesProvider', () => ({
  useMesGlobal: () => ({ mes: '2026-09', setMes: vi.fn() }),
}));

vi.mock('@/hooks/useChartColors', () => ({
  useAxisColors: () => ({ tickColor: '#888', gridColor: '#ccc' }),
  useChartColors: () => ({}),
}));

/*
 * Datas no começo do mês: o corte da Diretoria nasce no dia de hoje, e uma
 * venda do dia 25 sumiria do teste rodado antes do dia 25.
 */
function venda(p: Partial<Venda> & { id: string; operador_id: string }): Venda {
  return {
    empresa_id: 'e-comercial', setor_id: 's1', equipe_id: null,
    nr_documento: p.id, cliente: null, uf: 'SP',
    valor_total: 1_000, valor_entrada: null, valor_recebido: 0,
    forma_pagamento: 'PIX',
    data_venda: '2026-09-01', data_confirmacao: '2026-09-01',
    situacao: 'confirmada', contrato_assinado: true,
    motivo: null, origem: 'geral', confirmado_por: null, confirmado_em: null,
    criado_em: '2026-09-01', atualizado_em: '2026-09-01',
    conta_na_meta: true, valor_na_meta: p.valor_total ?? 1_000,
    ...p,
  } as Venda;
}

const VENDAS: Venda[] = [
  venda({ id: 'v1', operador_id: 'ana',  valor_total: 50_000 }),
  venda({ id: 'v2', operador_id: 'bea',  valor_total: 30_000 }),
  venda({ id: 'v3', operador_id: 'caio', valor_total: 20_000 }),
  venda({ id: 'v4', operador_id: 'robo', valor_total: 90_000 }),
  // Confirmada e não assinada: é a fila do líder.
  venda({ id: 'v5', operador_id: 'bea', valor_total: 7_000, contrato_assinado: false, conta_na_meta: false, valor_na_meta: 0 }),
];

const ANTERIORES: Venda[] = [
  venda({ id: 'a1', operador_id: 'ana', valor_total: 40_000, data_venda: '2026-08-01', data_confirmacao: '2026-08-01' }),
];

const pessoa = (id: string, equipe: 'pec2' | 'pec5' | null, extra: Partial<PessoaComAusencia> = {}) => ({
  id, nome: id.toUpperCase(), robo: false, foto_url: null, cargo: 'operador',
  equipe_id: equipe, equipe_nome: equipe === 'pec2' ? 'PEC 2' : equipe === 'pec5' ? 'PEC 5' : null,
  setor_id: 's1', setor_nome: 'Vendas Bookplay',
  situacao: 'ativo', diasAbatidos: 0, diasUteisDoMes: 22,
  ...extra,
} as PessoaComAusencia);

const PESSOAS: PessoaComAusencia[] = [
  pessoa('ana', 'pec2'),
  pessoa('bea', 'pec2'),
  pessoa('caio', 'pec5'),
  pessoa('duda', 'pec5', { diasAbatidos: 3 }),
  pessoa('robo', null, { nome: 'IA ALFA', robo: true }),
];

vi.mock('@/hooks/useVendas', async () => {
  const { resumirVendas } = await import('@/lib/vendas');
  return {
    useVendas: () => ({
      vendas: VENDAS, resumo: resumirVendas(VENDAS), pendentes: [],
      carregando: false, disponivel: true, erro: null,
      recarregar: vi.fn(), salvar: vi.fn(), confirmar: vi.fn(), excluir: vi.fn(),
    }),
  };
});

vi.mock('@/hooks/useVendasPlacar', async () => {
  const { indexarPessoas } = await import('@/lib/vendasPlacar');
  return {
    useVendasPlacar: () => ({
      pessoas: PESSOAS, indice: indexarPessoas(PESSOAS),
      presencaPorRecorte: new Map(), diasUteisDoMes: 22,
      carregando: false, disponivel: true, erro: null, recarregar: vi.fn(),
    }),
  };
});

const metasDoMes = vi.fn(async () => ({ dado: [] as unknown[], erro: null, ok: true }));
vi.mock('@/services/vendas/metasVendas.service', () => ({
  buscarMetasDoMes: (...a: unknown[]) => metasDoMes(...(a as [])),
}));

vi.mock('@/services/vendas/vendas.service', () => ({
  buscarVendas: async () => ({ vendas: ANTERIORES, disponivel: true, erro: null }),
}));

// Os líderes das equipes: a leitura existe, e o painel sobrevive a ela vazia.
vi.mock('@/lib/supabase', () => {
  const construtor = () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.then = (ok: (r: { data: unknown[]; error: null }) => unknown) => Promise.resolve(ok({ data: [], error: null }));
    return b;
  };
  return { supabase: { from: construtor } };
});

vi.mock('recharts', () => {
  const stub = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  return {
    ResponsiveContainer: stub, PieChart: stub, Pie: stub, Cell: stub,
    Tooltip: stub, ComposedChart: stub, Bar: stub, Line: stub, Area: stub,
    XAxis: stub, YAxis: stub, CartesianGrid: stub, ReferenceLine: stub,
  };
});

vi.mock('framer-motion', () => {
  const componente = (props: Record<string, unknown>) => {
    const { children, initial: _i, animate: _a, exit: _e, transition: _t,
      variants: _v, whileHover: _w, ...rest } = props ?? {};
    return React.createElement('div', rest as React.HTMLAttributes<HTMLDivElement>, children as React.ReactNode);
  };
  return {
    motion: new Proxy({}, { get: () => componente }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

import PainelLiderComercial from '../PainelLiderComercial';
import PainelDiretoriaComercial from '../PainelDiretoriaComercial';

/**
 * `busca` é a query string da rota — as abas vivem em `?tab=`, e servir uma
 * aba pela URL é justamente o caminho que a permissão tem de barrar.
 */
function montar(Tela: React.ComponentType, busca = '') {
  return render(React.createElement(
    MemoryRouter,
    { initialEntries: [`/vendas/painel-diretoria${busca}`] },
    React.createElement(Tela),
  ));
}

const aba = (nome: RegExp) => screen.getByRole('button', { name: nome });

beforeEach(() => {
  temPermissao.mockImplementation(() => true);
  metasDoMes.mockResolvedValue({ dado: [], erro: null, ok: true });
});

/* ── Painel Líder ─────────────────────────────────────────────────────────── */

describe('PainelLiderComercial — o desenho da BookPlay', () => {
  it('abre com as abas da cobrança, e Desafios só com a chave', () => {
    montar(PainelLiderComercial);
    expect(screen.getByText('Painel do Líder')).toBeInTheDocument();
    expect(aba(/Desempenho Equipes/)).toBeInTheDocument();
    expect(aba(/^Pessoas$/)).toBeInTheDocument();
    expect(aba(/Gráfico de vendas/)).toBeInTheDocument();
    expect(aba(/Desafios/)).toBeInTheDocument();
  });

  it('sem `analitico_sub_desafios`, a aba Desafios não existe', () => {
    temPermissao.mockImplementation((chave: string) => chave !== 'analitico_sub_desafios');
    montar(PainelLiderComercial);
    expect(screen.queryByRole('button', { name: /Desafios/ })).not.toBeInTheDocument();
  });

  it('um card do setor e um por equipe, com o acumulado da régua', () => {
    montar(PainelLiderComercial);
    // O nome do setor aparece duas vezes: no card e no recorte travado.
    expect(screen.getAllByText('Vendas Bookplay').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PEC 2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PEC 5').length).toBeGreaterThan(0);
    // Setor: 50+30+20+90 mil = 190 mil — o robô soma. PEC 2: 80 mil.
    expect(screen.getAllByText(/R\$\s?190\.000,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s?80\.000,00/).length).toBeGreaterThan(0);
    // O que nenhuma equipe conta é dito, para a soma fechar com o setor.
    expect(screen.getByText(/somam só no card do setor/)).toBeInTheDocument();
  });

  it('com meta em quantidade, o card escreve vendas e não reais', async () => {
    metasDoMes.mockResolvedValue({
      ok: true, erro: null,
      dado: [{
        tipo: 'setor', referencia_id: 's1', nome: 'Vendas Bookplay', setor_id: 's1',
        setor_nome: 'Vendas Bookplay', regua: 'quantidade', quantidade: 10, valor: 0,
      }],
    });
    montar(PainelLiderComercial);
    // Setor: 4 vendas na régua, meta de 10.
    await waitFor(() => expect(screen.getAllByText('4 vendas').length).toBeGreaterThan(0));
    expect(screen.getAllByText(/meta 10 vendas/).length).toBeGreaterThan(0);
  });

  it('a aba Pessoas põe a fila de assinatura no alto e o robô fora da disputa', () => {
    montar(PainelLiderComercial);
    fireEvent.click(aba(/^Pessoas$/));
    expect(screen.getByText(/1 pessoa com venda esperando assinatura/)).toBeInTheDocument();
    // Quem não vendeu aparece — a lista vem do cadastro.
    expect(screen.getAllByText('DUDA').length).toBeGreaterThan(0);
    expect(screen.getByText(/Automação — soma no setor, fora da disputa/)).toBeInTheDocument();
  });
});

/* ── Painel Diretoria ─────────────────────────────────────────────────────── */

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * O que entrou em 21/09/2026
 *
 * Painel Líder ganhou a aba QUARTIS ao lado de Desempenho Equipes, e o filtro
 * de SETOR deixou de ser `podeFiltrarSetor: false` escrito no código.
 *
 * Painel Diretoria virou o hub do Comercial: as telas de procedência e de
 * entrada — relatório, conferência, vínculo, pessoas, histórico, fonte,
 * importação e fechamento — moram nele, cada uma pedindo a chave que o item de
 * menu pedia. É a parte mais fácil de desfazer sem querer: basta alguém
 * esquecer de somar uma chave à lista e a aba some para quem devia vê-la.
 * ─────────────────────────────────────────────────────────────────────────────
 */

describe('PainelLiderComercial — a reforma de 21/09/2026', () => {
  it('Quartis fica entre Desempenho Equipes e Pessoas', () => {
    montar(PainelLiderComercial);
    const nomes = screen.getAllByRole('button')
      .map(b => b.textContent ?? '')
      .filter(t => /Desempenho Equipes|Quartis|Pessoas|Gráfico de vendas/.test(t));
    expect(nomes.findIndex(t => t.includes('Quartis')))
      .toBeGreaterThan(nomes.findIndex(t => t.includes('Desempenho Equipes')));
    expect(nomes.findIndex(t => t.includes('Pessoas')))
      .toBeGreaterThan(nomes.findIndex(t => t.includes('Quartis')));
  });

  it('sem `painel_lider_sub_quartis`, a aba não existe — a chave é a da cobrança', () => {
    temPermissao.mockImplementation((chave: string) => chave !== 'painel_lider_sub_quartis');
    montar(PainelLiderComercial);
    expect(screen.queryByRole('button', { name: /^Quartis$/ })).not.toBeInTheDocument();
  });

  it('a aba Quartis diz de onde saiu a parte de cada um na meta', () => {
    montar(PainelLiderComercial);
    fireEvent.click(aba(/Quartis/));
    expect(screen.getByText(/parte de cada um na meta do time/)).toBeInTheDocument();
    // Sem meta configurada ninguém tem quartil, e a tela diz isso em vez de
    // medir contra zero.
    expect(screen.getByText(/fora do quartil/)).toBeInTheDocument();
  });

  it('o filtro de setor existe — não é mais `podeFiltrarSetor: false`', () => {
    montar(PainelLiderComercial);
    // Quem enxerga todos os setores escolhe entre eles; antes esta tela dizia
    // `podeFiltrarSetor: false` no código e o seletor nem era desenhado.
    expect(screen.getAllByRole('button', { name: /Todos os setores/ }).length)
      .toBeGreaterThan(0);
  });
});

describe('PainelDiretoriaComercial — o hub do Comercial (21/09/2026)', () => {
  const ABAS_DA_PROCEDENCIA = [
    /Relatório do mês/, /Geral × prévia/, /Setores a vincular/,
    /Pessoas do relatório/, /Histórico de importações/, /Fonte dos dados/,
  ];

  it('as abas de procedência e de entrada moram no painel', () => {
    montar(PainelDiretoriaComercial);
    for (const nome of [...ABAS_DA_PROCEDENCIA, /Importar relatório/, /Fechamento do setor/]) {
      expect(screen.getByRole('button', { name: nome })).toBeInTheDocument();
    }
  });

  it('sem `ver_importacoes_vendas`, a procedência inteira some', () => {
    temPermissao.mockImplementation((chave: string) => chave !== 'ver_importacoes_vendas');
    montar(PainelDiretoriaComercial);
    for (const nome of ABAS_DA_PROCEDENCIA) {
      expect(screen.queryByRole('button', { name: nome })).not.toBeInTheDocument();
    }
    // O resultado continua: tirar a chave da importação não fecha o painel.
    expect(screen.getByRole('button', { name: /Visão geral/ })).toBeInTheDocument();
  });

  it('sem `importar_vendas`, a entrada some e o resto fica', () => {
    temPermissao.mockImplementation((chave: string) => chave !== 'importar_vendas');
    montar(PainelDiretoriaComercial);
    expect(screen.queryByRole('button', { name: /Importar relatório/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Relatório do mês/ })).toBeInTheDocument();
  });

  it('uma aba servida pela URL sem a chave cai na primeira — esconder o botão não é permissão', () => {
    temPermissao.mockImplementation((chave: string) => chave !== 'importar_vendas');
    montar(PainelDiretoriaComercial, '?tab=importar');
    expect(screen.getByText('Onde o resultado acontece')).toBeInTheDocument();
  });
});

describe('PainelDiretoriaComercial — o desenho da BookPlay', () => {
  it('abre na Visão geral, com as três abas da diretoria', async () => {
    montar(PainelDiretoriaComercial);
    expect(screen.getByText('Painel Diretoria')).toBeInTheDocument();
    expect(aba(/Visão geral/)).toBeInTheDocument();
    expect(aba(/Setores e equipes/)).toBeInTheDocument();
    expect(aba(/Por pessoa/)).toBeInTheDocument();
    expect(screen.getByText('Faturamento no período')).toBeInTheDocument();
    expect(screen.getAllByText(/R\$\s?190\.000,00/).length).toBeGreaterThan(0);
  });

  it('compara com o mesmo trecho do mês anterior', async () => {
    montar(PainelDiretoriaComercial);
    // 190 mil contra 40 mil no mesmo corte.
    await waitFor(() => expect(screen.getByText('Acima do mês anterior.')).toBeInTheDocument());
    expect(screen.getByText(/R\$\s?150\.000,00 acima/)).toBeInTheDocument();
  });

  it('a automação é dita em voz alta: soma no total, fora do ranking', () => {
    montar(PainelDiretoriaComercial);
    expect(screen.getByText('Automação no período')).toBeInTheDocument();
    fireEvent.click(aba(/Por pessoa/));
    expect(screen.getByText(/Automação — soma no total, fora da disputa/)).toBeInTheDocument();
    expect(screen.getByText('IA ALFA')).toBeInTheDocument();
  });

  /*
   * Dois degraus desde 21/09/2026: o primeiro nível tem só SETORES, e as
   * equipes aparecem dentro do setor aberto. Antes os dois vinham na mesma
   * grade, com participações medidas contra bases diferentes e nada dizendo
   * isso. O teste prende a escada inteira — descer, descer de novo, e voltar
   * um degrau por vez.
   */
  it('Setores e equipes desce do setor para a equipe e volta um degrau por vez', () => {
    montar(PainelDiretoriaComercial);
    fireEvent.click(aba(/Setores e equipes/));

    // Primeiro nível: o setor existe, a equipe não.
    expect(screen.queryByRole('button', { name: /PEC 2/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Vendas Bookplay/ }));
    expect(screen.getByText('As pessoas de Vendas Bookplay')).toBeInTheDocument();
    expect(screen.getByText('As equipes de Vendas Bookplay')).toBeInTheDocument();

    // Segundo nível: a equipe, de dentro do setor.
    fireEvent.click(screen.getByRole('button', { name: /PEC 2/ }));
    expect(screen.getByText('As pessoas de PEC 2')).toBeInTheDocument();

    // Voltar sobe UM degrau — para o setor, não para o começo.
    fireEvent.click(screen.getByRole('button', { name: /Voltar para o setor/ }));
    expect(screen.getByText('As pessoas de Vendas Bookplay')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Voltar para os setores/ }));
    expect(screen.queryByText('As pessoas de Vendas Bookplay')).not.toBeInTheDocument();
  });
});
