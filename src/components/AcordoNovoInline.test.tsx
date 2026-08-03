/**
 * AcordoNovoInline.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre a função `salvar()` e o fluxo CASO A / B / C + caminho livre +
 * mesmo operador. Também testa o componente exportado ModalAvisoDiretoExtra
 * em isolado.
 *
 * Estratégia:
 *  • Mock de @/components/ui/calendar — expõe um botão "pick-date" que chama
 *    onSelect(today), tornando o DatePickerField interno trivial de operar.
 *  • Mock de @/components/ui/popover — sempre aberto (Fragment), removendo
 *    dependência de Radix Portal.
 *  • Mocks de todos os services e hooks para evitar rede/banco real.
 *  • Supabase mockado com rotas por tabela+operação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Acordo } from '@/lib/supabase';

// ── Mocks (ANTES do SUT) ────────────────────────────────────────────────────

// 1) nr_registros.service
const verificarNrRegistroMock = vi.fn();
vi.mock('@/services/nr_registros.service', () => ({
  verificarNrRegistro: (...a: unknown[]) => verificarNrRegistroMock(...a),
  registrarNr:         vi.fn().mockResolvedValue({ ok: true }),
  transferirNr:        vi.fn().mockResolvedValue({ ok: true }),
  liberarNr:           vi.fn().mockResolvedValue({ ok: true }),
  liberarNrPorAcordoId: vi.fn().mockResolvedValue({ ok: true }),
}));

// 2) notificações + lixeira
const criarNotificacaoMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/notificacoes.service', () => ({
  criarNotificacao: (...a: unknown[]) => criarNotificacaoMock(...a),
}));
vi.mock('@/services/lixeira.service', () => ({
  enviarParaLixeira: vi.fn().mockResolvedValue(undefined),
}));

// 2b) direto_extra.service — `fetchIsDiretoExtraAtivo` decide os CASOs A/B/C.
const fetchIsDiretoExtraAtivoMock = vi.fn().mockResolvedValue(false);
vi.mock('@/services/direto_extra.service', () => ({
  fetchIsDiretoExtraAtivo: (...a: unknown[]) => fetchIsDiretoExtraAtivoMock(...a),
}));

// 3) hooks
const verificarConflitoCache = vi.fn().mockReturnValue(null);
vi.mock('@/hooks/useNrRegistros', () => ({
  useNrRegistros: () => ({
    verificarConflito: verificarConflitoCache,
    loading: false,
    refetch: vi.fn(),
  }),
}));

const isAtivoParaUsuarioMock = vi.fn().mockReturnValue(false);
vi.mock('@/hooks/useDiretoExtraConfig', () => ({
  useDiretoExtraConfig: () => ({
    isAtivoParaUsuario: isAtivoParaUsuarioMock,
    loading: false,
    configs: [],
    refetch: vi.fn(),
  }),
}));

let perfilValue: { id: string; nome: string; setor_id?: string | null; equipe_id?: string | null } | null = {
  id: 'me-1',
  nome: 'Eu Operador',
  setor_id: 'setor-A',
  equipe_id: null,
};
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: perfilValue }),
}));

let empresaValue: { id: string } | null = { id: 'emp-1' };
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: empresaValue }),
}));

// 4) Supabase — builder com rotas por tabela+operação.
type R = { data: unknown; error: { message: string; code?: string } | null };

const routes: {
  insertAcordo: R;
  updateAcordo: R;
  acordosMaybeSingle: R;
  perfisMaybeSingle: R;
  logsSistemaInsert: R;
} = {
  insertAcordo:       { data: null, error: null },
  updateAcordo:       { data: null, error: null },
  acordosMaybeSingle: { data: null, error: null },
  perfisMaybeSingle:  { data: null, error: null },
  logsSistemaInsert:  { data: null, error: null },
};

interface SupabaseCall { table: string; op: string; payload?: unknown; id?: unknown; }
const supabaseCalls: SupabaseCall[] = [];

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const state: { op?: string; payload?: unknown; id?: unknown } = {};
    const terminal = async (kind: string): Promise<R> => {
      supabaseCalls.push({ table, op: state.op ?? kind, payload: state.payload, id: state.id });
      if (table === 'acordos' && state.op === 'insert') return routes.insertAcordo;
      if (table === 'acordos' && state.op === 'update') return routes.updateAcordo;
      if (table === 'acordos' && state.op === 'select' && kind === 'maybeSingle') return routes.acordosMaybeSingle;
      if (table === 'perfis'  && state.op === 'select') return routes.perfisMaybeSingle;
      if (table === 'logs_sistema' && state.op === 'insert') return routes.logsSistemaInsert;
      return { data: null, error: null };
    };
    const builder: Record<string, unknown> = {
      insert: vi.fn((payload: unknown) => { state.op = 'insert'; state.payload = payload; return builder; }),
      update: vi.fn((payload: unknown) => { state.op = 'update'; state.payload = payload; return builder; }),
      delete: vi.fn(() => { state.op = 'delete'; return builder; }),
      select: vi.fn(() => { state.op = state.op ?? 'select'; return builder; }),
      eq: vi.fn((c: string, v: unknown) => { if (c === 'id') state.id = v; return builder; }),
      neq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => terminal('single')),
      maybeSingle: vi.fn(() => terminal('maybeSingle')),
      then: (resolve: (v: R) => unknown) => terminal('noop').then(resolve),
    };
    return builder;
  };
  return {
    supabase: {
      from: vi.fn((t: string) => makeBuilder(t)),
      // RPCs falham por padrão → o código cai nos fallbacks de update direto,
      // que são os caminhos assertados nos testes do CASO A.
      rpc: vi.fn(async () => ({ data: null, error: { message: 'rpc indisponível no teste' } })),
    },
  };
});

// 5) toast
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error:   (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    warning: vi.fn(),
  },
}));

// 6) Calendar → componente plano com botão "pick-date" disparando onSelect(today).
vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({ onSelect }: { onSelect?: (d: Date) => void }) => (
    <button data-testid="pick-date" onClick={() => onSelect?.(new Date('2026-05-15T00:00:00'))}>
      pick-date
    </button>
  ),
}));

// 7) Popover → sempre aberto (Fragment simples), elimina Radix Portal.
vi.mock('@/components/ui/popover', () => ({
  Popover:        ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// 8) Dialog → inline (sempre visível quando `open`), evita Radix Portal.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent:     ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader:      ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle:       ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter:      ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// 9) Select → substitui radix-select. O form usa valores default válidos, então basta
// um shim que renderize children com onValueChange preservado.
vi.mock('@/components/ui/select', () => {
  const Select = ({ value, children }: { value?: string; onValueChange?: (v: string) => void; children?: React.ReactNode }) => (
    <div data-value={value}>{children}</div>
  );
  const Noop = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Select,
    SelectContent: Noop,
    SelectItem:    Noop,
    SelectTrigger: Noop,
    SelectValue:   Noop,
  };
});

// Agora sim, o SUT.
import { AcordoNovoInline, ModalAvisoDiretoExtra } from './AcordoNovoInline';

// ── Helpers ─────────────────────────────────────────────────────────────────

function renderInline(props: Partial<React.ComponentProps<typeof AcordoNovoInline>> = {}) {
  return render(
    <table><tbody>
      <AcordoNovoInline
        isPaguePlay={props.isPaguePlay ?? false}
        colSpan={props.colSpan ?? 10}
        onSaved={props.onSaved ?? vi.fn()}
        onCancel={props.onCancel ?? vi.fn()}
        onAcordoRemovido={props.onAcordoRemovido}
      />
    </tbody></table>,
  );
}

/** Preenche os campos obrigatórios (Bookplay): nome, nr, vencimento, valor. */
function preencherMinimoBookplay(nr = '777') {
  // Nome do cliente
  const nome = screen.getByPlaceholderText(/Nome completo/i);
  fireEvent.change(nome, { target: { value: 'Cliente Teste' } });
  // NR do cliente
  const nrInput = screen.getByPlaceholderText(/Código do acordo/i);
  fireEvent.change(nrInput, { target: { value: nr } });
  // Vencimento: clicar no pick-date (nosso mock chama onSelect com data válida)
  fireEvent.click(screen.getByTestId('pick-date'));
  // Valor: placeholder "0,00" no input de valor
  const valorInput = screen.getByPlaceholderText('0,00');
  fireEvent.change(valorInput, { target: { value: '100' } });
}

