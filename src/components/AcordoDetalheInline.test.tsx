/**
 * AcordoDetalheInline.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre o botão «Tornar vínculo direto» do detalhe.
 *
 * Desde 30/09/2026 a conversão é do SERVIDOR (`fn_tornar_direto`, migration
 * 20260930150000). O fluxo antigo apagava o DIRETO do colega pelo navegador,
 * e com a RLS de quem clica o DELETE afetava zero linhas sem erro. O que se
 * testa aqui é a TELA: quem vê o botão, o que a janela diz em cada caso
 * (manual, vinculado com autorizador, vinculado sem autorizador) e o que o
 * componente faz com a resposta — e que ele não escreve mais em `acordos`.
 *
 * Estratégia de mocks: mesma do AcordoNovoInline.test — Supabase com rotas
 * por tabela+operação, Dialog/Popover/Calendar inline, services stubados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Acordo } from '@/lib/supabase';

// Agora o SUT.
import { AcordoDetalheInline } from './AcordoDetalheInline';

// ── Mocks (ANTES do SUT) ────────────────────────────────────────────────────

// 1) o serviço que fala com o servidor
type Previa = {
  vinculado: boolean; donoId: string | null; donoNome: string | null;
  nrLabel: string; nrValor: string | null; souDono: boolean;
  souAutorizador: boolean; pedidoPendenteId: string | null;
};
const PREVIA_MANUAL: Previa = {
  vinculado: false, donoId: null, donoNome: null, nrLabel: 'NR', nrValor: '777',
  souDono: true, souAutorizador: false, pedidoPendenteId: null,
};
let previaValue: Previa | { erro: string } = PREVIA_MANUAL;
const previaMock = vi.fn(async () => previaValue);
const tornarDiretoMock = vi.fn();
vi.mock('@/services/tornarDireto.service', () => ({
  previaTornarDireto: () => previaMock(),
  tornarDireto:       (...a: unknown[]) => tornarDiretoMock(...a),
}));

// 2) hooks
let perfilValue: { id: string; nome: string; perfil?: string } | null = {
  id: 'me-1', nome: 'Eu Operador', perfil: 'operador',
};
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: perfilValue }),
}));

let empresaValue: { id: string } | null = { id: 'emp-1' };
// O registro no Pix depois de adicionar parcela recorrente tem teste próprio.
vi.mock('@/hooks/useRegistrarPixAoPagar', () => ({ useRegistrarPixAoPagar: () => vi.fn() }));
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: empresaValue }),
}));

// 3) Supabase — só registra o que o componente pede.
type R = { data: unknown; error: { message: string; code?: string } | null };

interface SupabaseCall { table: string; op: string; payload?: unknown; id?: unknown; filters: Array<[string, unknown]>; }
const supabaseCalls: SupabaseCall[] = [];

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const state: { op?: string; payload?: unknown; id?: unknown; filters: Array<[string, unknown]> } = { filters: [] };
    const terminal = async (kind: string): Promise<R> => {
      supabaseCalls.push({ table, op: state.op ?? kind, payload: state.payload, id: state.id, filters: [...state.filters] });
      return { data: state.op === 'select' ? [] : null, error: null };
    };
    const builder: Record<string, unknown> = {
      insert:      vi.fn((payload: unknown) => { state.op = 'insert'; state.payload = payload; return builder; }),
      update:      vi.fn((payload: unknown) => { state.op = 'update'; state.payload = payload; return builder; }),
      delete:      vi.fn(() => { state.op = 'delete'; return builder; }),
      select:      vi.fn(() => { state.op = state.op ?? 'select'; return builder; }),
      eq:          vi.fn((c: string, v: unknown) => { if (c === 'id') state.id = v; state.filters.push([c, v]); return builder; }),
      neq:         vi.fn((c: string, v: unknown) => { state.filters.push([`neq:${c}`, v]); return builder; }),
      order:       vi.fn(() => builder),
      single:      vi.fn(() => terminal('single')),
      maybeSingle: vi.fn(() => terminal('maybeSingle')),
      then:        (resolve: (v: R) => unknown) => terminal('noop').then(resolve),
    };
    return builder;
  };
  return { supabase: { from: vi.fn((t: string) => makeBuilder(t)) } };
});

// 4) toast
const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastInfo = vi.fn();
vi.mock('@/components/ui/sonner', () => ({
  toast: {
    error:   (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    info:    (...a: unknown[]) => toastInfo(...a),
    warning: vi.fn(),
  },
}));

// 5) alert nativo NÃO deve ser usado pelo componente.
const alertSpy = vi.fn();
vi.stubGlobal('alert', alertSpy);

// 6) framer-motion
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_t, prop: string) => (props: Record<string, unknown>) => {
    const Tag = prop as keyof JSX.IntrinsicElements;
    const { children, initial: _i, animate: _a, exit: _e, transition: _t2, ...rest } = props as Record<string, unknown>;
    return <Tag {...(rest as Record<string, unknown>)}>{children as React.ReactNode}</Tag>;
  } }),
}));

// 7) Dialog → inline visível quando open.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent:     ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader:      ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle:       ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter:      ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// 8) Select → inline.
vi.mock('@/components/ui/select', () => {
  const Select = ({ value, children }: { value?: string; children?: React.ReactNode }) => <div data-value={value}>{children}</div>;
  const Noop = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { Select, SelectContent: Noop, SelectItem: Noop, SelectTrigger: Noop, SelectValue: Noop };
});

// 9) DatePickerField → não precisamos interagir aqui.
vi.mock('@/components/DatePickerField', () => ({
  DatePickerField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="date" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeAcordoExtra(overrides: Partial<Acordo> = {}): Acordo {
  return {
    id: 'acordo-extra-1',
    nome_cliente: 'Cliente Teste',
    nr_cliente: '777',
    instituicao: null,
    vencimento: '2026-05-10',
    valor: 100,
    tipo: 'pix',
    parcelas: 1,
    whatsapp: null,
    observacoes: null,
    status: 'pago',
    operador_id: 'me-1', // sou o dono do extra
    tipo_vinculo: 'extra',
    vinculo_operador_id: 'op-direto',
    vinculo_operador_nome: 'Operador Direto',
    empresa_id: 'emp-1',
    perfis: { id: 'me-1', nome: 'Eu Operador', email: 'eu@x.com', perfil: 'operador' } as unknown as Acordo['perfis'],
    numero_parcela: 1,
    acordo_grupo_id: 'grupo-1',
    ...overrides,
  } as unknown as Acordo;
}

function renderDetalhe(props: Partial<React.ComponentProps<typeof AcordoDetalheInline>> = {}) {
  const acordo = props.acordo ?? makeAcordoExtra();
  return render(
    <table><tbody>
      <AcordoDetalheInline
        acordo={acordo}
        isPaguePlay={props.isPaguePlay ?? false}
        colSpan={props.colSpan ?? 10}
        onClose={props.onClose ?? vi.fn()}
        onSaved={props.onSaved}
        onAcordoRemovido={props.onAcordoRemovido}
      />
    </tbody></table>,
  );
}

/** O componente não escreve mais em `acordos` para mudar o vínculo. */
function semEscritaEmAcordos() {
  expect(supabaseCalls.filter(c => c.table === 'acordos' && (c.op === 'update' || c.op === 'delete')))
    .toEqual([]);
}

