/**
 * VendasLista.test.tsx — a aba Vendas refeita em 21/09/2026.
 *
 * Prende o que a reforma decidiu e que regride sem erro nenhum:
 *
 *   1. cadastro de DOIS campos na própria lista, com Enter e valor lido do
 *      jeito que se digita — e o NR repetido barrado antes do banco;
 *   2. tabela com as colunas que ocupavam o espaço vazio: vendedor, valor e
 *      quanto vale NA META;
 *   3. o status que diz quem mexe agora («Aguardando relatório» × «Falta
 *      assinatura»);
 *   4. o líder decide na linha; o operador não vê o botão;
 *   5. o operador não vê a meta do setor inteiro medida só com as vendas dele.
 *
 * E o que entrou em 21/09/2026 (migration 20260921150000):
 *
 *   6. excluir é por linha — quem lançou exclui a própria; na meta, nem
 *      operador nem líder;
 *   7. a venda que o relatório não trouxe mostra o prazo, e a tela avisa;
 *   8. confete só na primeira venda da vida de quem lança.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Venda } from '@/services/vendas/vendas.service';
import type { PessoaComAusencia } from '@/services/vendas/placar.service';
import { getTodayISO } from '@/lib/index';

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({
    empresa: { id: 'e-comercial', nome: 'COMERCIAL', tenant_slug: 'comercial' },
    loading: false, tenantSlug: 'comercial',
  }),
}));

let perfilAtual: { id: string; nome: string; perfil?: string } = { id: 'ana', nome: 'Ana' };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: perfilAtual, loading: false }),
}));

const contarLancadas = vi.fn(async (..._a: unknown[]): Promise<number | null> => 1);
vi.mock('@/services/vendas/vendas.service', async (original) => ({
  ...(await original<typeof import('@/services/vendas/vendas.service')>()),
  contarVendasLancadasPor: (...a: unknown[]) => contarLancadas(...a),
}));

vi.mock('@/components/comemoracao/EfeitoComemoracao', () => ({
  EfeitoComemoracao: () => React.createElement('div', { 'data-testid': 'confete' }),
}));

const temPermissao = vi.fn((_chave: string) => true);
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({ temPermissao, permissoes: {}, loading: false }),
}));

vi.mock('@/providers/MesProvider', () => ({
  useMesGlobal: () => ({ mes: getTodayISO().slice(0, 7), setMes: vi.fn() }),
}));

const HOJE = getTodayISO();

function venda(p: Partial<Venda> & { id: string; operador_id: string }): Venda {
  return {
    empresa_id: 'e-comercial', setor_id: 's1', equipe_id: null,
    nr_documento: p.id, cliente: `Cliente ${p.id}`, uf: 'SP',
    valor_total: 1_000, valor_entrada: null, valor_recebido: 0,
    forma_pagamento: 'PIX',
    data_venda: HOJE, data_confirmacao: HOJE,
    situacao: 'confirmada', contrato_assinado: true,
    motivo: null, origem: 'geral', confirmado_por: null, confirmado_em: null,
    criado_em: HOJE, atualizado_em: HOJE,
    conta_na_meta: true, valor_na_meta: p.valor_total ?? 1_000,
    perfis: { id: p.operador_id, nome: p.operador_id.toUpperCase() },
    ...p,
  } as Venda;
}

const LANCADA = venda({
  id: '13073323', operador_id: 'ana', criado_por: 'ana', valor_total: 5_572, origem: 'manual',
  situacao: 'aberta', contrato_assinado: false, data_confirmacao: null,
  conta_na_meta: false, valor_na_meta: 0,
});
const SEM_ASSINATURA = venda({
  id: '13073400', operador_id: 'bea', valor_total: 3_000,
  contrato_assinado: false, conta_na_meta: false, valor_na_meta: 0,
});
const NA_META = venda({ id: '13073500', operador_id: 'bea', valor_total: 8_000 });

const VENDAS_PADRAO = [LANCADA, SEM_ASSINATURA, NA_META];
const PENDENTES_PADRAO = [LANCADA, SEM_ASSINATURA];

/*
 * Mutáveis e restauradas no `beforeEach`: os testes de filtro de setor e da aba
 * «Fora do relatório» precisam de um cenário próprio, e criar um segundo dublê
 * do hook para cada um dobraria a fiação sem dobrar o que é verificado.
 */