function clickSalvarAcordo() {
  const btn = screen.getByRole('button', { name: /Salvar acordo/i });
  fireEvent.click(btn);
}

/**
 * Semeia a UF no rascunho antes de montar o formulário PaguePlay.
 *
 * Desde a migration 20260802c a PaguePlay não salva acordo sem estado. O campo
 * é um `Select` do shadcn, que abre por portal e não responde a `fireEvent` no
 * happy-dom — então a UF entra pelo rascunho do sessionStorage, exatamente o
 * caminho que o `ModalTabularAnalitico` usa em produção.
 *
 * Chame ANTES de `renderInline`: o rascunho é lido no primeiro render.
 */
function semearEstadoPP(extra: Record<string, string> = {}, estado = 'SP') {
  sessionStorage.setItem(
    'acordo-inline-draft::emp-1::me-1::pp',
    JSON.stringify({ estadoSel: estado, ...extra }),
  );
}

beforeEach(() => {
  verificarNrRegistroMock.mockReset();
  verificarConflitoCache.mockReset().mockReturnValue(null);
  criarNotificacaoMock.mockReset().mockResolvedValue(undefined);
  isAtivoParaUsuarioMock.mockReset().mockReturnValue(false);
  fetchIsDiretoExtraAtivoMock.mockReset().mockResolvedValue(false);
  toastError.mockReset();
  toastSuccess.mockReset();
  supabaseCalls.length = 0;
  routes.insertAcordo       = { data: null, error: null };
  routes.updateAcordo       = { data: null, error: null };
  routes.acordosMaybeSingle = { data: null, error: null };
  routes.perfisMaybeSingle  = { data: null, error: null };
  perfilValue = { id: 'me-1', nome: 'Eu Operador', setor_id: 'setor-A', equipe_id: null };
  empresaValue = { id: 'emp-1' };
  // Limpa rascunho persistido em sessionStorage entre testes (ver persistência
  // introduzida em AcordoNovoInline para preservar form ao trocar de aba).
  try { sessionStorage.clear(); } catch { /* jsdom fallback */ }
});

