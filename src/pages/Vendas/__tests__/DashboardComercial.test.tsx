/**
 * DashboardComercial.test.tsx — o que a reescrita de 15/09/2026 prometeu.
 *
 * Não é só um smoke. A tela foi refeita porque Dashboard, Painel Líder e aba
 * Vendas mostravam a mesma coisa, e **a regressão desse defeito é invisível**:
 * quem trouxer o ranking inteiro de volta para cá vai achar que está somando
 * informação. Os testes abaixo prendem as três decisões que impedem isso:
 *
 *   1. o pódio mostra TRÊS nomes e manda o resto para o Painel Líder;
 *   2. sem meta configurada, o anel abre na régua e convida a configurar —
 *      em vez de desenhar 0% de R$ 0,00;
 *   3. a automação soma no total e fica fora do pódio.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Venda } from '@/services/vendas/vendas.service';
import type { PessoaComAusencia } from '@/services/vendas/placar.service';

/* ── Dublês ───────────────────────────────────────────────────────────────── */

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: { id: 'u1', nome: 'Cleber Souza' }, loading: false }),
}));

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({
    empresa: { id: 'e-comercial', nome: 'COMERCIAL', tenant_slug: 'comercial' },
    loading: false, tenantSlug: 'comercial',
  }),
}));

const temPermissao = vi.fn(() => true);
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao, permissoes: {}, loading: false }),
}));

vi.mock('@/providers/MesProvider', () => ({
  useMesGlobal: () => ({ mes: '2026-09', setMes: vi.fn() }),
}));

/*
 * O cenário é o setor Vendas Bookplay em miniatura: cinco pessoas com volumes
 * diferentes (para o pódio ter do que cortar) e um robô que fatura alto — se a
 * separação quebrar, ele aparece no primeiro degrau e o teste vê.
 */
function venda(p: Partial<Venda> & { id: string; operador_id: string }): Venda {
  return {
    empresa_id: 'e-comercial', setor_id: 's1', equipe_id: null,
    nr_documento: p.id, cliente: null, uf: 'SP',
    valor_total: 1_000, valor_entrada: null, valor_recebido: 0,
    forma_pagamento: 'PIX',
    data_venda: '2026-09-10', data_confirmacao: '2026-09-10',
    situacao: 'confirmada', contrato_assinado: true,
    motivo: null, origem: 'geral', confirmado_por: null, confirmado_em: null,
    criado_em: '2026-09-10', atualizado_em: '2026-09-10',
    conta_na_meta: true, valor_na_meta: p.valor_total ?? 1_000,
    ...p,
  } as Venda;
}

const VENDAS: Venda[] = [
  venda({ id: 'v1', operador_id: 'ana',  valor_total: 50_000 }),
  venda({ id: 'v2', operador_id: 'bea',  valor_total: 40_000 }),
  venda({ id: 'v3', operador_id: 'caio', valor_total: 30_000 }),
  venda({ id: 'v4', operador_id: 'duda', valor_total: 20_000 }),
  venda({ id: 'v5', operador_id: 'eva',  valor_total: 10_000 }),
  venda({ id: 'v6', operador_id: 'robo', valor_total: 90_000 }),
  // Fora da régua, para o anel «Onde as vendas pararam» ter mais de uma fatia.
  venda({ id: 'v7', operador_id: 'ana', valor_total: 7_000, contrato_assinado: false, conta_na_meta: false, valor_na_meta: 0 }),
];

const PESSOAS: PessoaComAusencia[] = [
  'ana', 'bea', 'caio', 'duda', 'eva',
].map(id => ({
  id, nome: id.toUpperCase(), robo: false,
  equipe_id: 'pec2', equipe_nome: 'PEC 2', setor_id: 's1', setor_nome: 'Vendas Bookplay',
  situacao: 'ativo', diasAbatidos: 0, diasUteisDoMes: 22,
} as PessoaComAusencia)).concat([{
  id: 'robo', nome: 'IA ALFA', robo: true,
  equipe_id: null, equipe_nome: null, setor_id: 's1', setor_nome: 'Vendas Bookplay',
  situacao: 'ativo', diasAbatidos: 0, diasUteisDoMes: 22,
} as PessoaComAusencia]);

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

// Sem mês anterior — é o estado real do Comercial (agosto não importado), e o
// que faz as setas de variação não aparecerem.
vi.mock('@/hooks/useVendasMesAnterior', async () => {
  const { resumirVendas } = await import('@/lib/vendas');
  return {
    useVendasMesAnterior: () => ({
      mes: '2026-08', resumo: resumirVendas([]), temBase: false, carregando: false,
    }),
  };
});

