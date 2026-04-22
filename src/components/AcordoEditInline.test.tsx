/**
 * AcordoEditInline.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Teste de integração focado no CORAÇÃO deste componente: o bloqueio de
 * NR/Inscrição duplicado durante a edição e a sincronização pós-update
 * com nr_registros.
 *
 * Regressão que este arquivo protege:
 *  • "Ao editar um acordo mudando a chave para um valor já usado, a edição
 *     era salva e criava tabulação duplicada" → corrigido invocando
 *     verificarNrRegistro(valor, empresa, campo, acordoIdExcluir).
 *  • "Extras sendo registrados como titulares no nr_registros" → corrigido
 *     pulando registrarNr quando tipo_vinculo==='extra'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Acordo } from '@/lib/supabase';

// ── Mocks que DEVEM ir antes do import do SUT ───────────────────────────────

// 1) nr_registros.service — spies com implementação controlável por teste.
const verificarNrRegistroMock = vi.fn();
const registrarNrMock = vi.fn();
vi.mock('@/services/nr_registros.service', () => ({
  verificarNrRegistro: (...a: unknown[]) => verificarNrRegistroMock(...a),
  registrarNr:         (...a: unknown[]) => registrarNrMock(...a),
}));

// 2) Supabase — builder chainable terminando em .single() thenable.
let nextSingleResult: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};
const updateCalls: Array<{ table: string; payload: unknown; id?: unknown }> = [];

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const state: { payload?: unknown; id?: unknown } = {};
    const builder: Record<string, unknown> = {
      update: vi.fn((payload: unknown) => {
        state.payload = payload;
        return builder;
      }),
      eq: vi.fn((col: string, val: unknown) => {
        if (col === 'id') state.id = val;
        return builder;
      }),
      select: vi.fn(() => builder),
      single: vi.fn(async () => {
        updateCalls.push({ table, payload: state.payload, id: state.id });
        return nextSingleResult;
      }),
    };
    return builder;
  };
  return {
    supabase: {
      from: vi.fn((t: string) => makeBuilder(t)),
    },
  };
});

// 3) useEmpresa — controlável por teste.
let empresaValue: { id: string } | null = { id: 'emp-1' };
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: empresaValue }),
}));

// 4) toast do sonner — spies.
const toastError = vi.fn();
const toastSuccess = vi.fn();
const toastWarning = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error:   (...a: unknown[]) => toastError(...a),
    success: (...a: unknown[]) => toastSuccess(...a),
    warning: (...a: unknown[]) => toastWarning(...a),
  },
}));

// 5) framer-motion — evita warnings e animation no teste.
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    { get: (_t, prop: string) => (props: Record<string, unknown>) => {
        const Tag = prop as keyof JSX.IntrinsicElements;
        const { children, initial: _i, animate: _a, exit: _e, transition: _t2, ...rest } = props as Record<string, unknown>;
        return <Tag {...(rest as Record<string, unknown>)}>{children as React.ReactNode}</Tag>;
      },
    },
  ),
}));

// 6) DatePickerField — componente leve (evita dep de calendário).
vi.mock('@/components/DatePickerField', () => ({
  DatePickerField: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) => (
    <div>
      <label>{label ?? 'Vencimento'}</label>
      <input aria-label="vencimento" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  ),
}));

// Agora sim, o SUT.
import { AcordoEditInline } from './AcordoEditInline';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeAcordo(overrides: Partial<Acordo> = {}): Acordo {
  return {
    id: 'acordo-1',
    nome_cliente: 'João Teste',
    nr_cliente: '777',
    instituicao: '',
    vencimento: '2026-05-10',
    valor: 100,
    tipo: 'pix',
    parcelas: 1,
    whatsapp: '',
    observacoes: '',
    status: 'pago',
    operador_id: 'op-1',
    tipo_vinculo: 'direto',
    empresa_id: 'emp-1',
    ...overrides,
  } as unknown as Acordo;
}

beforeEach(() => {
  verificarNrRegistroMock.mockReset();
  registrarNrMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  toastWarning.mockReset();
  updateCalls.length = 0;
  nextSingleResult = { data: null, error: null };
  empresaValue = { id: 'emp-1' };
});

function clickSalvar() {
  const btn = screen.getByRole('button', { name: /salvar/i });
  fireEvent.click(btn);
}

/**
 * Envelopa o SUT em <table><tbody> para evitar `validateDOMNesting`.
 * O componente é um <tr>, que só é válido dentro de um <tbody>.
 */