let VENDAS: Venda[] = VENDAS_PADRAO;
let PENDENTES: Venda[] = PENDENTES_PADRAO;
let FORA: Venda[] = [];
let PRAZOS: Map<string, string> = new Map();

const salvar = vi.fn(async () => ({ ok: true, id: 'novo', erro: null }));
const confirmar = vi.fn(async () => ({ ok: true, id: 'x', erro: null }));

vi.mock('@/hooks/useVendas', async () => {
  const { resumirVendas } = await import('@/lib/vendas');
  return {
    useVendas: () => ({
      vendas: VENDAS, resumo: resumirVendas(VENDAS), pendentes: PENDENTES, prazos: PRAZOS,
      // As que saíram por não virem no relatório (migration 20260921170000).
      // O hook já as tira de `vendas` e de `pendentes` — aqui os dublês chegam
      // separados pelo mesmo motivo.
      foraDoRelatorio: FORA,
      carregando: false, disponivel: true, erro: null,
      recarregar: vi.fn(), salvar, confirmar, excluir: vi.fn(),
    }),
  };
});

const pessoa = (id: string, extra: Partial<PessoaComAusencia> = {}) => ({
  id, nome: id.toUpperCase(), robo: false, foto_url: null, cargo: 'operador',
  equipe_id: 'pec2', equipe_nome: 'PEC 2', setor_id: 's1', setor_nome: 'Vendas Bookplay',
  situacao: 'ativo', diasAbatidos: 0, diasUteisDoMes: 22, ...extra,
} as PessoaComAusencia);

/** O cadastro do placar. Mutável: o filtro de setor precisa de dois setores. */
let PESSOAS: PessoaComAusencia[] = [];

vi.mock('@/hooks/useVendasPlacar', async () => {
  const { indexarPessoas } = await import('@/lib/vendasPlacar');
  // Montado na chamada, e não na fábrica: a fábrica sobe para antes de `pessoa`.
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

vi.mock('framer-motion', () => {
  const componente = (tag: string) => (props: Record<string, unknown>) => {
    const { children, initial: _i, animate: _a, exit: _e, transition: _t,
      variants: _v, whileHover: _w, ...rest } = props ?? {};
    return React.createElement(tag, rest, children as React.ReactNode);
  };
  return {
    motion: new Proxy({}, { get: (_alvo, tag: string) => componente(tag) }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

import Vendas from '../index';

function montar() {
  return render(React.createElement(MemoryRouter, null, React.createElement(Vendas)));
}

/** Operador: só enxerga a si, lança e corrige, não confirma. */
const OPERADOR = new Set([
  'ver_vendas', 'vendas_escopo_individual', 'criar_vendas', 'editar_vendas', 'ver_metas_vendas',
]);

beforeEach(() => {
  perfilAtual = { id: 'ana', nome: 'Ana' };
  VENDAS = VENDAS_PADRAO;
  PENDENTES = PENDENTES_PADRAO;
  FORA = [];
  PESSOAS = [pessoa('ana'), pessoa('bea')];
  PRAZOS = new Map();
  contarLancadas.mockReset();
  contarLancadas.mockResolvedValue(1);
  localStorage.clear();
  temPermissao.mockImplementation(() => true);
  salvar.mockClear();
  confirmar.mockClear();
  metasDoMes.mockResolvedValue({ dado: [], erro: null, ok: true });
});

describe('Vendas — a lista', () => {
  it('tabela com vendedor, valor e quanto vale na meta', () => {
    montar();
    for (const col of ['NR', 'CLIENTE', 'VENDEDOR', 'VALOR', 'NA META', 'STATUS']) {
      expect(screen.getByRole('columnheader', { name: col })).toBeInTheDocument();
    }
    const linha = screen.getByText('Cliente 13073500').closest('tr')!;
    // Valor e «na meta» lado a lado: R$ 8.000,00 duas vezes na mesma linha.
    expect(within(linha).getAllByText(/8\.000,00/)).toHaveLength(2);
  });

  it('status diz quem mexe agora: relatório ou líder', () => {
    montar();
    expect(screen.getByText('Cliente 13073323').closest('tr')!).toHaveTextContent('Aguardando relatório');
    expect(screen.getByText('Cliente 13073400').closest('tr')!).toHaveTextContent('Falta assinatura');
  });

  it('o líder confirma e assina na própria linha', async () => {
    montar();
    const linha = screen.getByText('Cliente 13073323').closest('tr')!;
    fireEvent.click(within(linha).getByTitle(/Confirmar e assinar/));
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith(
      expect.objectContaining({ id: LANCADA.id, situacao: 'confirmada', assinado: true }),
    ));
  });

  it('a aba Pendências é a fila de todos os meses', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Pendências/ }));
    expect(screen.queryByText('Cliente 13073500')).not.toBeInTheDocument();
    expect(screen.getByText('Cliente 13073323')).toBeInTheDocument();
    expect(screen.getByText('Cliente 13073400')).toBeInTheDocument();
  });
});

describe('Vendas — o cadastro rápido', () => {
  it('NR e valor bastam; o valor é lido como se digita e a data é hoje', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Nova venda/ }));
    fireEvent.change(screen.getByLabelText('NR *'), { target: { value: '13079999' } });
    fireEvent.change(screen.getByLabelText('Valor *'), { target: { value: '5.572,50' } });
    fireEvent.submit(screen.getByLabelText('NR *').closest('form')!);
    await waitFor(() => expect(salvar).toHaveBeenCalledWith(expect.objectContaining({
      id: null, nrDocumento: '13079999', valorTotal: 5572.5, dataVenda: HOJE,
      cliente: null, uf: null, formaPagamento: null,
    })));
  });

  it('NR que já está na lista é barrado antes do banco', () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Nova venda/ }));
    fireEvent.change(screen.getByLabelText('NR *'), { target: { value: '13073500' } });
    expect(screen.getByText(/já está na lista/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Lançar venda/ })).toBeDisabled();
  });
});

