/**
 * PixAutomatico.test.tsx — a tela montada, parte por parte.
 *
 * Escrito quando a tela foi dividida (30/10/2026): o estado inteiro saiu para
 * `usePixAutomatico` e cada sub-aba ganhou arquivo. As contas já tinham teste
 * próprio (`pixAutomaticoView`); o que faltava era provar que as partes se
 * encaixam — que o formulário registra, que o NR vindo da URL chega ao campo,
 * que a lixeira e o histórico abrem, e que cada sub-aba desenha.
 *
 * O hook é trocado por um estado fixo: o que se testa aqui é a montagem, não a
 * leitura do banco.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PixAutoAcordo } from '@/services/pix_automatico.service';
import { __resetCacheParaTestes, esquecerInstantaneos } from '@/lib/cacheInstantaneo';
import { calcularDobraComissao, totaisPorStatus, totalPagoPix } from './pixAutomaticoView';
import type { PixTela } from './usePixAutomatico';

const { estado, servico } = vi.hoisted(() => ({
  estado: { pix: null as unknown },
  servico: {
    criarAcordoPix: vi.fn(async () => ({ ok: true, error: null, nrDuplicado: false, nrMesmoOperador: false })),
    fetchLixeiraPix: vi.fn(async () => []),
    purgarLixeiraPixExpirada: vi.fn(async () => undefined),
    fetchLogPix: vi.fn(async () => []),
  },
}));

vi.mock('./usePixAutomatico', () => ({ usePixAutomatico: () => estado.pix }));
vi.mock('@/services/pix_automatico.service', async (original) => ({
  ...(await original<typeof import('@/services/pix_automatico.service')>()),
  ...servico,
}));
// O painel de bônus lê o banco sozinho; aqui ele não tem o que provar.
vi.mock('./PixBonusPainel', () => ({ PixBonusPainel: () => null }));

import { PixAutomatico } from './PixAutomatico';

const MES = '2026-10';
const PCT = { 'setor-1': 1 };

function acordo(id: string, extras: Partial<PixAutoAcordo> = {}): PixAutoAcordo {
  return {
    id,
    empresa_id: 'empresa-1',
    operador_id: 'op-1',
    operador_nome: 'Ana Operadora',
    setor_id: 'setor-1',
    nr_cliente: `1000${id}`,
    valor: 500,
    status: 'pendente',
    pct_comissao: 1,
    avaliado_por: null,
    avaliado_por_nome: null,
    avaliado_em: null,
    criado_em: '2026-10-10T12:00:00Z',
    pago: false,
    pago_em: null,
    pago_por_nome: null,
    ajuste_valor: null,
    ajuste_motivo: null,
    extra: false,
    bonus_pct: 0,
    ...extras,
  } as PixAutoAcordo;
}

/** O estado da tela com o operador olhando o próprio Pix, mês corrente. */
function telaBase(extras: Partial<PixTela> = {}): PixTela {
  const itens = [acordo('1'), acordo('2', { status: 'aprovado' })];
  const base = {
    perfil: { id: 'op-1', nome: 'Ana Operadora', email: 'ana@x', setor_id: 'setor-1' },
    empresa: { id: 'empresa-1' },
    temPermissao: () => false,
    podeAprovar: false,
    podeVerTodosSetores: false, podeVerDeOutros: false, podeAgirSobreOutros: false,
    podeEditarConfig: false, podeAjustarSaldo: false, podeRegistrar: true, podeMarcarPremiacaoPaga: false,
    mes: MES, setMes: vi.fn(), meuSetor: 'setor-1', setorEscopo: null, noMesAtual: true,
    fechamento: { impedir: () => false, impedirData: () => false },
    inicioDoMes: '2026-10-01', fimDoMes: '2026-10-31',
    itens, configs: {}, operadores: [], setores: [{ id: 'setor-1', nome: 'Play 1' }],
    setoresDoFiltro: [{ id: 'setor-1', nome: 'Play 1' }], doRetrato: false,
    donosDeNr: new Map(), nrsBloqueados: new Set<string>(), saldos: [],
    pagamentosPremiacao: [], setPagamentosPremiacao: vi.fn(),
    loading: false, carregar: vi.fn(async () => undefined), carregarMetaPix: vi.fn(async () => undefined),
    jaPintouPix: { current: true }, clonesRef: { current: {} },
    nrDeFora: null, consumirNrDeFora: vi.fn(),
    subAba: 'registros', trocarSubAba: vi.fn(), diaNovo: '2026-10-31', setDiaNovo: vi.fn(),
    pedidosNr: [], aprovacoesNr: [], meusSetores: [], acordosSemPix: [],
    chaveAba: 'teste-pix', busca: '', setBusca: vi.fn(), filtroStatus: 'todos', setFiltroStatus: vi.fn(),
    filtroOperador: '', setFiltroOperador: vi.fn(), filtroEquipe: '', setFiltroEquipe: vi.fn(),
    setFiltroSetor: vi.fn(), filtroPagamento: 'todos', setFiltroPagamento: vi.fn(),
    dataDe: '', setDataDe: vi.fn(), dataAte: '', setDataAte: vi.fn(),
    metaPorOperador: {}, metasPix: [],
    setorFoco: 'setor-1', setorConfig: 'setor-1', equipesDoFoco: [],
    pctPorSetor: PCT, pctDoMeuSetor: 1, pctSetorConfig: 1, registroLigadoSetorConfig: true,
    metaDobraSetorConfig: 18,
    operadoresFiltro: [], operadoresDoSeletor: [], visiveis: itens,
    setPagina: vi.fn(), totalPaginas: 1, paginaAtual: 1, daPagina: itens,
    totais: totaisPorStatus(itens, PCT), pagamento: totalPagoPix(itens, PCT),
    meusDesaprovados: 0, saldoPorOperador: {}, nrPorAcordo: {},
    bonusMeta: null, metaPorSetor: {},
    dobra: calcularDobraComissao(itens, 'op-1', PCT, MES, { metaValor: null, recebidoMes: null }, {}),
    abasRanking: [], pedidosDoFoco: [], fotoPorOperador: {}, nomePorSetor: {},
    resumoPorSetor: {}, pedidosSemSetor: 0, blocosMetaPix: [],
    selecionados: new Set<string>(), setSelecionados: vi.fn(),
    quemExclui: { id: 'op-1', nome: 'Ana Operadora' },
    divergenciasAbertas: 0, resumoPremiacao: null,
  };
  return { ...base, ...extras } as unknown as PixTela;
}