function renderInline(element: React.ReactElement) {
  return render(
    <table><tbody>{element}</tbody></table>,
  );
}

// ── Cenários ────────────────────────────────────────────────────────────────

describe('AcordoEditInline — bloqueio NR/Inscrição duplicado', () => {
  it('(a) edição SEM mudar a chave NR NÃO chama verificarNrRegistro e salva normal', async () => {
    const acordo = makeAcordo({ nr_cliente: '777' });
    const onSaved = vi.fn();
    nextSingleResult = { data: { ...acordo, perfis: { nome: 'Op Teste' } }, error: null };

    renderInline(<AcordoEditInline acordo={acordo} onSaved={onSaved} onCancel={vi.fn()} />);

    clickSalvar();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(verificarNrRegistroMock).not.toHaveBeenCalled();
    // Também não chama registrarNr porque a chave não mudou.
    expect(registrarNrMock).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalledWith('Acordo atualizado!');
  });

  it('(b) edição mudando NR para valor JÁ OCUPADO bloqueia com toast e não salva', async () => {
    const acordo = makeAcordo({ nr_cliente: '777' });
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'outro', operadorId: 'op2', operadorNome: 'Maria',
    });

    renderInline(<AcordoEditInline acordo={acordo} onSaved={onSaved} onCancel={vi.fn()} />);

    // Muda o NR para um já ocupado.
    const nrInput = screen.getByPlaceholderText('000.000.000-00') as HTMLInputElement;
    fireEvent.change(nrInput, { target: { value: '888' } });

    clickSalvar();

    await waitFor(() => expect(verificarNrRegistroMock).toHaveBeenCalledTimes(1));
    expect(verificarNrRegistroMock).toHaveBeenCalledWith('888', 'emp-1', 'nr_cliente', 'acordo-1');
    expect(toastError).toHaveBeenCalled();
    // Mensagem de bloqueio deve mencionar o operador ocupante e NR.
    const [msg] = toastError.mock.calls[0];
    expect(msg).toMatch(/Maria/);
    expect(msg).toMatch(/888/);

    expect(onSaved).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(0);
    expect(registrarNrMock).not.toHaveBeenCalled();
  });

  it('(c) edição mudando NR para valor LIVRE salva e sincroniza nr_registros (acordo direto)', async () => {
    const acordo = makeAcordo({ nr_cliente: '777', tipo_vinculo: 'direto' });
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue(null); // livre
    registrarNrMock.mockResolvedValue({ ok: true });
    nextSingleResult = {
      data: { ...acordo, nr_cliente: '888', perfis: { nome: 'Op Teste' } },
      error: null,
    };

    renderInline(<AcordoEditInline acordo={acordo} onSaved={onSaved} onCancel={vi.fn()} />);

    const nrInput = screen.getByPlaceholderText('000.000.000-00') as HTMLInputElement;
    fireEvent.change(nrInput, { target: { value: '888' } });

    clickSalvar();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(verificarNrRegistroMock).toHaveBeenCalledWith('888', 'emp-1', 'nr_cliente', 'acordo-1');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].id).toBe('acordo-1');

    // Sincroniza nr_registros com o novo valor + operador_id do acordo.
    expect(registrarNrMock).toHaveBeenCalledTimes(1);
    expect(registrarNrMock).toHaveBeenCalledWith(
      expect.objectContaining({
        empresaId:  'emp-1',
        nrValue:    '888',
        campo:      'nr_cliente',
        operadorId: 'op-1',
        acordoId:   'acordo-1',
      }),
    );
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('(d) acordo tipo_vinculo=extra NÃO chama registrarNr (Extra não é titular)', async () => {
    const acordo = makeAcordo({ nr_cliente: '777', tipo_vinculo: 'extra' });
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue(null);
    nextSingleResult = {
      data: { ...acordo, nr_cliente: '888', perfis: { nome: 'Op Teste' } },
      error: null,
    };

    renderInline(<AcordoEditInline acordo={acordo} onSaved={onSaved} onCancel={vi.fn()} />);

    const nrInput = screen.getByPlaceholderText('000.000.000-00') as HTMLInputElement;
    fireEvent.change(nrInput, { target: { value: '888' } });

    clickSalvar();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    // A VERIFICAÇÃO de duplicidade ainda ocorre (proteção universal).
    expect(verificarNrRegistroMock).toHaveBeenCalled();
    // Mas o registro de titularidade NÃO, porque é extra.
    expect(registrarNrMock).not.toHaveBeenCalled();
  });

  it('(e) empresa ausente: pula verificação e salva assim mesmo', async () => {
    empresaValue = null; // sem empresa selecionada
    const acordo = makeAcordo({ nr_cliente: '777' });
    const onSaved = vi.fn();
    nextSingleResult = {
      data: { ...acordo, nr_cliente: '888', perfis: { nome: 'Op Teste' } },
      error: null,
    };

    renderInline(<AcordoEditInline acordo={acordo} onSaved={onSaved} onCancel={vi.fn()} />);

    const nrInput = screen.getByPlaceholderText('000.000.000-00') as HTMLInputElement;
    fireEvent.change(nrInput, { target: { value: '888' } });

    clickSalvar();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(verificarNrRegistroMock).not.toHaveBeenCalled();
    expect(registrarNrMock).not.toHaveBeenCalled();
    expect(toastSuccess).toHaveBeenCalled();
  });

  it('(f) falha na verificação → avisa com toast.warning e prossegue com o salvamento', async () => {
    const acordo = makeAcordo({ nr_cliente: '777' });
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockRejectedValue(new Error('rede caiu'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    nextSingleResult = {
      data: { ...acordo, nr_cliente: '888', perfis: { nome: 'Op Teste' } },
      error: null,
    };

    renderInline(<AcordoEditInline acordo={acordo} onSaved={onSaved} onCancel={vi.fn()} />);

    const nrInput = screen.getByPlaceholderText('000.000.000-00') as HTMLInputElement;
    fireEvent.change(nrInput, { target: { value: '888' } });

    clickSalvar();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(toastWarning).toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
    warn.mockRestore();
  });

  it('(g) PaguePlay: usa campo "instituicao" como chave, não nr_cliente', async () => {
    const acordo = makeAcordo({ instituicao: 'INS-100', nr_cliente: 'cpf-1' });
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'outro', operadorId: 'op2', operadorNome: 'Ana',
    });

    renderInline(
      <AcordoEditInline
        acordo={acordo}
        isPaguePlay
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );

    // No modo PaguePlay, o campo Inscrição é o "instituicao".
    const inscInput = screen.getByPlaceholderText(/Número de inscrição/i) as HTMLInputElement;
    fireEvent.change(inscInput, { target: { value: 'INS-200' } });

    clickSalvar();

    await waitFor(() => expect(verificarNrRegistroMock).toHaveBeenCalledTimes(1));
    expect(verificarNrRegistroMock).toHaveBeenCalledWith(
      'INS-200', 'emp-1', 'instituicao', 'acordo-1',
    );
    // Bloqueou → não salva.
    expect(onSaved).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
    const [msg] = toastError.mock.calls[0];
    expect(msg).toMatch(/Inscrição/);
  });
});

describe('AcordoEditInline — validações básicas', () => {
  it('bloqueia quando nome vazio', async () => {
    const acordo = makeAcordo({ nome_cliente: '   ' });
    const onSaved = vi.fn();
    renderInline(<AcordoEditInline acordo={acordo} onSaved={onSaved} onCancel={vi.fn()} />);

    clickSalvar();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Nome é obrigatório'));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('bloqueia quando valor inválido', async () => {
    const acordo = makeAcordo();
    const onSaved = vi.fn();
    renderInline(<AcordoEditInline acordo={acordo} onSaved={onSaved} onCancel={vi.fn()} />);

    const valorInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;
    fireEvent.change(valorInput, { target: { value: 'abc' } });

    clickSalvar();

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Valor inválido'));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