describe('Vendas — o operador', () => {
  beforeEach(() => temPermissao.mockImplementation((c: string) => OPERADOR.has(c)));

  it('sem coluna de vendedor e sem botão de confirmar', () => {
    montar();
    expect(screen.queryByRole('columnheader', { name: 'VENDEDOR' })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/Confirmar e assinar/)).not.toBeInTheDocument();
    expect(screen.getByText('Suas vendas na meta')).toBeInTheDocument();
  });

  it('vê a própria parte na meta da equipe, e não a meta do setor medida só com ele', async () => {
    metasDoMes.mockResolvedValue({
      ok: true, erro: null,
      dado: [
        { tipo: 'setor', referencia_id: 's1', nome: 'Vendas Bookplay', setor_id: 's1', setor_nome: null, regua: 'valor', quantidade: 0, valor: 900_000 },
        { tipo: 'equipe', referencia_id: 'pec2', nome: 'PEC 2', setor_id: 's1', setor_nome: null, regua: 'valor', quantidade: 0, valor: 80_000 },
      ],
    });
    montar();
    expect(await screen.findByText('Sua parte no mês')).toBeInTheDocument();
    expect(screen.getByText(/da equipe/)).toHaveTextContent('PEC 2');
    expect(screen.queryByText('Meta do mês')).not.toBeInTheDocument();
  });
});

describe('Vendas — quem exclui o quê', () => {
  const lixeiraDa = (cliente: string) =>
    within(screen.getByText(cliente).closest('tr')!).queryByTitle(/Excluir/);

  it('o operador exclui a venda que ele lançou — e só ela', () => {
    temPermissao.mockImplementation((c: string) => OPERADOR.has(c));
    perfilAtual = { id: 'ana', nome: 'Ana', perfil: 'operador' };
    montar();
    expect(lixeiraDa('Cliente 13073323')).toBeInTheDocument();
    expect(lixeiraDa('Cliente 13073400')).not.toBeInTheDocument();
    expect(lixeiraDa('Cliente 13073500')).not.toBeInTheDocument();
  });

  it('o líder exclui fora da meta, mas não a venda na meta', () => {
    perfilAtual = { id: 'leo', nome: 'Leo', perfil: 'lider' };
    temPermissao.mockImplementation((c: string) => c !== 'excluir_vendas_na_meta');
    montar();
    expect(lixeiraDa('Cliente 13073400')).toBeInTheDocument();
    expect(lixeiraDa('Cliente 13073500')).not.toBeInTheDocument();
  });

  it('a gerência exclui a venda na meta', () => {
    perfilAtual = { id: 'gina', nome: 'Gina', perfil: 'gerencia' };
    montar();
    expect(lixeiraDa('Cliente 13073500')).toBeInTheDocument();
  });
});