const metasDoMes = vi.fn(async () => ({ dado: [] as unknown[], erro: null }));
vi.mock('@/services/vendas/metasVendas.service', () => ({
  buscarMetasDoMes: (...a: unknown[]) => metasDoMes(...(a as [])),
}));

/*
 * O recharts mede o container, e no ambiente de teste ele mede 0×0: o gráfico
 * não desenha e o teste ficaria esperando um SVG que nunca vem. O que interessa
 * aqui é a moldura — título, legenda e rodapé —, que é HTML de verdade.
 *
 * As peças são LISTADAS, e não servidas por um `Proxy` que responde a qualquer
 * nome. O Proxy responde também a `then`, e um módulo com `then` é um
 * thenable: o `await import()` do vitest fica esperando para sempre e a suíte
 * trava sem mensagem nenhuma. Aconteceu na primeira versão deste arquivo.
 */
vi.mock('recharts', () => {
  const stub = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  return {
    ResponsiveContainer: stub, PieChart: stub, Pie: stub, Cell: stub,
    Tooltip: stub, ComposedChart: stub, Bar: stub, Line: stub,
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

import DashboardComercial from '../DashboardComercial';

function montar() {
  return render(
    React.createElement(MemoryRouter, null, React.createElement(DashboardComercial)),
  );
}

beforeEach(() => {
  temPermissao.mockReturnValue(true);
  metasDoMes.mockResolvedValue({ dado: [], erro: null });
});

describe('DashboardComercial', () => {
  it('monta e se apresenta com o nome de quem entrou', () => {
    montar();
    expect(screen.getByText(/Cleber/)).toBeInTheDocument();
    expect(screen.getByText('COMERCIAL')).toBeInTheDocument();
  });

  it('mostra o faturamento da régua, e não o total bruto', () => {
    montar();
    // 50+40+30+20+10+90 mil = 240 mil. A de 7 mil sem assinatura fica fora.
    expect(screen.getAllByText(/R\$\s?240\.000,00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/R\$\s?247\.000,00/)).not.toBeInTheDocument();
  });

  /*
   * A regressão que este arquivo existe para impedir. O Dashboard antigo
   * listava doze pessoas — a lista do Painel Líder, cortada e sem as ações.
   */
  it('o pódio mostra três nomes e manda o resto para o Painel Líder', () => {
    montar();

    // ANA aparece duas vezes de propósito: no primeiro degrau e na linha do
    // destaque do dia, que é a mesma pergunta recortada em um dia.
    expect(screen.getAllByText('ANA').length).toBeGreaterThan(0);
    expect(screen.getByText('BEA')).toBeInTheDocument();
    expect(screen.getByText('CAIO')).toBeInTheDocument();
    // O quarto e o quinto NÃO estão aqui: é o que separa um pódio de um ranking.
    expect(screen.queryByText('DUDA')).not.toBeInTheDocument();
    expect(screen.queryByText('EVA')).not.toBeInTheDocument();
    expect(screen.getByText(/ver todos \(5\)/)).toBeInTheDocument();
  });

  it('sem a chave do Painel Líder, o «ver todos» não vira link para porta fechada', () => {
    temPermissao.mockImplementation((chave: string) => chave !== 'ver_painel_lider');
    montar();
    expect(screen.queryByText(/ver todos/)).not.toBeInTheDocument();
  });

  it('a automação soma no total e fica fora do pódio', () => {
    montar();
    expect(screen.queryByText('IA ALFA')).not.toBeInTheDocument();
    // 90 de 240 mil é 38% do mês — a faixa diz isso sem disputar o pódio.
    expect(screen.getByText(/38% do faturamento do mês/)).toBeInTheDocument();
  });

  it('sem meta configurada, convida a configurar em vez de mostrar 0%', () => {
    montar();
    expect(screen.getByText('Onde as vendas pararam')).toBeInTheDocument();
    expect(screen.getByText(/Sem meta configurada neste mês/)).toBeInTheDocument();
    expect(screen.getByText('Configurar agora')).toBeInTheDocument();
    expect(screen.queryByText('Progresso da meta')).not.toBeInTheDocument();
  });

  it('o ticket médio existe aqui, e é a conta que nenhuma outra aba faz', () => {
    montar();
    expect(screen.getByText('Ticket médio')).toBeInTheDocument();
    // 240.000 / 6 vendas na régua = 40.000
    expect(screen.getAllByText(/R\$\s?40\.000,00/).length).toBeGreaterThan(0);
  });
});
