/**
 * AcordoDetalheInline.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre o fluxo de CONVERSÃO Extra → Direto, que foi o bug mais grave
 * já corrigido neste projeto (bug do campo "inscricao" inexistente em
 * AcordoDetalheInline — o SELECT retornava null, o acordo direto original
 * NUNCA era removido → tabulações duplicadas orgânicas).
 *
 * Cenários cobertos:
 *  (a) Usuário privilegiado (admin) + acordo Extra + par direto existente
 *      → deleta direto antigo, atualiza extra p/ direto, notifica antigo,
 *        transfere nr_registros, libera registro antigo.
 *  (b) Usuário privilegiado + par direto NÃO encontrado → atualiza somente
 *      este (promove Extra órfão) sem notificar/deletar.
 *  (c) Usuário comum (operador) → precisa de autorização, modal mostra
 *      campos de e-mail/senha (mas não prosseguimos a autenticação aqui —
 *      apenas verificamos que os campos aparecem, confirmando o estado
 *      `precisaAutorizacao=true`).
 *  (d) Cancelar o modal sem confirmar → nenhum efeito lateral.
 *  (e) Chave de vínculo vazia → alerta e não faz nada.
 *
 * Estratégia de mocks: mesma do AcordoNovoInline.test — Supabase com rotas
 * por tabela+operação, Dialog/Popover/Calendar inline, services stubados.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Acordo } from '@/lib/supabase';

// ── Mocks (ANTES do SUT) ────────────────────────────────────────────────────

// 1) nr_registros.service
const transferirNrMock = vi.fn().mockResolvedValue({ ok: true });
const liberarNrPorAcordoIdMock = vi.fn().mockResolvedValue({ ok: true });
vi.mock('@/services/nr_registros.service', () => ({
  verificarNrRegistro:  vi.fn().mockResolvedValue(null),
  registrarNr:          vi.fn().mockResolvedValue({ ok: true }),
  transferirNr:         (...a: unknown[]) => transferirNrMock(...a),
  liberarNr:            vi.fn().mockResolvedValue({ ok: true }),
  liberarNrPorAcordoId: (...a: unknown[]) => liberarNrPorAcordoIdMock(...a),
}));

// 2) notificações
const criarNotificacaoMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/services/notificacoes.service', () => ({
  criarNotificacao: (...a: unknown[]) => criarNotificacaoMock(...a),
}));

// 3) hooks
let perfilValue: { id: string; nome: string; perfil?: string } | null = {
  id: 'me-1',
  nome: 'Eu Operador',
  perfil: 'administrador', // privilegiado por padrão → não precisa autorização
};
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ perfil: perfilValue }),
}));

let empresaValue: { id: string } | null = { id: 'emp-1' };
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: empresaValue }),
}));

// 4) Supabase
type R = { data: unknown; error: { message: string; code?: string } | null };

const routes: {
  selectAcordoDiretoOriginal: R;
  deleteAcordo: R;
  updateAcordo: R;
  selectGrupoParcelas: R;
} = {
  selectAcordoDiretoOriginal: { data: null, error: null },
  deleteAcordo:               { data: null, error: null },
  updateAcordo:               { data: null, error: null },
  selectGrupoParcelas:        { data: [], error: null },
};

interface SupabaseCall { table: string; op: string; payload?: unknown; id?: unknown; filters: Array<[string, unknown]>; }
const supabaseCalls: SupabaseCall[] = [];

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const state: { op?: string; payload?: unknown; id?: unknown; filters: Array<[string, unknown]> } = { filters: [] };
    const terminal = async (kind: string): Promise<R> => {
      supabaseCalls.push({ table, op: state.op ?? kind, payload: state.payload, id: state.id, filters: [...state.filters] });
      // Matriz de rotas.
      if (table === 'acordos' && state.op === 'delete') return routes.deleteAcordo;
      if (table === 'acordos' && state.op === 'update') return routes.updateAcordo;
      if (table === 'acordos' && state.op === 'select') {
        // Diferencia entre "buscar par direto" vs "buscar grupo de parcelas".
        const hasTipoVinculo = state.filters.some(([c]) => c === 'tipo_vinculo');
        if (hasTipoVinculo) return routes.selectAcordoDiretoOriginal;
        return routes.selectGrupoParcelas;
      }
      return { data: null, error: null };
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

// 5) toast
const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock('@/components/ui/sonner', () => ({
  toast: {
    error:   (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    warning: vi.fn(),
  },
}));

// 6) alert nativo NAO deve mais ser usado pelo componente (migrado para toast).
//    Mantemos um spy apenas para garantir que ninguem voltou a chamá-lo.
const alertSpy = vi.fn();
vi.stubGlobal('alert', alertSpy);

// 7) framer-motion
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: (_t, prop: string) => (props: Record<string, unknown>) => {
    const Tag = prop as keyof JSX.IntrinsicElements;
    const { children, initial: _i, animate: _a, exit: _e, transition: _t2, ...rest } = props as Record<string, unknown>;
    return <Tag {...(rest as Record<string, unknown>)}>{children as React.ReactNode}</Tag>;
  } }),
}));

// 8) Dialog → inline visível quando open.
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent:     ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader:      ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle:       ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogFooter:      ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// 9) Select → inline.
vi.mock('@/components/ui/select', () => {
  const Select = ({ value, children }: { value?: string; children?: React.ReactNode }) => <div data-value={value}>{children}</div>;
  const Noop = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { Select, SelectContent: Noop, SelectItem: Noop, SelectTrigger: Noop, SelectValue: Noop };
});

// 10) DatePickerField → não precisamos interagir aqui.
vi.mock('@/components/DatePickerField', () => ({
  DatePickerField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="date" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

// Agora o SUT.
import { AcordoDetalheInline } from './AcordoDetalheInline';

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
    perfis: { id: 'me-1', nome: 'Eu Operador', email: 'eu@x.com', perfil: 'administrador' } as unknown as Acordo['perfis'],
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

beforeEach(() => {
  transferirNrMock.mockReset().mockResolvedValue({ ok: true });
  liberarNrPorAcordoIdMock.mockReset().mockResolvedValue({ ok: true });
  criarNotificacaoMock.mockReset().mockResolvedValue(undefined);
  toastError.mockReset();
  toastSuccess.mockReset();
  alertSpy.mockReset();
  supabaseCalls.length = 0;
  routes.selectAcordoDiretoOriginal = { data: null, error: null };
  routes.deleteAcordo                = { data: null, error: null };
  routes.updateAcordo                = { data: null, error: null };
  routes.selectGrupoParcelas         = { data: [], error: null };
  perfilValue = { id: 'me-1', nome: 'Eu Operador', perfil: 'administrador' };
  empresaValue = { id: 'emp-1' };
});

// ── Testes ──────────────────────────────────────────────────────────────────

describe('AcordoDetalheInline — exibição', () => {
  it('renderiza badge "Extra" quando tipo_vinculo=extra', () => {
    renderDetalhe();
    expect(screen.getByText('Extra')).toBeInTheDocument();
  });

  it('renderiza botão "Acordo direto" apenas se sou o dono do Extra', () => {
    renderDetalhe();
    expect(screen.getByRole('button', { name: /Acordo direto/i })).toBeInTheDocument();
  });

  it('NÃO renderiza botão "Acordo direto" quando não sou o dono', () => {
    const acordo = makeAcordoExtra({ operador_id: 'outro-id' });
    renderDetalhe({ acordo });
    expect(screen.queryByRole('button', { name: /Acordo direto/i })).toBeNull();
  });

  it('NÃO renderiza botão "Acordo direto" se tipo_vinculo != extra', () => {
    const acordo = makeAcordoExtra({ tipo_vinculo: 'direto' });
    renderDetalhe({ acordo });
    expect(screen.queryByText('Extra')).toBeNull();
    expect(screen.queryByRole('button', { name: /Acordo direto/i })).toBeNull();
  });
});

describe('AcordoDetalheInline — modal Extra → Direto (abertura/cancelamento)', () => {
  it('abre modal ao clicar em "Acordo direto" mostrando mensagem e botão confirmar', async () => {
    renderDetalhe();

    fireEvent.click(screen.getByRole('button', { name: /Acordo direto/i }));

    await waitFor(() => {
      expect(screen.getByText(/Tornar este acordo DIRETO/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Tornar Direto/i })).toBeInTheDocument();
    // Como sou administrador, não deve pedir autorização.
    expect(screen.queryByText(/E-mail do Líder/i)).toBeNull();
  });

  it('usuário comum vê campos de e-mail/senha do líder (precisaAutorizacao=true)', async () => {
    perfilValue = { id: 'me-1', nome: 'Eu Operador', perfil: 'operador' };
    renderDetalhe();

    fireEvent.click(screen.getByRole('button', { name: /Acordo direto/i }));

    await waitFor(() => {
      expect(screen.getByText(/E-mail do Líder/i)).toBeInTheDocument();
    });
    // O botão fica desabilitado até preencher as credenciais.
    const botao = screen.getByRole('button', { name: /Tornar Direto/i }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
  });

  it('cancela o modal sem disparar efeitos', async () => {
    renderDetalhe();

    fireEvent.click(screen.getByRole('button', { name: /Acordo direto/i }));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));

    // Modal deve sumir.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Nenhuma chamada no banco ou services.
    expect(transferirNrMock).not.toHaveBeenCalled();
    expect(criarNotificacaoMock).not.toHaveBeenCalled();
    const deleteCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'delete');
    expect(deleteCall).toBeUndefined();
  });
});

describe('AcordoDetalheInline — fluxo Extra → Direto (com par direto existente)', () => {
  it('deleta acordo direto antigo, atualiza extra → direto, notifica, transfere e libera nr_registros', async () => {
    // Acordo direto "pai" existe.
    routes.selectAcordoDiretoOriginal = {
      data: {
        id: 'a-direto-antigo',
        operador_id: 'op-direto',
        nr_cliente: '777',
        tipo_vinculo: 'direto',
      },
      error: null,
    };
    // Update do extra → direto retorna o acordo atualizado.
    routes.updateAcordo = {
      data: {
        id: 'acordo-extra-1',
        tipo_vinculo: 'direto',
        vinculo_operador_id: null,
        vinculo_operador_nome: null,
      } as Acordo,
      error: null,
    };

    const onSaved = vi.fn();
    const onAcordoRemovido = vi.fn();
    renderDetalhe({ onSaved, onAcordoRemovido });

    fireEvent.click(screen.getByRole('button', { name: /Acordo direto/i }));
    await waitFor(() => screen.getByRole('button', { name: /Tornar Direto/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tornar Direto/i }));

    // Aguarda o fluxo assíncrono terminar.
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    // 1) SELECT no par direto foi feito com filtros corretos.
    const selectPar = supabaseCalls.find(c =>
      c.table === 'acordos' && c.op === 'select' &&
      c.filters.some(f => f[0] === 'tipo_vinculo' && f[1] === 'direto'),
    );
    expect(selectPar).toBeTruthy();
    // Filtros: empresa_id + nr_cliente (chave de vínculo no Bookplay).
    expect(selectPar?.filters).toContainEqual(['empresa_id', 'emp-1']);
    expect(selectPar?.filters).toContainEqual(['nr_cliente', '777']);

    // 2) DELETE no acordo direto antigo.
    const deleteCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'delete' && c.id === 'a-direto-antigo');
    expect(deleteCall).toBeTruthy();

    // 3) Notificação ao operador antigo.
    expect(criarNotificacaoMock).toHaveBeenCalledWith(expect.objectContaining({
      usuario_id: 'op-direto',
      empresa_id: 'emp-1',
    }));

    // 4) UPDATE do extra → direto (limpando vínculo).
    const updateCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'update' && c.id === 'acordo-extra-1');
    expect(updateCall?.payload).toMatchObject({
      tipo_vinculo:          'direto',
      vinculo_operador_id:   null,
      vinculo_operador_nome: null,
    });

    // 5) transferirNr chamado com os argumentos corretos.
    expect(transferirNrMock).toHaveBeenCalledWith(expect.objectContaining({
      empresaId:      'emp-1',
      nrValue:        '777',
      campo:          'nr_cliente',
      novoOperadorId: 'me-1',
      novoAcordoId:   'acordo-extra-1',
    }));

    // 6) liberarNrPorAcordoId limpa o registro órfão do acordo antigo.
    expect(liberarNrPorAcordoIdMock).toHaveBeenCalledWith('a-direto-antigo');

    // 7) Callbacks do pai.
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onAcordoRemovido).toHaveBeenCalledWith('a-direto-antigo');
  });

  it('PaguePlay: usa campo "instituicao" como chave de vínculo', async () => {
    const acordo = makeAcordoExtra({
      instituicao: 'INS-999',
      nr_cliente: 'cpf-xxx', // em PaguePlay nr_cliente é CPF, não a chave
    });
    routes.selectAcordoDiretoOriginal = {
      data: { id: 'a-direto-antigo', operador_id: 'op-direto' },
      error: null,
    };
    routes.updateAcordo = {
      data: { id: 'acordo-extra-1', tipo_vinculo: 'direto' } as Acordo,
      error: null,
    };

    renderDetalhe({ acordo, isPaguePlay: true });

    fireEvent.click(screen.getByRole('button', { name: /Acordo direto/i }));
    await waitFor(() => screen.getByRole('button', { name: /Tornar Direto/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tornar Direto/i }));

    await waitFor(() => expect(transferirNrMock).toHaveBeenCalled());

    // O select do par direto deve filtrar por `instituicao`, não nr_cliente.
    const selectPar = supabaseCalls.find(c =>
      c.table === 'acordos' && c.op === 'select' &&
      c.filters.some(f => f[0] === 'tipo_vinculo' && f[1] === 'direto'),
    );
    expect(selectPar?.filters).toContainEqual(['instituicao', 'INS-999']);

    // transferirNr deve ter recebido o campo 'instituicao'.
    expect(transferirNrMock).toHaveBeenCalledWith(expect.objectContaining({
      campo:   'instituicao',
      nrValue: 'INS-999',
    }));
  });
});

describe('AcordoDetalheInline — fluxo Extra → Direto (sem par direto)', () => {
  it('par direto não encontrado: promove extra→direto sem deletar nem notificar', async () => {
    routes.selectAcordoDiretoOriginal = { data: null, error: null }; // não existe par
    routes.updateAcordo = {
      data: { id: 'acordo-extra-1', tipo_vinculo: 'direto' } as Acordo,
      error: null,
    };

    const onSaved = vi.fn();
    const onAcordoRemovido = vi.fn();
    renderDetalhe({ onSaved, onAcordoRemovido });

    fireEvent.click(screen.getByRole('button', { name: /Acordo direto/i }));
    await waitFor(() => screen.getByRole('button', { name: /Tornar Direto/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tornar Direto/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));

    // DELETE não ocorre.
    const deleteCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'delete');
    expect(deleteCall).toBeUndefined();

    // Notificação não ocorre (nada a notificar).
    expect(criarNotificacaoMock).not.toHaveBeenCalled();

    // liberarNrPorAcordoId não é chamado (não havia registro antigo órfão).
    expect(liberarNrPorAcordoIdMock).not.toHaveBeenCalled();

    // Mas UPDATE + transferirNr ainda ocorrem.
    const updateCall = supabaseCalls.find(c => c.table === 'acordos' && c.op === 'update');
    expect(updateCall?.payload).toMatchObject({ tipo_vinculo: 'direto' });
    expect(transferirNrMock).toHaveBeenCalled();

    // onAcordoRemovido NÃO é chamado (não houve direto a remover).
    expect(onAcordoRemovido).not.toHaveBeenCalled();
  });
});

describe('AcordoDetalheInline — validações defensivas', () => {
  it('chave de vínculo vazia: alerta e não prossegue', async () => {
    const acordo = makeAcordoExtra({
      nr_cliente: '   ', // whitespace
      instituicao: null,
    });
    renderDetalhe({ acordo });

    fireEvent.click(screen.getByRole('button', { name: /Acordo direto/i }));
    await waitFor(() => screen.getByRole('button', { name: /Tornar Direto/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tornar Direto/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls[0][0]).toMatch(/chave de vínculo vazia/i);
    // Regressão anti-alert: o componente deve usar toast, não alert nativo.
    expect(alertSpy).not.toHaveBeenCalled();

    // Nenhuma ação no banco.
    expect(supabaseCalls.length).toBe(0);
    expect(transferirNrMock).not.toHaveBeenCalled();
  });

  it('erro no UPDATE: alerta e aborta', async () => {
    routes.selectAcordoDiretoOriginal = { data: null, error: null };
    routes.updateAcordo = { data: null, error: { message: 'RLS denied', code: '42501' } };

    const onSaved = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderDetalhe({ onSaved });

    fireEvent.click(screen.getByRole('button', { name: /Acordo direto/i }));
    await waitFor(() => screen.getByRole('button', { name: /Tornar Direto/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tornar Direto/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(toastError.mock.calls.some(c => /Erro ao converter/i.test(String(c[0])))).toBe(true);
    expect(alertSpy).not.toHaveBeenCalled();

    // onSaved não deve ser chamado.
    expect(onSaved).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