/** O líder: vê o Pix do setor, aprova e age sobre registro alheio. */
function telaDoLider(extras: Partial<PixTela> = {}): PixTela {
  return telaBase({
    temPermissao: () => true, podeAprovar: true,
    podeVerDeOutros: true, podeAgirSobreOutros: true,
    ...extras,
  });
}

function montar(pix: PixTela) {
  estado.pix = pix;
  return render(<MemoryRouter><PixAutomatico /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  // O rascunho mora no depósito do módulo: sem limpar, vazaria entre os casos.
  __resetCacheParaTestes();
});

/** Troca a sub-aba como a URL troca: a tela continua montada, a sub-aba não. */
function trocarPara(rerender: (ui: React.ReactElement) => void, pix: PixTela, subAba: string) {
  estado.pix = { ...pix, subAba } as PixTela;
  rerender(<MemoryRouter><PixAutomatico /></MemoryRouter>);
}

const campoNr    = () => screen.getByPlaceholderText('Só números') as HTMLInputElement;
const campoValor = () => screen.getByPlaceholderText('0,00') as HTMLInputElement;

describe('PixAutomatico — sair e voltar mantém o que estava na tela', () => {
  it('o NR e o valor digitados voltam depois de abrir outra sub-aba', async () => {
    const pix = telaBase();
    const { rerender } = montar(pix);
    await userEvent.type(campoNr(), '4321');
    await userEvent.type(campoValor(), '250,00');

    trocarPara(rerender, pix, 'divergencias');
    expect(screen.queryByPlaceholderText('Só números')).toBeNull();
    trocarPara(rerender, pix, 'registros');

    expect(campoNr().value).toBe('4321');
    expect(campoValor().value).toBe('250,00');
  });

  it('o rascunho também volta depois de sair da tela e entrar de novo', async () => {
    const { unmount } = montar(telaBase());
    await userEvent.type(campoNr(), '98765');
    await userEvent.click(screen.getByRole('checkbox', { name: /EXTRA/i }));
    unmount();

    montar(telaBase());
    expect(campoNr().value).toBe('98765');
    expect((screen.getByRole('checkbox', { name: /EXTRA/i }) as HTMLInputElement).checked).toBe(true);
  });

  it('o rascunho de uma pessoa não aparece para outra', async () => {
    const { unmount } = montar(telaBase());
    await userEvent.type(campoNr(), '111');
    unmount();

    montar(telaBase({ chaveAba: 'outra-pessoa' }));
    expect(campoNr().value).toBe('');
  });

  it('o logout apaga o rascunho', async () => {
    const { unmount } = montar(telaBase());
    await userEvent.type(campoNr(), '222');
    unmount();

    esquecerInstantaneos();
    montar(telaBase());
    expect(campoNr().value).toBe('');
  });

  it('depois de registrar o formulário volta limpo, e continua limpo ao voltar', async () => {
    const pix = telaBase();
    const { rerender } = montar(pix);
    await userEvent.type(campoNr(), '555');
    await userEvent.type(campoValor(), '100,00');
    await userEvent.click(screen.getByRole('button', { name: /Registrar Acordo Pix/ }));
    await waitFor(() => expect(servico.criarAcordoPix).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(campoNr().value).toBe(''));

    trocarPara(rerender, pix, 'divergencias');
    trocarPara(rerender, pix, 'registros');
    expect(campoNr().value).toBe('');
    expect(campoValor().value).toBe('');
  });

  it('o NR vindo de um link ainda passa por cima do rascunho', async () => {
    const { unmount } = montar(telaBase());
    await userEvent.type(campoNr(), '333');
    unmount();

    montar(telaBase({ nrDeFora: '777' }));
    await waitFor(() => expect(campoNr().value).toBe('777'));
  });

  it('a linha em edição e o valor digitado nela voltam depois de trocar de sub-aba', async () => {
    const pix = telaDoLider();
    const { rerender } = montar(pix);
    const [editar] = screen.getAllByTitle('Editar NR e valor');
    await userEvent.click(editar);
    const valor = screen.getByLabelText('Valor do acordo') as HTMLInputElement;
    await userEvent.clear(valor);
    await userEvent.type(valor, '612,30');

    trocarPara(rerender, pix, 'ranking');
    expect(screen.queryByLabelText('Valor do acordo')).toBeNull();
    trocarPara(rerender, pix, 'registros');

    expect((screen.getByLabelText('Valor do acordo') as HTMLInputElement).value).toBe('612,30');
  });

  it('o % e a meta da dobra digitados na config do setor voltam depois de trocar de sub-aba', async () => {
    const pix = telaDoLider({ podeEditarConfig: true });
    const { rerender } = montar(pix);
    const pct = screen.getByLabelText('Comissão do setor (%)') as HTMLInputElement;
    expect(pct.value).toBe('1');
    await userEvent.clear(pct);
    await userEvent.type(pct, '1,5');
    const meta = screen.getByLabelText('Acordos para dobrar') as HTMLInputElement;
    await userEvent.clear(meta);
    await userEvent.type(meta, '22');

    trocarPara(rerender, pix, 'divergencias');
    trocarPara(rerender, pix, 'registros');

    expect((screen.getByLabelText('Comissão do setor (%)') as HTMLInputElement).value).toBe('1,5');
    expect((screen.getByLabelText('Acordos para dobrar') as HTMLInputElement).value).toBe('22');
  });

  it('quando o % gravado muda (salvou, ou outro líder mudou), o campo mostra o do banco', async () => {
    const pix = telaDoLider({ podeEditarConfig: true });
    const { rerender } = montar(pix);
    const pct = screen.getByLabelText('Comissão do setor (%)') as HTMLInputElement;
    await userEvent.clear(pct);
    await userEvent.type(pct, '1,5');

    estado.pix = { ...pix, pctSetorConfig: 2 } as PixTela;
    rerender(<MemoryRouter><PixAutomatico /></MemoryRouter>);

    expect((screen.getByLabelText('Comissão do setor (%)') as HTMLInputElement).value).toBe('2');
  });
});