// ── Testes do ModalAvisoDiretoExtra (unit puro) ─────────────────────────────

describe('<ModalAvisoDiretoExtra />', () => {
  it('não renderiza nada quando aberto=false', () => {
    const { container } = render(
      <ModalAvisoDiretoExtra
        aberto={false}
        operadorNome="Maria"
        nrLabel="777"
        labelCampo="NR"
        confirmando={false}
        onConfirmar={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('renderiza operador, NR e setor quando aberto', () => {
    render(
      <ModalAvisoDiretoExtra
        aberto
        operadorNome="Maria"
        operadorSetor="Cobranças"
        nrLabel="777"
        labelCampo="NR"
        confirmando={false}
        onConfirmar={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const maria = screen.getAllByText(/Maria/);
    expect(maria.length).toBeGreaterThan(0);
    expect(screen.getByText(/777/)).toBeInTheDocument();
    expect(screen.getByText(/Cobranças/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tabular como Direto/i })).toBeInTheDocument();
  });

  it('invoca onConfirmar ao clicar no botão de confirmação', () => {
    const onConfirmar = vi.fn();
    render(
      <ModalAvisoDiretoExtra
        aberto
        operadorNome="Maria"
        nrLabel="777"
        labelCampo="NR"
        confirmando={false}
        onConfirmar={onConfirmar}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Tabular como Direto/i }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it('desabilita os botões quando confirmando=true e mostra "Tabulando..."', () => {
    render(
      <ModalAvisoDiretoExtra
        aberto
        operadorNome="Maria"
        nrLabel="777"
        labelCampo="NR"
        confirmando
        onConfirmar={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const confirmar = screen.getByRole('button', { name: /Tabulando/i }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
  });
});

// ── Testes da função salvar() via fluxo de UI ───────────────────────────────

describe('AcordoNovoInline — validações iniciais', () => {
  it('toast "Data de vencimento obrigatória" quando sem data', async () => {
    renderInline();
    // Preencher tudo MENOS vencimento.
    const nome = screen.getByPlaceholderText(/Nome completo/i);
    fireEvent.change(nome, { target: { value: 'X' } });
    const nrInput = screen.getByPlaceholderText(/Código do acordo/i);
    fireEvent.change(nrInput, { target: { value: '777' } });
    const valorInput = screen.getByPlaceholderText('0,00');
    fireEvent.change(valorInput, { target: { value: '100' } });

    clickSalvarAcordo();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Data de vencimento obrigatória'),
    );
    expect(verificarNrRegistroMock).not.toHaveBeenCalled();
  });

  it('toast "Informe o valor do acordo" quando valor vazio', async () => {
    renderInline();
    const nome = screen.getByPlaceholderText(/Nome completo/i);
    fireEvent.change(nome, { target: { value: 'X' } });
    const nrInput = screen.getByPlaceholderText(/Código do acordo/i);
    fireEvent.change(nrInput, { target: { value: '777' } });
    fireEvent.click(screen.getByTestId('pick-date'));

    clickSalvarAcordo();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Informe o valor do acordo'),
    );
    expect(verificarNrRegistroMock).not.toHaveBeenCalled();
  });

  it('bloqueia quando perfil=null', async () => {
    perfilValue = null;
    renderInline();
    preencherMinimoBookplay();
    clickSalvarAcordo();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Usuário não autenticado'));
    expect(verificarNrRegistroMock).not.toHaveBeenCalled();
  });

  it('bloqueia quando empresa=null', async () => {
    empresaValue = null;
    renderInline();
    preencherMinimoBookplay();
    clickSalvarAcordo();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Empresa não identificada'));
    expect(verificarNrRegistroMock).not.toHaveBeenCalled();
  });

  it('PaguePlay: "Código é obrigatório" quando campo vazio', async () => {
    renderInline({ isPaguePlay: true });
    // No PaguePlay o placeholder do nome é "Nome do profissional".
    const nomeCampo = screen.getByPlaceholderText(/Nome do profissional/i);
    fireEvent.change(nomeCampo, { target: { value: 'Profissional X' } });

    fireEvent.click(screen.getByTestId('pick-date'));
    const valorInput = screen.getByPlaceholderText('0,00');
    fireEvent.change(valorInput, { target: { value: '100' } });

    clickSalvarAcordo();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Código é obrigatório'),
    );
  });
});

describe('AcordoNovoInline — fluxo salvar() (caminho livre)', () => {
  it('NR livre: chama verificarNrRegistro e insere acordo + onSaved + toast sucesso', async () => {
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue(null);
    routes.insertAcordo = {
      data: {
        id: 'novo-1',
        nome_cliente: 'Cliente Teste',
        nr_cliente: '777',
      } as Acordo,
      error: null,
    };

    renderInline({ onSaved });
    preencherMinimoBookplay('777');
    clickSalvarAcordo();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(verificarNrRegistroMock).toHaveBeenCalledWith('777', 'emp-1', 'nr_cliente');

    // Verifica que um insert aconteceu na tabela acordos com NR correto.
    const insertCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'insert');
    expect(insertCall).toBeTruthy();
    expect(insertCall?.payload).toMatchObject({
      nome_cliente: 'Cliente Teste',
      nr_cliente:   '777',
      operador_id:  'me-1',
      empresa_id:   'emp-1',
    });
    expect(toastSuccess).toHaveBeenCalled();
  });
});

describe('AcordoNovoInline — fluxo salvar() (mesmo operador)', () => {
  it('NR meu + acordo carregável: abre ModalAdicionarParcela sem inserir', async () => {
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'a-meu', operadorId: 'me-1', operadorNome: 'Eu Operador',
    });
    routes.acordosMaybeSingle = {
      data: {
        id: 'a-meu', nome_cliente: 'Cliente Entrada', nr_cliente: '777',
        vencimento: '2026-07-01', valor: 400, tipo: 'pix', status: 'pago',
        parcelas: 1, numero_parcela: 1, acordo_grupo_id: 'grp-1',
        operador_id: 'me-1', empresa_id: 'emp-1',
        perfis: { id: 'me-1', nome: 'Eu Operador' },
      } as Acordo,
      error: null,
    };

    renderInline({ onSaved });
    preencherMinimoBookplay('777');
    clickSalvarAcordo();

    // Modal de adicionar parcela aparece com o contexto do NR bloqueado.
    await waitFor(() => {
      expect(screen.getByText(/Adicionar parcela ao acordo/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/já está tabulado por você/i)).toBeInTheDocument();

    // Nada foi inserido ainda — aguarda confirmação do operador.
    expect(onSaved).not.toHaveBeenCalled();
    const insertCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'insert');
    expect(insertCall).toBeUndefined();
  });

  it('confirmar no modal insere parcela no mesmo grupo e chama onSaved', async () => {
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'a-meu', operadorId: 'me-1', operadorNome: 'Eu Operador',
    });
    routes.acordosMaybeSingle = {
      data: {
        id: 'a-meu', nome_cliente: 'Cliente Entrada', nr_cliente: '777',
        vencimento: '2026-07-01', valor: 400, tipo: 'pix', status: 'pago',
        parcelas: 1, numero_parcela: 1, acordo_grupo_id: 'grp-1',
        operador_id: 'me-1', empresa_id: 'emp-1',
        perfis: { id: 'me-1', nome: 'Eu Operador' },
      } as Acordo,
      error: null,
    };
    routes.insertAcordo = {
      data: {
        id: 'parc-2', nr_cliente: '777', numero_parcela: 2, parcelas: 2,
        acordo_grupo_id: 'grp-1', vencimento: '2026-05-15', valor: 100,
      } as Acordo,
      error: null,
    };

    renderInline({ onSaved });
    preencherMinimoBookplay('777');
    clickSalvarAcordo();

    const modal = await screen.findByRole('dialog');

    // ── Sobre a instabilidade histórica deste teste ──────────────────────────
    //
    // Ele falhava de vez em quando na suíte completa, sempre com "chamado 0
    // vezes", e sempre passava isolado. A resposta anterior foi subir o timeout
    // (1s → 5s → 15s, mais 20s no teste). Isso nunca resolveu: só adiava a
    // falha e escondia o diagnóstico.
    //
    // O que foi VERIFICADO e descartado (03/08/2026):
    //   • lentidão de máquina — os timeouts voltaram ao padrão e a suíte passou
    //     quatro vezes seguidas com build e lint rodando junto de propósito;
    //   • janela antes da semeadura dos campos — o `useEffect` de
    //     `ModalAdicionarParcela` já rodou quando o diálogo aparece. Uma sonda
    //     temporária confirmou que o campo de valor já está preenchido nesse
    //     instante, então não há janela.
    //
    // A causa raiz continua SEM PROVA. O que mudou aqui foi tornar a próxima
    // falha legível em vez de mascará-la: espera pelo campo semeado (explicita
    // a pré-condição), busca escopada ao diálogo (sem ambiguidade com o
    // formulário que segue montado atrás) e a checagem de toast de erro logo
    // abaixo — se `adicionarParcelaAoGrupo` devolver `{ erro }`, o teste passa
    // a dizer QUAL erro, em vez de esperar em silêncio até estourar.
    await waitFor(() => {
      expect(within(modal).getByDisplayValue('100,00')).toBeInTheDocument();
    });

    fireEvent.click(within(modal).getByRole('button', { name: /^Adicionar parcela$/i }));

    // Timeout padrão, de volta ao normal — ver o bloco acima.
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    // Nenhum toast de erro. Os dois caminhos que engolem o fluxo em silêncio —
    // a validação do modal e o `{ erro }` de `adicionarParcelaAoGrupo` —
    // passam por aqui. Se algum dia um deles for o culpado, é esta linha que
    // vai apontar o dedo.
    expect(toastError).not.toHaveBeenCalled();

    // Parcela inserida no MESMO grupo, com número e total incrementados.
    const insertCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'insert');
    expect(insertCall?.payload).toMatchObject({
      nr_cliente:      '777',
      acordo_grupo_id: 'grp-1',
      numero_parcela:  2,
      parcelas:        2,
      operador_id:     'me-1',
      empresa_id:      'emp-1',
      vencimento:      '2026-05-15',
      valor:           100,
    });

    // Linhas antigas do grupo recebem o novo total (update parcelas=2).
    const updateCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'update');
    expect(updateCall?.payload).toMatchObject({ parcelas: 2 });

    expect(toastSuccess).toHaveBeenCalled();
    const okMsgs = toastSuccess.mock.calls.map(c => String(c[0]));
    expect(okMsgs.some(m => /adicionada/i.test(m))).toBe(true);
  });

  it('PaguePlay: mantém o bloqueio original (toast, sem modal de parcela)', async () => {
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'a-meu', operadorId: 'me-1', operadorNome: 'Eu Operador',
    });
    // Mesmo com o acordo carregável, PP não deve abrir o modal.
    routes.acordosMaybeSingle = {
      data: { id: 'a-meu', instituicao: 'INS-1', operador_id: 'me-1', empresa_id: 'emp-1' } as Acordo,
      error: null,
    };

    semearEstadoPP();
    renderInline({ onSaved, isPaguePlay: true });
    const nomeCampo = screen.getByPlaceholderText(/Nome do profissional/i);
    fireEvent.change(nomeCampo, { target: { value: 'Profissional X' } });
    const codigo = screen.getByPlaceholderText(/^Código$/);
    fireEvent.change(codigo, { target: { value: 'INS-1' } });
    fireEvent.click(screen.getByTestId('pick-date'));
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '100' } });

    clickSalvarAcordo();

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const msgs = toastError.mock.calls.map(c => String(c[0]));
    expect(msgs.some(m => /já existe na sua lista/i.test(m))).toBe(true);
    expect(screen.queryByText(/Adicionar parcela ao acordo/i)).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('NR meu mas acordo não carregável: mantém o toast de bloqueio', async () => {
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'a-meu', operadorId: 'me-1', operadorNome: 'Eu Operador',
    });
    routes.acordosMaybeSingle = { data: null, error: null };

    renderInline({ onSaved });
    preencherMinimoBookplay('777');
    clickSalvarAcordo();

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const msgs = toastError.mock.calls.map(c => String(c[0]));
    expect(msgs.some(m => /já existe na sua lista/i.test(m))).toBe(true);

    expect(onSaved).not.toHaveBeenCalled();
    const insertCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'insert');
    expect(insertCall).toBeUndefined();
  });
});