describe('Vendas — o prazo do relatório', () => {
  it('a venda que o relatório não trouxe mostra quando sai, e a tela avisa', () => {
    PRAZOS = new Map([[LANCADA.id, new Date(Date.now() - 2 * 3_600_000).toISOString()]]);
    montar();
    expect(screen.getByText('Cliente 13073323').closest('tr')!).toHaveTextContent('Sai em 22 h');
    expect(screen.getByRole('alert')).toHaveTextContent('1 venda lançada não veio no relatório');
    expect(screen.getByRole('alert')).toHaveTextContent('13073323');
  });

  it('sem relógio ligado, nem pílula nem faixa', () => {
    montar();
    expect(screen.queryByText(/Sai em/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('Vendas — confete só na primeira venda', () => {
  async function lancar() {
    fireEvent.change(screen.getByLabelText('NR *'), { target: { value: `1307${Math.floor(Math.random() * 9e4 + 1e4)}` } });
    fireEvent.change(screen.getByLabelText('Valor *'), { target: { value: '100,00' } });
    fireEvent.submit(screen.getByLabelText('NR *').closest('form')!);
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    salvar.mockClear();
  }

  it('a primeira venda da vida solta confete, e a pergunta não se repete', async () => {
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Nova venda/ }));
    await lancar();
    expect(await screen.findByTestId('confete')).toBeInTheDocument();
    expect(contarLancadas).toHaveBeenCalledTimes(1);
    await lancar();
    expect(contarLancadas).toHaveBeenCalledTimes(1);
  });

  it('quem já tinha vendas lançadas não ganha confete', async () => {
    contarLancadas.mockResolvedValue(2);
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Nova venda/ }));
    await lancar();
    await waitFor(() => expect(contarLancadas).toHaveBeenCalled());
    expect(screen.queryByTestId('confete')).not.toBeInTheDocument();
  });
});

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * A reforma de 21/09/2026
 *
 * Três pedidos, três defeitos que regridem em silêncio:
 *
 *   1. o dinheiro vem PRIMEIRO nos cards — a ordem é a única coisa que
 *      distingue «quanto» de «quantas», e trocar dois `MetricCard` de lugar é
 *      a mudança mais fácil de desfazer sem querer do arquivo inteiro;
 *   2. o filtro de SETOR, que não existia: sem ele quem enxerga dois setores
 *      vê os dois somados e não tem como olhar um;
 *   3. a aba «Fora do relatório», onde a venda que o ERP nunca confirmou vive
 *      um mês — fora da lista, fora dos cards, fora do placar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

describe('Vendas — os cards do mês', () => {
  it('o faturamento vem antes da quantidade', () => {
    montar();
    const cards = screen.getByTestId
      ? Array.from(document.querySelectorAll('[data-tour="vendas-metricas"] > *'))
      : [];
    const rotulos = cards.map(c => c.textContent ?? '');
    const faturamento = rotulos.findIndex(t => t.includes('Faturamento na meta'));
    const naMeta = rotulos.findIndex(t => /(^|[^a-z])Na meta/.test(t));
    expect(faturamento).toBeGreaterThanOrEqual(0);
    expect(naMeta).toBeGreaterThan(faturamento);
  });

  it('a ordem dos demais não mudou: hoje, pendências, devolução', () => {
    montar();
    const texto = document.querySelector('[data-tour="vendas-metricas"]')!.textContent ?? '';
    const ordem = ['Faturamento na meta', 'Na meta', 'Vendas de hoje', 'Pendências', 'Devolução'];
    let anterior = -1;
    for (const rotulo of ordem) {
      const onde = texto.indexOf(rotulo);
      expect(onde).toBeGreaterThan(anterior);
      anterior = onde;
    }
  });
});

