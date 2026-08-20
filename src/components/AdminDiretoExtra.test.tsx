/**
 * src/components/AdminDiretoExtra.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Cobre o componente AdminDiretoExtra:
 *   - render inicial (dados carregados via useEffect)
 *   - estado de switches sem configs
 *   - toggle de setor (sucesso / erro)
 *   - badges de status explícito ("Ativo")
 *   - herança equipe→setor, usuario→equipe, usuario→setor
 *   - config própria de usuário não desabilita o switch
 *   - totais nos TabsTriggers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ── Variáveis hoistadas (disponíveis dentro dos vi.mock factories) ──────────
// vi.mock é hoistado para antes dos imports; variáveis declaradas fora
// não seriam acessíveis. vi.hoisted() resolve isso.

const {
  supabaseFromMock,
  refetchMock,
  setConfigMock,
  toastError,
  toastSuccess,
} = vi.hoisted(() => ({
  supabaseFromMock: vi.fn(),
  refetchMock:      vi.fn().mockResolvedValue(undefined),
  setConfigMock:    vi.fn(),
  toastError:       vi.fn(),
  toastSuccess:     vi.fn(),
}));

// ── Tipo auxiliar + builder de queries ────────────────────────────────────

type Res = { data: unknown; error: null | { message: string } };
const results: Record<string, Res> = {};

/**
 * Builder genérico: todas as queries terminam em `.order()` (último método
 * thenable). Fila por tabela via `results`.
 */
function createChainBuilder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  b.select = chain;
  b.eq     = chain;
  b.in     = chain;
  b.order  = () => Promise.resolve(results[table] ?? { data: [], error: null });
  return b;
}

// ── 1) Supabase ────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase', () => ({
  supabase: { from: supabaseFromMock },
}));

// ── 2) useEmpresa ──────────────────────────────────────────────────────────

vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'emp-1', nome: 'Teste' } }),
}));

// ── 3) useDiretoExtraConfig ───────────────────────────────────────────────
// `mockConfigs` é mutável: cada teste atribui o valor desejado antes de render.

let mockConfigs: Array<{
  escopo:        'setor' | 'equipe' | 'usuario';
  referencia_id: string;
  ativo:         boolean;
}> = [];

vi.mock('@/hooks/useDiretoExtraConfig', () => ({
  useDiretoExtraConfig: () => ({
    configs:            mockConfigs,
    loading:            false,
    refetch:            refetchMock,
    isAtivoParaUsuario: () => false,
  }),
}));

// ── 4) setDiretoExtraConfig ────────────────────────────────────────────────

vi.mock('@/services/direto_extra.service', () => ({
  setDiretoExtraConfig: (args: unknown) => setConfigMock(args),
}));

// ── 5) toast ──────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess },
}));

// ── 6) framer-motion — div simples para evitar ruído no happy-dom ──────────

vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
}));

// ── 7) Radix Tabs — mostra TODOS os TabsContent simultaneamente ────────────

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div role="tablist">{children}</div>
  ),
  TabsTrigger: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <button data-tab={value}>{children}</button>,
  TabsContent: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => <section data-tab-content={value}>{children}</section>,
}));

// ── 8) Radix Switch — interagível via role="switch" ────────────────────────

vi.mock('@/components/ui/switch', () => ({
  Switch: ({
    checked,
    disabled,
    onCheckedChange,
  }: {
    checked: boolean;
    disabled?: boolean;
    onCheckedChange?: (v: boolean) => void;
  }) => (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      data-testid="switch"
    />
  ),
}));

// ── SUT (depois de todos os mocks) ─────────────────────────────────────────

import AdminDiretoExtra from '@/pages/AdminDiretoExtra';

// ── Dados de fixture ──────────────────────────────────────────────────────

const SETORES = [
  { id: 's1', nome: 'COREN' },
  { id: 's2', nome: 'COFEN' },
];
const EQUIPES = [
  { id: 'eq1', nome: 'Equipe A', setor_id: 's1' },
  { id: 'eq2', nome: 'Equipe B', setor_id: null },
];
const PERFIS = [
  { id: 'u1', nome: 'Ana',   email: 'a@x.com', perfil: 'operador', setor_id: 's1', equipe_id: 'eq1' },
  { id: 'u2', nome: 'Bruno', email: 'b@x.com', perfil: 'lider',    setor_id: 's1', equipe_id: null  },
  { id: 'u3', nome: 'Carla', email: 'c@x.com', perfil: 'operador', setor_id: null, equipe_id: null  },
];