describe('AcordoNovoInline — fluxo salvar() (CASO A — eu tenho a lógica)', () => {
  it('insere como EXTRA, atualiza acordo direto antigo e notifica o operador', async () => {
    isAtivoParaUsuarioMock.mockReturnValue(true);

    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'a-outro', operadorId: 'op-outro', operadorNome: 'Outro Op',
    });
    routes.perfisMaybeSingle = {
      data: { id: 'op-outro', nome: 'Outro Op', setor_id: 'sB', equipe_id: null, setores: { nome: 'Setor B' } },
      error: null,
    };
    routes.insertAcordo = {
      data: { id: 'novo-extra-1', tipo_vinculo: 'extra' } as Acordo,
      error: null,
    };

    renderInline({ onSaved });
    preencherMinimoBookplay('777');
    clickSalvarAcordo();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    // Insert na acordos com tipo_vinculo='extra' + vinculo_operador_id do outro.
    const insertCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'insert');
    expect(insertCall?.payload).toMatchObject({
      tipo_vinculo:          'extra',
      vinculo_operador_id:   'op-outro',
      vinculo_operador_nome: 'Outro Op',
    });

    // Update no acordo direto antigo para referenciar o EXTRA.
    const updateCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'update' && c.id === 'a-outro');
    expect(updateCall).toBeTruthy();
    expect(updateCall?.payload).toMatchObject({
      vinculo_operador_id:   'me-1',
      vinculo_operador_nome: 'Eu Operador',
    });

    // Notificação para o operador direto.
    expect(criarNotificacaoMock).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: 'op-outro',
      empresa_id: 'emp-1',
    }));

    // Toast de sucesso com texto "EXTRA".
    expect(toastSuccess).toHaveBeenCalled();
    const okMsgs = toastSuccess.mock.calls.map(c => String(c[0]));
    expect(okMsgs.some(m => /EXTRA/.test(m))).toBe(true);
  });
});