describe('Vendas — o filtro de setor', () => {
  const PESSOA_OUTRO = () => pessoa('caio', {
    equipe_id: 'pec9', equipe_nome: 'PEC 9', setor_id: 's2', setor_nome: 'Vendas PaguePlay',
  });
  const VENDA_OUTRO = venda({
    id: '99000001', operador_id: 'caio', valor_total: 12_000, setor_id: 's2',
  });

  it('não aparece para quem enxerga só a si', () => {
    temPermissao.mockImplementation((c: string) => OPERADOR.has(c));
    PESSOAS = [pessoa('ana'), PESSOA_OUTRO()];
    VENDAS = [...VENDAS_PADRAO, VENDA_OUTRO];
    montar();
    expect(screen.queryByLabelText('Filtrar por setor')).not.toBeInTheDocument();
  });

  it('com dois setores no alcance, escolher um recorta lista e cards', () => {
    PESSOAS = [pessoa('ana'), pessoa('bea'), PESSOA_OUTRO()];
    VENDAS = [...VENDAS_PADRAO, VENDA_OUTRO];
    montar();

    // Sem filtro, as duas vendas estão na lista.
    expect(screen.getByText('Cliente 13073500')).toBeInTheDocument();
    expect(screen.getByText('Cliente 99000001')).toBeInTheDocument();

    const seletor = screen.getByLabelText('Filtrar por setor');
    expect(seletor).toBeInTheDocument();
    expect(seletor).toHaveTextContent('Todos os setores');
  });

  it('um setor só não ganha seletor — um filtro com uma opção é ruído', () => {
    montar();
    expect(screen.queryByLabelText('Filtrar por setor')).not.toBeInTheDocument();
  });
});

describe('Vendas — a aba Fora do relatório', () => {
  const ARQUIVADA = venda({
    id: '13079999', operador_id: 'ana', criado_por: 'ana', valor_total: 2_500,
    origem: 'manual', situacao: 'aberta', contrato_assinado: false, data_confirmacao: null,
    conta_na_meta: false, valor_na_meta: 0,
    fora_do_relatorio_em: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  });

  it('sem nenhuma arquivada, a aba não existe', () => {
    montar();
    expect(screen.queryByRole('button', { name: /Fora do relatório/ })).not.toBeInTheDocument();
  });

  it('a aba aparece com a contagem e lista o NR que o relatório não trouxe', () => {
    FORA = [ARQUIVADA];
    montar();
    const botao = screen.getByRole('button', { name: /Fora do relatório \(1\)/ });
    // Fora da lista principal: a arquivada não está em «Todas».
    expect(screen.queryByText('Cliente 13079999')).not.toBeInTheDocument();
    fireEvent.click(botao);
    expect(screen.getByText('Cliente 13079999')).toBeInTheDocument();
    expect(screen.getByText(/fora há 3 dias/)).toBeInTheDocument();
  });

  it('explica que não soma em nada e que volta sozinha se o NR aparecer', () => {
    FORA = [ARQUIVADA];
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Fora do relatório/ }));
    expect(screen.getByText(/não somam em nada/)).toBeInTheDocument();
    expect(screen.getByText(/volta sozinha para a lista/)).toBeInTheDocument();
  });

  it('nesta aba o líder não decide: o caminho é corrigir o NR ou excluir', () => {
    FORA = [ARQUIVADA];
    montar();
    fireEvent.click(screen.getByRole('button', { name: /Fora do relatório/ }));
    const linha = screen.getByText('Cliente 13079999').closest('tr')!;
    expect(linha.querySelector('[title="Confirmar e assinar — entra na meta"]')).toBeNull();
    expect(linha.querySelector('[title="Corrigir"]')).not.toBeNull();
  });
});

describe('Vendas — a tabela cabe inteira e rola', () => {
  it('nenhuma coluna some por largura de tela', () => {
    montar();
    for (const col of ['NR', 'CLIENTE', 'VENDEDOR', 'VENDA', 'CONFIRMAÇÃO', 'UF',
      'PAGAMENTO', 'STATUS', 'VALOR', 'NA META', 'RECEBIDO', 'AÇÕES']) {
      const th = screen.getByRole('columnheader', { name: col });
      // A regressão a evitar: `hidden md:table-cell` de volta, que tira a
      // coluna da tela pequena em vez de deixar a barra de rolagem resolver.
      expect(th.className).not.toMatch(/\bhidden\b/);
    }
  });

  it('a tabela tem largura mínima, e é o contêiner que rola', () => {
    montar();
    const tabela = screen.getByRole('table');
    expect(tabela.className).toMatch(/min-w-\[\d+px\]/);
    expect(tabela.parentElement!.className).toMatch(/overflow-x-auto/);
  });
});
