/**
 * AcordoEditInline.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Teste de integração focado no coração deste componente: bloqueio de
 * Inscrição duplicada (PaguePlay) e salvamento básico sem mudança de chave.
 *
 * Campo NR (Bookplay) foi removido por conformidade LGPD; testes de
 * deduplicação via NR input foram excluídos junto.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Acordo } from '@/lib/supabase';

// Agora sim, o SUT.
import { AcordoEditInline } from './AcordoEditInline';

// ── Mocks que DEVEM ir antes do import do SUT ───────────────────────────────

// 1) nr_registros.service — spies com implementação controlável por teste.
const verificarNrRegistroMock = vi.fn();
const registrarNrMock = vi.fn();
vi.mock('@/services/nr_registros.service', () => ({
  verificarNrRegistro: (...a: unknown[]) => verificarNrRegistroMock(...a),
  registrarNr:         (...a: unknown[]) => registrarNrMock(...a),
  // A tradução dos erros de NR é usada nos dois pontos de falha da gravação.
  // Devolver `null` faz o componente cair na mensagem dele, que é o caminho
  // que estes testes exercem.
  mensagemErroNr:      () => null,
}));

// 1b) Dependências da escada de conflito. `conflitoNr.service` NÃO é mockado:
// é justamente a decisão dele que queremos ver acontecendo de ponta a ponta.
const estaDesligadoMock      = vi.fn();
const diretoExtraAtivoMock   = vi.fn();
const transferirServidorMock = vi.fn();
const autenticarLiderMock    = vi.fn();
/** A lógica Direto/Extra do usuário ATUAL, resolvida pelo useDiretoExtraConfig. */
const euTenhoLogicaMock      = vi.fn();

vi.mock('@/services/desligamento.service', () => ({
  operadorEstaDesligado:       (...a: unknown[]) => estaDesligadoMock(...a),
  transferirAcordoDeDesligado: vi.fn(async () => ({ ok: true })),
  transferirAcordoNoServidor:  (...a: unknown[]) => transferirServidorMock(...a),
  mensagemErroTransferencia:   (e: unknown) => String(e),
}));

vi.mock('@/services/direto_extra.service', () => ({
  fetchIsDiretoExtraAtivo:  (...a: unknown[]) => diretoExtraAtivoMock(...a),
  // Usados pelo useDiretoExtraConfig, que roda de verdade na árvore.
  fetchDiretoExtraConfigs:  vi.fn(async () => []),
  resolverDiretoExtraAtivo: (...a: unknown[]) => euTenhoLogicaMock(...a),
}));

vi.mock('@/services/notificacoes.service', () => ({
  criarNotificacao: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/services/autorizacao_lider.service', () => ({
  autenticarLider: (...a: unknown[]) => autenticarLiderMock(...a),
}));

// 2) Supabase — builder chainable terminando em .single() thenable.
let nextSingleResult: { data: unknown; error: { message: string } | null } = {
  data: null,
  error: null,
};
const updateCalls: Array<{ table: string; payload: unknown; id?: unknown }> = [];

/**
 * Respostas de `.maybeSingle()` na ordem em que a coleta de fatos as consome:
 * 1º o acordo do dono, 2º o extra atual (ou o setor do dono). Fila, e não
 * valor único, porque a ordem dessas leituras É a regra sendo testada.
 */
let maybeSingleQueue: Array<{ data: unknown; error: { message: string } | null }> = [];

vi.mock('@/lib/supabase', () => {
  const makeBuilder = (table: string) => {
    const state: { payload?: unknown; id?: unknown } = {};
    const builder: Record<string, unknown> = {
      update: vi.fn((payload: unknown) => {
        state.payload = payload;
        return builder;
      }),
      insert: vi.fn(async () => ({ data: null, error: null })),
      delete: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        if (col === 'id') state.id = val;
        return builder;
      }),
      select: vi.fn(() => builder),
      single: vi.fn(async () => {
        updateCalls.push({ table, payload: state.payload, id: state.id });
        return nextSingleResult;
      }),
      maybeSingle: vi.fn(async () => maybeSingleQueue.shift() ?? { data: null, error: null }),
    };
    return builder;
  };
  // `channel`/`removeChannel` passaram a ser necessários: a árvore do componente
  // assina realtime. Sem eles o render estoura com "supabase.channel is not a
  // function" antes de qualquer asserção. Canal no-op — este arquivo testa as
  // regras do formulário, não realtime.
  const fakeChannel = {
    on:        vi.fn(() => fakeChannel),
    subscribe: vi.fn(() => fakeChannel),
  };
  return {
    supabase: {
      from:          vi.fn((t: string) => makeBuilder(t)),
      rpc:           vi.fn(async () => ({ data: null, error: null })),
      channel:       vi.fn(() => fakeChannel),
      removeChannel: vi.fn(),
    },
  };
});