describe('PixAutomatico — Registros', () => {
  it('desenha o formulário, os totais e as linhas do mês', () => {
    montar(telaBase());
    expect(screen.getByRole('heading', { name: 'Pix Automático' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Registrar Acordo Pix/ })).toBeTruthy();
    expect(screen.getByText('10001')).toBeTruthy();
    expect(screen.getByText('10002')).toBeTruthy();
  });

  it('registra pelo formulário e recarrega a tela', async () => {
    const pix = telaBase();
    montar(pix);
    await userEvent.type(screen.getByPlaceholderText('Só números'), '555');
    await userEvent.type(screen.getByPlaceholderText('0,00'), '1.234,50');
    await userEvent.click(screen.getByRole('button', { name: /Registrar Acordo Pix/ }));

    await waitFor(() => expect(servico.criarAcordoPix).toHaveBeenCalledTimes(1));
    expect(servico.criarAcordoPix).toHaveBeenCalledWith(expect.objectContaining({
      empresaId: 'empresa-1', operadorId: 'op-1', nrCliente: '555', valor: 1234.5,
    }));
    await waitFor(() => expect(pix.carregar).toHaveBeenCalled());
    // O formulário limpa depois de registrar.
    expect((screen.getByPlaceholderText('Só números') as HTMLInputElement).value).toBe('');
  });

  it('o NR vindo da URL chega ao campo, e é consumido uma vez', async () => {
    const pix = telaBase({ nrDeFora: '777' });
    montar(pix);
    await waitFor(() =>
      expect((screen.getByPlaceholderText('Só números') as HTMLInputElement).value).toBe('777'));
    expect(pix.consumirNrDeFora).toHaveBeenCalledTimes(1);
  });

  it('com o registro desligado, mostra o aviso no lugar do formulário', () => {
    montar(telaBase({ podeRegistrar: false }));
    expect(screen.queryByRole('button', { name: /Registrar Acordo Pix/ })).toBeNull();
    expect(screen.getByText('desativado')).toBeTruthy();
  });

  it('o líder abre a edição de uma linha pendente', async () => {
    montar(telaDoLider());
    const [editar] = screen.getAllByTitle('Editar NR e valor');
    await userEvent.click(editar);
    expect(screen.getByLabelText('NR do acordo')).toBeTruthy();
    expect(screen.getByLabelText('Valor do acordo')).toBeTruthy();
  });

  it('a barra de lote aparece só com linha marcada', () => {
    const { unmount } = montar(telaDoLider());
    expect(screen.queryByText(/selecionado\(s\)/)).toBeNull();
    unmount();
    montar(telaDoLider({ selecionados: new Set(['1']) }));
    expect(screen.getByText('1 selecionado(s)')).toBeTruthy();
  });
});