/** Clica no botão da janela quando a prévia já chegou (ele nasce desabilitado). */
async function confirmarNaJanela(rotulo: RegExp) {
  const botao = await screen.findByRole('button', { name: rotulo });
  await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(botao);
}

function abrirJanela() {
  fireEvent.click(screen.getByRole('button', { name: /Tornar vínculo direto/i }));
}

beforeEach(() => {
  previaMock.mockClear();
  tornarDiretoMock.mockReset();
  previaValue = PREVIA_MANUAL;
  toastError.mockReset();
  toastSuccess.mockReset();
  toastInfo.mockReset();
  alertSpy.mockReset();
  supabaseCalls.length = 0;
  perfilValue = { id: 'me-1', nome: 'Eu Operador', perfil: 'operador' };
  empresaValue = { id: 'emp-1' };
});

// ── Testes ──────────────────────────────────────────────────────────────────

describe('AcordoDetalheInline — quem vê o botão', () => {
  it('renderiza badge "Extra" quando tipo_vinculo=extra', () => {
    renderDetalhe();
    expect(screen.getByText('Extra')).toBeInTheDocument();
  });

  it('o dono do Extra vê «Tornar vínculo direto»', () => {
    renderDetalhe();
    expect(screen.getByRole('button', { name: /Tornar vínculo direto/i })).toBeInTheDocument();
  });

  it('operador que não é o dono NÃO vê o botão', () => {
    renderDetalhe({ acordo: makeAcordoExtra({ operador_id: 'outro-id' }) });
    expect(screen.queryByRole('button', { name: /Tornar vínculo direto/i })).toBeNull();
  });

  it('quem enxerga a operação vê o botão no acordo de outra pessoa', () => {
    perfilValue = { id: 'me-1', nome: 'Admin', perfil: 'administrador' };
    renderDetalhe({ acordo: makeAcordoExtra({ operador_id: 'outro-id' }) });
    expect(screen.getByRole('button', { name: /Tornar vínculo direto/i })).toBeInTheDocument();
  });

  it('acordo DIRETO não tem o botão', () => {
    renderDetalhe({ acordo: makeAcordoExtra({ tipo_vinculo: 'direto' }) });
    expect(screen.queryByText('Extra')).toBeNull();
    expect(screen.queryByRole('button', { name: /Tornar vínculo direto/i })).toBeNull();
  });
});