// 3) useEmpresa — controlável por teste.
let empresaValue: { id: string } | null = { id: 'emp-1' };
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: empresaValue }),
}));

// 3b) useAuth — o componente passou a ler `perfil` (id/setor/equipe para resolver
// a lógica Direto e Extra, e `tampermonkey_configured` para o botão do Chatplay).
// Sem este mock o hook lança "useAuth deve ser usado dentro de AuthProvider" no
// primeiro render, e TODO teste do arquivo morria antes de exercer qualquer regra.
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    perfil: {
      id:                      'perfil-1',
      nome:                    'Operador Teste',
      perfil:                  'operador',
      empresa_id:              'emp-1',
      setor_id:                null,
      equipe_id:               null,
      tampermonkey_configured: false,
    },
    user:    { id: 'perfil-1' },
    loading: false,
  }),
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

/**
 * Relógio congelado em MAIO/2026, o mês do acordo de teste (`makeAcordo`).
 *
 * Desde o cadeado de mês fechado (`lib/fechamentoMes`), `handleSave` recusa
 * edição de acordo cujo vencimento caia em mês anterior ao corrente. Com a data
 * real da máquina, todo teste de salvamento deste arquivo passaria a falhar a
 * partir de junho/2026 — por causa do calendário, não do comportamento testado.
 *
 * `toFake: ['Date']` para não interferir no `waitFor` do testing-library.
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-20T15:00:00Z'));
});
afterAll(() => { vi.useRealTimers(); });

beforeEach(() => {
  verificarNrRegistroMock.mockReset();
  registrarNrMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  toastWarning.mockReset();
  updateCalls.length = 0;
  nextSingleResult = { data: null, error: null };
  empresaValue = { id: 'emp-1' };
  maybeSingleQueue = [];
  estaDesligadoMock.mockReset().mockResolvedValue(false);
  diretoExtraAtivoMock.mockReset().mockResolvedValue(false);
  euTenhoLogicaMock.mockReset().mockReturnValue(false);
  transferirServidorMock.mockReset().mockResolvedValue({ ok: true });
  autenticarLiderMock.mockReset().mockResolvedValue({
    autorizador: { uid: 'lider-1', nome: 'Líder', token: 'tok', perfil: 'lider' },
  });
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

  it('(b) PaguePlay: usa campo "instituicao" como chave, não nr_cliente', async () => {
    // `estado_uf` preenchido de propósito: desde a 20260802c a PaguePlay não
    // salva sem UF, e essa checagem roda ANTES da consulta de NR duplicado.
    // Sem isso o teste passaria a medir a validação errada.
    const acordo = makeAcordo({ instituicao: 'INS-100', nr_cliente: '', estado_uf: 'SP' });
    const onSaved = vi.fn();
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'outro', operadorId: 'op2', operadorNome: 'Ana',
    });
    maybeSingleQueue = [
      { data: { id: 'outro', vinculo_operador_id: null }, error: null }, // acordo do dono
      { data: null, error: null },                                       // setor do dono
    ];

    renderInline(
      <AcordoEditInline
        acordo={acordo}
        isPaguePlay
        onSaved={onSaved}
        onCancel={vi.fn()}
      />,
    );

    // No modo PaguePlay, o campo Código é o "instituicao".
    const inscInput = screen.getByPlaceholderText(/Código \(opcional\)/i) as HTMLInputElement;
    fireEvent.change(inscInput, { target: { value: 'INS-200' } });

    clickSalvar();

    await waitFor(() => expect(verificarNrRegistroMock).toHaveBeenCalledTimes(1));
    expect(verificarNrRegistroMock).toHaveBeenCalledWith(
      'INS-200', 'emp-1', 'instituicao', 'acordo-1',
    );
    // Ninguém tem a lógica Direto/Extra → CASO C: pede o líder, não salva.
    // Desde 18/08/2026 nao se digita a senha do lider: pede-se autorizacao.
    await screen.findByRole('button', { name: /solicitar autorização/i });
    // O login do lider saiu de vez desta tela.
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  // Os casos abaixo usam PaguePlay porque é onde a chave é EDITÁVEL: o campo
  // NR da BookPlay foi removido da tela por LGPD, então lá `nr_cliente` nunca
  // muda por esta edição e a escada não tem como ser alcançada.

  /** Prepara um acordo PaguePlay em conflito e devolve o input do Código. */
  function renderConflitoPP(onSaved: () => void) {
    const acordo = makeAcordo({ instituicao: 'INS-100', nr_cliente: '', estado_uf: 'SP' });
    verificarNrRegistroMock.mockResolvedValue({
      registroId: 'r1', acordoId: 'acordo-da-maria', operadorId: 'op2', operadorNome: 'Maria Valeria',
    });
    nextSingleResult = { data: { ...acordo, instituicao: 'INS-200' }, error: null };

    renderInline(
      <AcordoEditInline acordo={acordo} isPaguePlay onSaved={onSaved} onCancel={vi.fn()} />,
    );
    return screen.getByPlaceholderText(/Código \(opcional\)/i) as HTMLInputElement;
  }

  it('(c) CASO B — dono tem a lógica Direto/Extra: abre o aviso, sem pedir líder', async () => {
    // É o caso que a edição não tinha: antes parava num toast de "não é
    // possível duplicar" mesmo com o caminho liberado pela lógica do dono.
    const onSaved = vi.fn();
    diretoExtraAtivoMock.mockResolvedValue(true); // o DONO tem a lógica
    maybeSingleQueue = [
      { data: { id: 'acordo-da-maria', vinculo_operador_id: null }, error: null },
      { data: { setores: { nome: 'Cobrança' } }, error: null },
    ];

    const input = renderConflitoPP(onSaved);
    fireEvent.change(input, { target: { value: 'INS-200' } });
    clickSalvar();

    await screen.findByText(/Vínculo detectado/i);
    expect(screen.getByText(/Tabular como Direto/i)).toBeTruthy();
    // A lógica do DONO é que foi consultada, não a minha.
    expect(diretoExtraAtivoMock).toHaveBeenCalledWith({ userId: 'op2', empresaId: 'emp-1' });
    expect(onSaved).not.toHaveBeenCalled();
    // Nenhuma autorização de líder neste caminho.
    expect(screen.queryByRole('button', { name: /solicitar autorização/i })).toBeNull();
  });

  it('(d) CASO B confirmado: converte o acordo do dono e grava o meu como DIRETO', async () => {
    const onSaved = vi.fn();
    diretoExtraAtivoMock.mockResolvedValue(true);
    maybeSingleQueue = [
      { data: { id: 'acordo-da-maria', vinculo_operador_id: null }, error: null },
      { data: { setores: { nome: 'Cobrança' } }, error: null },
    ];

    const input = renderConflitoPP(onSaved);
    fireEvent.change(input, { target: { value: 'INS-200' } });
    clickSalvar();

    fireEvent.click(await screen.findByText(/Tabular como Direto/i));

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const payload = updateCalls.at(-1)?.payload as Record<string, unknown>;
    expect(payload.tipo_vinculo).toBe('direto');
    expect(payload.vinculo_operador_id).toBe('op2');
  });

  it('(e) CASO A — eu tenho a lógica e o dono não: gravo como EXTRA, sem modal', async () => {
    const onSaved = vi.fn();
    diretoExtraAtivoMock.mockResolvedValue(false); // o dono NÃO tem
    euTenhoLogicaMock.mockReturnValue(true);       // EU tenho
    maybeSingleQueue = [
      { data: { id: 'acordo-da-maria', vinculo_operador_id: null }, error: null },
      { data: null, error: null },
    ];

    const input = renderConflitoPP(onSaved);
    fireEvent.change(input, { target: { value: 'INS-200' } });
    clickSalvar();

    // CASO A grava direto, sem modal: quem tem a lógica ativa não passa por
    // autorização nenhuma — é o ponto todo da lógica.
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: /solicitar autorização/i })).toBeNull();
    const payload = updateCalls.at(-1)?.payload as Record<string, unknown>;
    expect(payload.tipo_vinculo).toBe('extra');
    expect(payload.vinculo_operador_id).toBe('op2');
  });

  it('(f) já existe EXTRA no acordo do dono → autorização de líder, mesmo com a lógica ativa', async () => {
    const onSaved = vi.fn();
    euTenhoLogicaMock.mockReturnValue(true);
    maybeSingleQueue = [
      { data: { id: 'acordo-da-maria', vinculo_operador_id: 'op3', vinculo_operador_nome: 'Joana' }, error: null },
      { data: { id: 'acordo-extra-9', operador_id: 'op3' }, error: null },
    ];

    const input = renderConflitoPP(onSaved);
    fireEvent.change(input, { target: { value: 'INS-200' } });
    clickSalvar();

    // Tirar o lugar de um terceiro passa por líder — a lógica não dispensa.
    // Desde 18/08/2026 nao se digita a senha do lider: pede-se autorizacao.
    await screen.findByRole('button', { name: /solicitar autorização/i });
    // O login do lider saiu de vez desta tela.
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('(b2) PaguePlay: editar sem estado (UF) é recusado antes de consultar o NR', async () => {
    const acordo = makeAcordo({ instituicao: 'INS-100', nr_cliente: '', estado_uf: null });
    const onSaved = vi.fn();

    renderInline(
      <AcordoEditInline acordo={acordo} isPaguePlay onSaved={onSaved} onCancel={vi.fn()} />,
    );

    clickSalvar();

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0][0])).toMatch(/estado \(UF\)/i);
    expect(onSaved).not.toHaveBeenCalled();
    expect(verificarNrRegistroMock).not.toHaveBeenCalled();
  });
});