describe('AcordoNovoInline — fluxo salvar() (CASO B — só o outro tem a lógica)', () => {
  it('abre modal de aviso, não insere e não notifica', async () => {
    // Eu NÃO tenho a lógica, o outro TEM.
    isAtivoParaUsuarioMock.mockImplementation((userId: string) => userId === 'op-outro');
    fetchIsDiretoExtraAtivoMock.mockResolvedValue(true); // dono tem a lógica ativa

    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'a-outro', operadorId: 'op-outro', operadorNome: 'Outro Op',
    });
    routes.perfisMaybeSingle = {
      data: { id: 'op-outro', nome: 'Outro Op', setor_id: 'sB', equipe_id: null, setores: { nome: 'Setor B' } },
      error: null,
    };

    renderInline({ onSaved });
    preencherMinimoBookplay('777');
    clickSalvarAcordo();

    // O fluxo deve parar sem inserir — aguarda o modal.
    await waitFor(() => {
      expect(verificarNrRegistroMock).toHaveBeenCalled();
    });

    // Modal de aviso apareceu (ModalAvisoDiretoExtra).
    await waitFor(() => {
      expect(screen.getByText(/Vínculo detectado/i)).toBeInTheDocument();
    });

    // Nenhum insert ocorreu — só está aguardando o usuário confirmar.
    const insertCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'insert');
    expect(insertCall).toBeUndefined();
    expect(onSaved).not.toHaveBeenCalled();
    expect(criarNotificacaoMock).not.toHaveBeenCalled();
  });
});