describe('PixAutomatico — cabeçalho', () => {
  it('a lixeira abre e lê os excluídos', async () => {
    montar(telaBase());
    await userEvent.click(screen.getByRole('button', { name: /Lixeira/ }));
    await waitFor(() => expect(servico.fetchLixeiraPix).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('A lixeira está vazia.')).toBeTruthy();
  });

  it('o histórico abre e lê o log', async () => {
    montar(telaBase());
    await userEvent.click(screen.getByRole('button', { name: /Histórico/ }));
    await waitFor(() => expect(servico.fetchLogPix).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Nada registrado ainda.')).toBeTruthy();
  });
});

describe('PixAutomatico — as outras sub-abas', () => {
  it('NRs divergentes', () => {
    montar(telaBase({ subAba: 'divergencias' }));
    expect(screen.getByText('NRs em disputa')).toBeTruthy();
    expect(screen.getByText('Sem registro no Pix')).toBeTruthy();
    // O formulário é de Registros.
    expect(screen.queryByRole('button', { name: /Registrar Acordo Pix/ })).toBeNull();
  });

  it('Ranking, para quem vê o Pix dos outros', () => {
    montar(telaDoLider({ subAba: 'ranking' }));
    expect(screen.getByText(/Ranking vazio em/)).toBeTruthy();
  });

  it('Premiação e Ranking não abrem para o operador', () => {
    montar(telaBase({ subAba: 'ranking' }));
    expect(screen.queryByText(/Ranking vazio em/)).toBeNull();
  });

  it('a faixa de divergência leva à sub-aba', async () => {
    const pix = telaBase({ divergenciasAbertas: 2 });
    montar(pix);
    await userEvent.click(screen.getByRole('button', { name: /divergências esperando/ }));
    expect(pix.trocarSubAba).toHaveBeenCalledWith('divergencias');
  });
});