describe('AcordoEditInline — campo Instituição/Código', () => {
  // `instituicao` é a MESMA coluna nas duas empresas, servindo dois conceitos:
  // código do acordo na PaguePlay (texto livre) e nome da instituição na
  // BookPlay (uma de quatro). Enquanto a edição usava <Input> nos dois casos,
  // dava para gravar qualquer coisa num campo que o cadastro restringe — e o
  // valor digitado ainda virava chave de NR (ver 20260810b).

  it('BookPlay: é lista fechada, com as mesmas opções do cadastro', async () => {
    const acordo = makeAcordo({ instituicao: 'BOOKPLAY' });
    renderInline(<AcordoEditInline acordo={acordo} onSaved={vi.fn()} onCancel={vi.fn()} />);

    // Não existe campo digitável de instituição na BookPlay.
    expect(screen.queryByPlaceholderText(/Instituição \(opcional\)/i)).toBeNull();
    // O valor atual aparece no gatilho do Select.
    expect(screen.getByText('BOOKPLAY')).toBeTruthy();
  });

  it('BookPlay: valor fora da lista não some da tela', async () => {
    // Vem dos acordos gravados quando o campo era texto livre. Se o Select não
    // oferecesse o valor atual, a tela mostraria o placeholder e o operador
    // salvaria por cima sem perceber que havia conteúdo.
    const acordo = makeAcordo({ instituicao: 'Bookplya' });
    renderInline(<AcordoEditInline acordo={acordo} onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText('Bookplya')).toBeTruthy();
  });

  it('PaguePlay: continua texto livre — ali é o código do acordo', async () => {
    const acordo = makeAcordo({ instituicao: 'INS-100', nr_cliente: '', estado_uf: 'SP' });
    renderInline(
      <AcordoEditInline acordo={acordo} isPaguePlay onSaved={vi.fn()} onCancel={vi.fn()} />,
    );

    const input = screen.getByPlaceholderText(/Código \(opcional\)/i) as HTMLInputElement;
    expect(input.value).toBe('INS-100');
  });

  it('BookPlay: salvar sem mexer preserva a instituição', async () => {
    const acordo = makeAcordo({ instituicao: 'MUNDIAL EDITORA' });
    const onSaved = vi.fn();
    nextSingleResult = { data: acordo, error: null };

    renderInline(<AcordoEditInline acordo={acordo} onSaved={onSaved} onCancel={vi.fn()} />);
    clickSalvar();

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const payload = updateCalls.at(-1)?.payload as Record<string, unknown>;
    expect(payload.instituicao).toBe('MUNDIAL EDITORA');
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