describe('AcordoNovoInline — fluxo salvar() (CASO C — ninguém tem a lógica)', () => {
  it('abre modal de autorização do líder, não insere', async () => {
    isAtivoParaUsuarioMock.mockReturnValue(false);

    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'a-outro', operadorId: 'op-outro', operadorNome: 'Outro Op',
    });
    routes.perfisMaybeSingle = {
      data: { id: 'op-outro', nome: 'Outro Op', setor_id: null, equipe_id: null, setores: null },
      error: null,
    };

    renderInline({ onSaved });
    preencherMinimoBookplay('777');
    clickSalvarAcordo();

    await waitFor(() => expect(verificarNrRegistroMock).toHaveBeenCalled());

    // Nenhum insert — aguardando autorização do líder.
    const insertCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'insert');
    expect(insertCall).toBeUndefined();
    expect(onSaved).not.toHaveBeenCalled();

    // Modal de autorização do líder (ModalAutorizacaoNR) — texto distintivo:
    // "NR já agendado por outro operador".
    await waitFor(() => {
      expect(screen.getByText(/NR já agendado por outro operador/i)).toBeInTheDocument();
    });
  });
});

describe('AcordoNovoInline — cancelamento', () => {
  it('invoca onCancel ao clicar no X de fechar', () => {
    const onCancel = vi.fn();
    renderInline({ onCancel });
    // O botão "X" de fechar no cabeçalho usa ícone sem nome acessível — pegamos
    // via query por role + nome aria/label; alternativa: pegar o primeiro botão.
    // O componente renderiza um botão "ghost" com <X> no cabeçalho.
    const buttons = screen.getAllByRole('button');
    // Heurística: botão com innerHTML apenas do ícone X (sem texto) geralmente
    // está entre os primeiros. Clicar em TODOS os candidatos até ver onCancel.
    // Como é teste unitário, fazemos busca por aria-label (fallback) ou simplesmente
    // encontramos o botão com className que inclui "hover:text-destructive".
    const fechar = buttons.find(b =>
      b.className.includes('destructive') || b.getAttribute('aria-label') === 'Fechar',
    );
    if (fechar) {
      fireEvent.click(fechar);
      expect(onCancel).toHaveBeenCalled();
    }
  });
});

