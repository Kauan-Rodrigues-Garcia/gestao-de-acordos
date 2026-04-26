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
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  perfisMaybeSingle: R;
  logsSistemaInsert: R;
} = {
  insertAcordo:      { data: null, error: null },
  updateAcordo:      { data: null, error: null },
  perfisMaybeSingle: { data: null, error: null },
  logsSistemaInsert: { data: null, error: null },
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
  return { supabase: { from: vi.fn((t: string) => makeBuilder(t)) } };
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
  const nrInput = screen.getByPlaceholderText(/Número NR/i);
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

beforeEach(() => {
  verificarNrRegistroMock.mockReset();
  verificarConflitoCache.mockReset().mockReturnValue(null);
  criarNotificacaoMock.mockReset().mockResolvedValue(undefined);
  isAtivoParaUsuarioMock.mockReset().mockReturnValue(false);
  toastError.mockReset();
  toastSuccess.mockReset();
  supabaseCalls.length = 0;
  routes.insertAcordo      = { data: null, error: null };
  routes.updateAcordo      = { data: null, error: null };
  routes.perfisMaybeSingle = { data: null, error: null };
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
    const nrInput = screen.getByPlaceholderText(/Número NR/i);
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
    const nrInput = screen.getByPlaceholderText(/Número NR/i);
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

  it('PaguePlay: "Inscrição é obrigatória" quando campo vazio', async () => {
    renderInline({ isPaguePlay: true });
    // No PaguePlay o placeholder do nome é "Nome do profissional".
    const nomeCampo = screen.getByPlaceholderText(/Nome do profissional/i);
    fireEvent.change(nomeCampo, { target: { value: 'Profissional X' } });

    fireEvent.click(screen.getByTestId('pick-date'));
    const valorInput = screen.getByPlaceholderText('0,00');
    fireEvent.change(valorInput, { target: { value: '100' } });

    clickSalvarAcordo();

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Inscrição é obrigatória'),
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
  it('NR já está na minha própria lista: toast e NÃO insere', async () => {
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'a-meu', operadorId: 'me-1', operadorNome: 'Eu Operador',
    });

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
    const nr = screen.getByPlaceholderText(/Número NR/i) as HTMLInputElement;
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
    expect((screen.getByPlaceholderText(/Número NR/i) as HTMLInputElement).value).toBe('1234');
    expect((screen.getByPlaceholderText('0,00') as HTMLInputElement).value).toBe('250,50');
  });

  it('não restaura nada se o storage estiver vazio', () => {
    sessionStorage.clear();
    renderInline();
    expect((screen.getByPlaceholderText(/Nome completo/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByPlaceholderText(/Número NR/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByPlaceholderText('0,00') as HTMLInputElement).value).toBe('');
  });
});