describe('AcordoDetalheInline — Extra manual', () => {
  it('pergunta se tem certeza e vira DIRETO sem tirar de ninguém', async () => {
    tornarDiretoMock.mockResolvedValue({
      ok: true, resultado: 'convertido', vinculado: false, donoAnterior: null, diretoRemovidoId: null,
    });
    const onSaved = vi.fn();
    const onAcordoRemovido = vi.fn();
    renderDetalhe({ onSaved, onAcordoRemovido });

    abrirJanela();
    expect(await screen.findByText(/sem vínculo com outra/i)).toBeInTheDocument();
    expect(screen.getByText(/Tem certeza/i)).toBeInTheDocument();

    await confirmarNaJanela(/^Tornar Direto$/i);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(tornarDiretoMock).toHaveBeenCalledWith('acordo-extra-1');
    expect(onSaved.mock.calls[0][0]).toMatchObject({
      tipo_vinculo: 'direto', vinculo_operador_id: null, vinculo_operador_nome: null,
    });
    expect(onAcordoRemovido).not.toHaveBeenCalled();
    semEscritaEmAcordos();
  });

  it('cancelar não chama o servidor', async () => {
    renderDetalhe();
    abrirJanela();
    await screen.findByText(/sem vínculo com outra/i);
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(tornarDiretoMock).not.toHaveBeenCalled();
    semEscritaEmAcordos();
  });
});

describe('AcordoDetalheInline — Extra vinculado', () => {
  const PREVIA_VINCULADO: Previa = {
    vinculado: true, donoId: 'op-direto', donoNome: 'Operador Direto', nrLabel: 'NR', nrValor: '777',
    souDono: true, souAutorizador: false, pedidoPendenteId: null,
  };

  it('sem a chave de autorizar: vira pedido ao líder e o acordo continua EXTRA', async () => {
    previaValue = PREVIA_VINCULADO;
    tornarDiretoMock.mockResolvedValue({ ok: true, resultado: 'pedido', repetido: false });
    const onSaved = vi.fn();
    renderDetalhe({ onSaved });

    abrirJanela();
    expect(await screen.findByText(/Precisa da autorização do líder/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Operador Direto/).length).toBeGreaterThan(0);

    await confirmarNaJanela(/Solicitar autorização/i);

    await waitFor(() => expect(toastInfo).toHaveBeenCalled());
    expect(String(toastInfo.mock.calls[0][0])).toMatch(/Pedido enviado/i);
    expect(onSaved).not.toHaveBeenCalled();
    semEscritaEmAcordos();
  });

  it('pedido já em análise: não oferece pedir de novo', async () => {
    previaValue = { ...PREVIA_VINCULADO, pedidoPendenteId: 'ped-1' };
    renderDetalhe();
    abrirJanela();
    expect(await screen.findByText(/Já existe um pedido seu em análise/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Solicitar autorização/i })).toBeNull();
  });

  it('quem já autoriza: executa na hora e a linha do DIRETO antigo sai da lista', async () => {
    perfilValue = { id: 'me-1', nome: 'Líder', perfil: 'lider' };
    previaValue = { ...PREVIA_VINCULADO, souAutorizador: true };
    tornarDiretoMock.mockResolvedValue({
      ok: true, resultado: 'convertido', vinculado: true,
      donoAnterior: 'Operador Direto', diretoRemovidoId: 'a-direto-antigo',
    });
    const onSaved = vi.fn();
    const onAcordoRemovido = vi.fn();
    renderDetalhe({ onSaved, onAcordoRemovido });

    abrirJanela();
    expect(await screen.findByText(/Você pode autorizar esta mudança/i)).toBeInTheDocument();
    await confirmarNaJanela(/^Tornar Direto$/i);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onAcordoRemovido).toHaveBeenCalledWith('a-direto-antigo');
    expect(String(toastSuccess.mock.calls[0][0])).toMatch(/Operador Direto foi notificado/);
    semEscritaEmAcordos();
  });

  it('erro do servidor: mostra a mensagem e não muda nada na tela', async () => {
    tornarDiretoMock.mockResolvedValue({ ok: false, erro: 'Você não tem permissão para mudar o vínculo deste acordo.' });
    const onSaved = vi.fn();
    renderDetalhe({ onSaved });

    abrirJanela();
    await confirmarNaJanela(/^Tornar Direto$/i);

    expect(await screen.findByText(/não tem permissão/i)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