// ── #1 (extensão): persistência do rascunho em sessionStorage ──────────────
// Garante que o formulário não perde dados quando o componente é desmontado
// e remontado (simula trocar de aba → voltar à aba → parent re-render).
describe('AcordoNovoInline — persistência de rascunho', () => {
  it('preserva nomeCliente/nrCliente/valor entre unmount e remount', async () => {
    const { unmount } = renderInline();

    const nome = screen.getByPlaceholderText(/Nome completo/i) as HTMLInputElement;
    fireEvent.change(nome, { target: { value: 'João da Silva' } });
    const nr = screen.getByPlaceholderText(/Código do acordo/i) as HTMLInputElement;
    fireEvent.change(nr, { target: { value: '1234' } });
    const valor = screen.getByPlaceholderText('0,00') as HTMLInputElement;
    fireEvent.change(valor, { target: { value: '250,50' } });

    // Aguarda o requestAnimationFrame do useEffect de persistência rodar
    await waitFor(() => {
      const raw = sessionStorage.getItem('acordo-inline-draft::emp-1::me-1::bp');
      expect(raw).toBeTruthy();
      expect(raw).toContain('João da Silva');
    });

    // Simula desmontar (como ocorre quando o componente `{open && <Inline/>}`
    // fica false temporariamente por re-render do pai).
    unmount();

    // Remonta: os valores devem retornar do sessionStorage
    renderInline();

    expect((screen.getByPlaceholderText(/Nome completo/i) as HTMLInputElement).value).toBe('João da Silva');
    expect((screen.getByPlaceholderText(/Código do acordo/i) as HTMLInputElement).value).toBe('1234');
    expect((screen.getByPlaceholderText('0,00') as HTMLInputElement).value).toBe('250,50');
  });

  it('não restaura nada se o storage estiver vazio', () => {
    sessionStorage.clear();
    renderInline();
    expect((screen.getByPlaceholderText(/Nome completo/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByPlaceholderText(/Código do acordo/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByPlaceholderText('0,00') as HTMLInputElement).value).toBe('');
  });
});

// ── Fluxo analítico PP: acordo nasce no meio do plano ───────────────────────
describe('AcordoNovoInline — fluxo analítico PP (parcela 4/12)', () => {
  it('salva a parcela atual como paga e agenda a próxima automaticamente', async () => {
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue(null);
    routes.insertAcordo = {
      data: {
        id: 'a1', nome_cliente: 'Cliente X', nr_cliente: '', instituicao: 'INS-9',
        operador_id: 'me-1', empresa_id: 'emp-1', acordo_grupo_id: 'g1',
        tipo: 'boleto', parcelas: 12, valor_total: 2988, numero_parcela: 4,
      } as Acordo,
      error: null,
    };
    // Draft montado pelo ModalTabularAnalitico (valor TOTAL já calculado)
    sessionStorage.setItem('acordo-inline-draft::emp-1::me-1::pp', JSON.stringify({
      instituicao: 'INS-9', nomeCliente: 'Cliente X', tipo: 'boleto_pix',
      valorStr: '2988,00', vencimento: '2026-07-05', estadoSel: 'SP',
      status: 'pago', parcelasStr: '12', parcelaAtualStr: '4',
      quarentaPct: '', analitico: '1',
    }));

    renderInline({ onSaved, isPaguePlay: true });
    clickSalvarAcordo();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    const inserts = supabaseCalls.filter(c => c.table === 'acordos' && c.op === 'insert');
    expect(inserts.length).toBe(2);

    // Parcela atual: 4ª de 12, valor da parcela (2988/12), paga no dia do analítico
    expect(inserts[0].payload).toMatchObject({
      instituicao: 'INS-9', numero_parcela: 4, parcelas: 12,
      valor: 249, valor_total: 2988, status: 'pago',
      vencimento: '2026-07-05', data_pagamento: '2026-07-05',
    });
    // Próxima parcela: 5ª, pendente, último dia do mês seguinte
    expect(inserts[1].payload).toMatchObject({
      numero_parcela: 5, valor: 249, status: 'verificar_pendente',
      vencimento: '2026-08-31', acordo_grupo_id: 'g1',
    });

    const okMsgs = toastSuccess.mock.calls.map(c => String(c[0]));
    expect(okMsgs.some(m => /Próxima agendada/i.test(m))).toBe(true);
  });

  it('PaguePlay sem estado (UF): recusa antes de tocar no banco', async () => {
    // Pedido da diretoria (02/08/2026): não se tabula sem estado. O gatilho
    // `trg_acordos_exige_estado` recusa no banco; esta checagem existe para o
    // operador não perder o que digitou — e para o insert nem sair.
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue(null);
    routes.insertAcordo = { data: { id: 'nao-deve-existir' } as Acordo, error: null };

    renderInline({ onSaved, isPaguePlay: true });   // sem semearEstadoPP()
    fireEvent.change(screen.getByPlaceholderText(/Nome do profissional/i), { target: { value: 'Prof Z' } });
    fireEvent.change(screen.getByPlaceholderText(/^Código$/), { target: { value: 'INS-3' } });
    fireEvent.click(screen.getByTestId('pick-date'));
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '500' } });

    clickSalvarAcordo();

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const msgs = toastError.mock.calls.map(c => String(c[0]));
    expect(msgs.some(m => /estado \(UF\)/i.test(m))).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    expect(supabaseCalls.some(c => c.table === 'acordos' && c.op === 'insert')).toBe(false);
  });

  it('CPF no lugar do código: recusa antes de tocar no banco (BookPlay)', async () => {
    // Achado em 03/08/2026: um operador digitou o CPF do cliente no campo de
    // código. A diretoria já tinha decidido em 28/07 que nenhum CPF fica no
    // banco (20260728b), mas este campo é texto livre e ninguém olhava.
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue(null);
    routes.insertAcordo = { data: { id: 'nao-deve-existir' } as Acordo, error: null };

    renderInline({ onSaved });
    preencherMinimoBookplay('529.982.247-25');
    clickSalvarAcordo();

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/CPF/);
    expect(onSaved).not.toHaveBeenCalled();
    expect(supabaseCalls.some(c => c.table === 'acordos' && c.op === 'insert')).toBe(false);
  });

  it('CPF no código da PaguePlay também é recusado', async () => {
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue(null);
    routes.insertAcordo = { data: { id: 'nao-deve-existir' } as Acordo, error: null };

    semearEstadoPP();
    renderInline({ onSaved, isPaguePlay: true });
    fireEvent.change(screen.getByPlaceholderText(/Nome do profissional/i), { target: { value: 'Prof W' } });
    fireEvent.change(screen.getByPlaceholderText(/^Código$/), { target: { value: '52998224725' } });
    fireEvent.click(screen.getByTestId('pick-date'));
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '300' } });

    clickSalvarAcordo();

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    const msgs = toastError.mock.calls.map(c => String(c[0]));
    expect(msgs.some(m => /CPF/.test(m))).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    expect(supabaseCalls.some(c => c.table === 'acordos' && c.op === 'insert')).toBe(false);
  });

  it('código real de 8 dígitos NÃO é confundido com CPF', async () => {
    // A trava não pode bloquear trabalho legítimo: os códigos do ERP têm 7 ou
    // 8 dígitos e precisam continuar passando.
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue(null);
    routes.insertAcordo = { data: { id: 'ok-1' } as Acordo, error: null };

    renderInline({ onSaved });
    preencherMinimoBookplay('12904826');
    clickSalvarAcordo();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('BookPlay não exige estado — a regra é só da PaguePlay', async () => {
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue(null);
    routes.insertAcordo = { data: { id: 'bp-1' } as Acordo, error: null };

    renderInline({ onSaved });
    preencherMinimoBookplay('881');
    clickSalvarAcordo();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('fluxo manual PP (sem draft do analítico) continua criando só a parcela 1', async () => {
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue(null);
    routes.insertAcordo = { data: { id: 'a2' } as Acordo, error: null };

    semearEstadoPP();
    renderInline({ onSaved, isPaguePlay: true });
    const nomeCampo = screen.getByPlaceholderText(/Nome do profissional/i);
    fireEvent.change(nomeCampo, { target: { value: 'Prof Y' } });
    const codigo = screen.getByPlaceholderText(/^Código$/);
    fireEvent.change(codigo, { target: { value: 'INS-2' } });
    fireEvent.click(screen.getByTestId('pick-date'));
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '1200' } });

    clickSalvarAcordo();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    const inserts = supabaseCalls.filter(c => c.table === 'acordos' && c.op === 'insert');
    expect(inserts.length).toBe(1);
    expect(inserts[0].payload).toMatchObject({ numero_parcela: 1 });
  });
});