// ── Helper: localiza o switch no "row" de um item pelo seu nome ────────────
/**
 * O componente renderiza cada item em um `div` com Switch aninhado.
 * Sobe o DOM a partir do elemento de texto até encontrar o `[role="switch"]`.
 * `nameIndex` seleciona qual das ocorrências de `name` usar (default: 0 = o <p> do item).
 */
function getSwitchForItem(name: string, nameIndex = 0): HTMLElement {
  const nameEls = screen.getAllByText(name);
  const nameEl  = nameEls[nameIndex];
  let cur: Element | null = nameEl;
  for (let depth = 0; depth < 6; depth++) {
    if (!cur) break;
    const sw = cur.querySelector('[role="switch"]');
    if (sw) return sw as HTMLElement;
    cur = cur.parentElement;
  }
  throw new Error(`[getSwitchForItem] Switch não encontrado para "${name}" (index=${nameIndex})`);
}

// ── beforeEach ─────────────────────────────────────────────────────────────

beforeEach(() => {
  mockConfigs = [];
  vi.clearAllMocks();

  // Popula resultados das 3 queries do useEffect
  results['setores'] = { data: SETORES, error: null };
  results['equipes'] = { data: EQUIPES, error: null };
  results['perfis']  = { data: PERFIS,  error: null };

  supabaseFromMock.mockImplementation((table: string) => createChainBuilder(table));
  setConfigMock.mockResolvedValue({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// TESTES
// ─────────────────────────────────────────────────────────────────────────────

describe('AdminDiretoExtra', () => {
  // ── 1. Render inicial ──────────────────────────────────────────────────

  it('renderiza as 3 abas e exibe todos os itens carregados', async () => {
    render(<AdminDiretoExtra />);

    await waitFor(() => {
      // Abas presentes
      expect(screen.getByText('Setores')).toBeInTheDocument();
      expect(screen.getByText('Equipes')).toBeInTheDocument();
      expect(screen.getByText('Usuários')).toBeInTheDocument();

      // Itens de todas as seções visíveis (stubs mostram tudo de uma vez)
      expect(screen.getAllByText('COREN').length).toBeGreaterThan(0);
      expect(screen.getAllByText('COFEN').length).toBeGreaterThan(0);
      expect(screen.getByText('Equipe A')).toBeInTheDocument();
      expect(screen.getByText('Equipe B')).toBeInTheDocument();
      expect(screen.getByText('Ana')).toBeInTheDocument();
      expect(screen.getByText('Bruno')).toBeInTheDocument();
      expect(screen.getByText('Carla')).toBeInTheDocument();
    });
  });

  // ── 2. Sem configs → todos os switches desligados ──────────────────────

  it('sem configs → nenhum switch fica aria-checked=true', async () => {
    render(<AdminDiretoExtra />);

    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    const switches = screen.getAllByRole('switch');
    expect(switches.length).toBeGreaterThan(0);
    switches.forEach(sw => {
      expect(sw).toHaveAttribute('aria-checked', 'false');
    });
  });

  // ── 3. Toggle de setor → chama setDiretoExtraConfig com payload correto ──

  it('toggle do setor COREN chama setDiretoExtraConfig com params corretos, toast.success e refetch', async () => {
    render(<AdminDiretoExtra />);

    // Sem configs, COREN aparece exatamente uma vez
    await waitFor(() => expect(screen.getByText('COREN')).toBeInTheDocument());

    const sw = getSwitchForItem('COREN');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);

    await waitFor(() => {
      expect(setConfigMock).toHaveBeenCalledWith({
        empresaId:    'emp-1',
        escopo:       'setor',
        referenciaId: 's1',
        ativo:        true,
      });
    });

    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    await waitFor(() => expect(refetchMock).toHaveBeenCalled());
  });

  // ── 4. Erro em setDiretoExtraConfig → toast.error, sem refetch ──────────

  it('erro no setDiretoExtraConfig → toast.error com a mensagem e refetch NÃO chamado', async () => {
    setConfigMock.mockResolvedValue({ ok: false, error: 'perm denied' });

    render(<AdminDiretoExtra />);
    await waitFor(() => expect(screen.getByText('COREN')).toBeInTheDocument());

    fireEvent.click(getSwitchForItem('COREN'));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(expect.stringContaining('perm denied'));
    });
    expect(refetchMock).not.toHaveBeenCalled();
  });

  // ── 5. Config explícita de setor → switch ligado + badge "Ativo" ─────────

  it('config setor s1 ativo=true → switch de COREN ligado e badge "Ativo" visível', async () => {
    // Com configs: "COREN" aparece múltiplas vezes (item + badges de herança).
    // getAllByText('COREN')[0] é o <p> do item setor.
    mockConfigs = [{ escopo: 'setor', referencia_id: 's1', ativo: true }];

    render(<AdminDiretoExtra />);

    await waitFor(() => screen.getAllByText('COREN'));

    // O switch do setor COREN (index 0 = o <p> do item, sem herança no próprio setor)
    const sw = getSwitchForItem('COREN', 0);
    expect(sw).toHaveAttribute('aria-checked', 'true');

    // Badge "Ativo" (origem='proprio') aparece no body
    expect(document.body.textContent).toContain('Ativo');
  });

  // ── 6. Herança equipe→setor ──────────────────────────────────────────────

  it('herança equipe→setor: eq1 (setor s1 ativo) fica aria-checked=true e disabled; badge "Ativo (via setor)"', async () => {
    mockConfigs = [{ escopo: 'setor', referencia_id: 's1', ativo: true }];

    render(<AdminDiretoExtra />);
    await waitFor(() => expect(screen.getByText('Equipe A')).toBeInTheDocument());

    const sw = getSwitchForItem('Equipe A');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).toBeDisabled();

    // Badge "Ativo (via setor)"
    expect(document.body.textContent).toContain('Ativo (via setor)');

    // Equipe B (setor_id=null) não herda → desligada
    const swB = getSwitchForItem('Equipe B');
    expect(swB).toHaveAttribute('aria-checked', 'false');
  });

  // ── 7. Herança usuário→equipe ────────────────────────────────────────────

  it('herança usuario→equipe: u1 (equipe_id=eq1, equipe ativa) fica disabled + texto de herança', async () => {
    mockConfigs = [{ escopo: 'equipe', referencia_id: 'eq1', ativo: true }];

    render(<AdminDiretoExtra />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    const sw = getSwitchForItem('Ana');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).toBeDisabled();

    // Texto de herança da equipe
    expect(document.body.textContent).toContain('herdada');
    expect(document.body.textContent).toContain('equipe');
  });

  // ── 8. Herança usuário→setor (sem equipe ativa) ──────────────────────────

  it('herança usuario→setor: u2 (setor_id=s1, equipe_id=null, setor ativo) fica aria-checked=true e disabled', async () => {
    mockConfigs = [{ escopo: 'setor', referencia_id: 's1', ativo: true }];

    render(<AdminDiretoExtra />);
    await waitFor(() => expect(screen.getByText('Bruno')).toBeInTheDocument());

    const sw = getSwitchForItem('Bruno');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).toBeDisabled();
  });

  // ── 9. Config própria de usuário ativo=true → NÃO herda, switch habilitado ─

  it('config própria usuario ativo=true → switch ligado mas NÃO disabled (config própria, não herdada)', async () => {
    mockConfigs = [
      { escopo: 'setor',   referencia_id: 's1', ativo: true },
      { escopo: 'usuario', referencia_id: 'u1', ativo: true },
    ];

    render(<AdminDiretoExtra />);
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());

    const sw = getSwitchForItem('Ana');
    // Ativo=true (config própria), mas NÃO desabilitado
    expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(sw).not.toBeDisabled();
  });

  // ── 10. Totais nos badges dos TabsTriggers ───────────────────────────────

  it('totais: setor s1 ativo → Setores=1, Equipes=1 (eq1 herda), Usuários=2 (u1 e u2 via setor)', async () => {
    mockConfigs = [{ escopo: 'setor', referencia_id: 's1', ativo: true }];

    render(<AdminDiretoExtra />);
    // Aguarda os dados carregarem (pelo menos um item de setor)
    await waitFor(() => screen.getAllByText('COREN'));

    const tablist = screen.getByRole('tablist');
    const setorTab  = tablist.querySelector('[data-tab="setor"]')!;
    const equipeTab = tablist.querySelector('[data-tab="equipe"]')!;
    const usuTab    = tablist.querySelector('[data-tab="usuario"]')!;

    // Setor: 1 (s1 tem config própria; s2 não tem)
    expect(setorTab.textContent).toContain('1');
    // Equipe: 1 (eq1 herda de s1; eq2 sem setor → 0)
    expect(equipeTab.textContent).toContain('1');
    // Usuários: 2 (u1 via setor s1; u2 via setor s1; u3 sem setor/equipe → 0)
    expect(usuTab.textContent).toContain('2');
  });
});
