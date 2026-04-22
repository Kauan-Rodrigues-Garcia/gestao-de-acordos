/**
 * src/components/ModalFilaWhatsApp.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Testes do componente ModalFilaWhatsApp:
 *   - render básico e progresso
 *   - label NR vs CPF (isPaguePlay)
 *   - botão "Enviar todos" condicional
 *   - abrir próximo + log supabase
 *   - ausência de log quando sem usuarioId
 *   - copiar mensagem individual
 *   - copiar todas as mensagens
 *   - expandir/colapsar item
 *   - abrir no WhatsApp individual + marca enviado
 *   - todos enviados → botão "Fechar"
 *   - envio automático com fake timers
 *   - popup bloqueado → toast.warning
 *   - cancelar auto-envio
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ── Variáveis hoistadas ────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastWarning: vi.fn(),
  toastError: vi.fn(),
  supabaseCalls: [] as Array<{ table: string; payload?: unknown }>,
}));

// Variável de controle para tenantSlug (alterável por teste)
let tenantSlugMock = 'pagueplay';

// ── 1) Supabase ────────────────────────────────────────────────────────────
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: (payload: unknown) => {
        mocks.supabaseCalls.push({ table, payload });
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

// ── 2) useEmpresa ──────────────────────────────────────────────────────────
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ tenantSlug: tenantSlugMock }),
}));

// ── 3) isPaguePlay (preserva outros exports de @/lib/index) ────────────────
vi.mock('@/lib/index', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/index')>();
  return {
    ...orig,
    isPaguePlay: (slug: string) => slug === 'pagueplay',
  };
});

// ── 4) sonner ─────────────────────────────────────────────────────────────
vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    warning: mocks.toastWarning,
    error: mocks.toastError,
  },
}));

// ── 5) framer-motion ──────────────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: { div: 'div' },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// ── 6) Radix Dialog ───────────────────────────────────────────────────────
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: any) =>
    open ? <div role="dialog">{children}</div> : null,
  DialogContent: ({ children }: any) => <div>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
}));

// ── Import do componente (depois dos mocks) ───────────────────────────────
import { ModalFilaWhatsApp, ItemFila } from './ModalFilaWhatsApp';

// ── Helper de fila ────────────────────────────────────────────────────────
function criarFila(overrides: Partial<ItemFila>[] = []): ItemFila[] {
  const base: ItemFila[] = [
    {
      id: 'a1', nome_cliente: 'Ana', nr_cliente: '111', whatsapp: '11999990001',
      valor: 100, vencimento: '2026-05-10', mensagem: 'Oi Ana', link: 'https://wa.me/1', enviado: false,
    },
    {
      id: 'a2', nome_cliente: 'Bruno', nr_cliente: '222', whatsapp: '11999990002',
      valor: 200, vencimento: '2026-05-15', mensagem: 'Oi Bruno', link: 'https://wa.me/2', enviado: false,
    },
    {
      id: 'a3', nome_cliente: 'Carla', nr_cliente: '333', whatsapp: '11999990003',
      valor: 300, vencimento: '2026-05-20', mensagem: 'Oi Carla', link: 'https://wa.me/3', enviado: false,
    },
  ];
  return base.map((item, i) => ({ ...item, ...(overrides[i] ?? {}) }));
}

// ── Setup / teardown ──────────────────────────────────────────────────────
beforeEach(() => {
  // Resetar chamadas do supabase
  mocks.supabaseCalls.length = 0;
  // Resetar spies de toast
  mocks.toastSuccess.mockReset();
  mocks.toastWarning.mockReset();
  mocks.toastError.mockReset();
  // Restaurar tenantSlug padrão
  tenantSlugMock = 'pagueplay';
  // Stub window.open
  vi.stubGlobal('open', vi.fn(() => ({} as Window)));
  // Stub navigator.clipboard
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ── Testes ────────────────────────────────────────────────────────────────
describe('ModalFilaWhatsApp', () => {
  // 1. Render básico
  it('1. exibe título, progresso e nomes dos clientes', () => {
    const onClose = vi.fn();
    render(
      <ModalFilaWhatsApp fila={criarFila()} usuarioId="u1" empresaId="e1" onClose={onClose} />,
    );

    expect(screen.getByText('Fila de Lembretes WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('0 enviado(s)')).toBeInTheDocument();
    expect(screen.getByText('3 total')).toBeInTheDocument();
    expect(screen.getByText('0/3')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Bruno')).toBeInTheDocument();
    expect(screen.getByText('Carla')).toBeInTheDocument();
  });

  // 2. Label NR vs CPF
  it('2. exibe "CPF" para pagueplay e "NR" para outros tenants', () => {
    const onClose = vi.fn();

    // pagueplay → CPF
    tenantSlugMock = 'pagueplay';
    const { unmount } = render(
      <ModalFilaWhatsApp fila={criarFila()} onClose={onClose} />,
    );
    expect(screen.getByText('CPF 111')).toBeInTheDocument();
    unmount();

    // outro tenant → NR
    tenantSlugMock = 'bookplay';
    render(
      <ModalFilaWhatsApp fila={criarFila()} onClose={onClose} />,
    );
    expect(screen.getByText('NR 111')).toBeInTheDocument();
    expect(screen.queryByText('CPF 111')).not.toBeInTheDocument();
  });

  // 3. Botão "Enviar todos" só aparece no PaguePlay
  it('3. botão "Enviar todos" só aparece quando isPaguePlay', () => {
    const onClose = vi.fn();

    // bookplay → sem botão
    tenantSlugMock = 'bookplay';
    const { unmount } = render(
      <ModalFilaWhatsApp fila={criarFila()} onClose={onClose} />,
    );
    expect(screen.queryByText('Enviar todos')).not.toBeInTheDocument();
    unmount();

    // pagueplay → com botão
    tenantSlugMock = 'pagueplay';
    render(
      <ModalFilaWhatsApp fila={criarFila()} onClose={onClose} />,
    );
    expect(screen.getByText('Enviar todos')).toBeInTheDocument();
  });

  // 4. Abrir próximo
  it('4. "Abrir próximo" abre window.open, atualiza progresso e registra log', async () => {
    const onClose = vi.fn();
    render(
      <ModalFilaWhatsApp fila={criarFila()} usuarioId="u1" empresaId="e1" onClose={onClose} />,
    );

    const btnAbrirProximo = screen.getByText('Abrir próximo');
    fireEvent.click(btnAbrirProximo);

    expect(window.open).toHaveBeenCalledWith('https://wa.me/1', '_blank');

    await waitFor(() => {
      expect(screen.getByText('1 enviado(s)')).toBeInTheDocument();
    });
    expect(screen.getByText('1/3')).toBeInTheDocument();

    // Badge mostra restantes = 2 (busca especificamente no badge)
    const badges = screen.getAllByText('2');
    expect(badges.length).toBeGreaterThanOrEqual(1);

    // Log no supabase
    await waitFor(() => {
      expect(mocks.supabaseCalls).toHaveLength(1);
    });
    const call = mocks.supabaseCalls[0];
    expect(call.table).toBe('logs_sistema');
    expect((call.payload as any).acao).toBe('envio_lembrete_whatsapp');
    expect((call.payload as any).detalhes.acordo_id).toBe('a1');
  });

  // 5. Sem usuarioId → não registra log
  it('5. sem usuarioId, "Abrir próximo" não registra log no supabase', async () => {
    const onClose = vi.fn();
    render(
      <ModalFilaWhatsApp fila={criarFila()} onClose={onClose} />,
    );

    fireEvent.click(screen.getByText('Abrir próximo'));

    // Aguarda possível tick assíncrono
    await waitFor(() => {
      expect(screen.getByText('1 enviado(s)')).toBeInTheDocument();
    });

    expect(mocks.supabaseCalls).toHaveLength(0);
  });

  // 6. Copiar mensagem individual
  it('6. copiar mensagem individual chama clipboard.writeText e toast.success', async () => {
    const onClose = vi.fn();
    render(
      <ModalFilaWhatsApp fila={criarFila()} usuarioId="u1" onClose={onClose} />,
    );

    // Todos os botões "Copiar mensagem" têm title="Copiar mensagem"
    const botoesCopar = screen.getAllByTitle('Copiar mensagem');
    // botoesCopar[1] é o item 2 (Bruno) — índice 1
    fireEvent.click(botoesCopar[1]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Oi Bruno');
      expect(mocks.toastSuccess).toHaveBeenCalledWith('Mensagem copiada!');
    });
  });

  // 7. Copiar TODAS as mensagens
  it('7. copiar todas as mensagens inclui numeração, separadores e toast correto', async () => {
    const onClose = vi.fn();
    render(
      <ModalFilaWhatsApp fila={criarFila()} usuarioId="u1" onClose={onClose} />,
    );

    const btnCopiarTodas = screen.getByTitle('Copiar todas as mensagens');
    fireEvent.click(btnCopiarTodas);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });

    const textoCopiado = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(textoCopiado).toContain('[1/3]');
    expect(textoCopiado).toContain('[2/3]');
    expect(textoCopiado).toContain('[3/3]');
    expect(textoCopiado).toContain('---');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('3 mensagens copiadas!');
  });

  // 8. Expandir/colapsar item
  it('8. expandir item exibe mensagem e colapsar oculta', async () => {
    const onClose = vi.fn();
    render(
      <ModalFilaWhatsApp fila={criarFila()} usuarioId="u1" onClose={onClose} />,
    );

    // Antes de expandir, a mensagem completa não está visível no bloco expandido
    expect(screen.queryByText('Oi Ana')).not.toBeInTheDocument();

    // Estrutura de botões por item: [Copiar mensagem, Abrir no WhatsApp, chevron(sem title)]
    // Os botões sem title são: [0]=Abrir próximo, [1]=chevron item1, [2]=chevron item2, [3]=chevron item3
    // Filtramos por botões sem title que NÃO contêm texto visível (Abrir próximo tem texto)
    const todosOsBotoes = screen.getAllByRole('button');
    const chevrons = todosOsBotoes.filter(
      btn => !btn.getAttribute('title') && !btn.textContent?.trim(),
    );
    // O primeiro chevron pertence ao item 1
    fireEvent.click(chevrons[0]);

    await waitFor(() => {
      expect(screen.getByText('Oi Ana')).toBeInTheDocument();
    });

    // Colapsar — re-busca os botões pois o DOM pode ter re-renderizado
    const todosOsBotoesApos = screen.getAllByRole('button');
    const chevronsApos = todosOsBotoesApos.filter(
      btn => !btn.getAttribute('title') && !btn.textContent?.trim(),
    );
    fireEvent.click(chevronsApos[0]);

    await waitFor(() => {
      expect(screen.queryByText('Oi Ana')).not.toBeInTheDocument();
    });
  });

  // 9. Abrir no WhatsApp individual + marca enviado + log
  it('9. ícone Send individual abre link, marca enviado e registra log', async () => {
    const onClose = vi.fn();
    render(
      <ModalFilaWhatsApp fila={criarFila()} usuarioId="u1" empresaId="e1" onClose={onClose} />,
    );

    // Botões com title "Abrir no WhatsApp"
    const botoesWa = screen.getAllByTitle('Abrir no WhatsApp');
    // Clica no item 2 (Bruno, link https://wa.me/2)
    fireEvent.click(botoesWa[1]);

    expect(window.open).toHaveBeenCalledWith('https://wa.me/2', '_blank');

    await waitFor(() => {
      // O número na fila do item 2 vira ✓
      const checks = screen.getAllByText('✓');
      expect(checks.length).toBeGreaterThanOrEqual(1);
    });

    await waitFor(() => {
      expect(mocks.supabaseCalls).toHaveLength(1);
    });
    expect(mocks.supabaseCalls[0].table).toBe('logs_sistema');
  });

  // 10. Todos enviados → botão muda para "Fechar"
  it('10. com fila toda enviada, aparece "Todos enviados! Fechar" e onClose é chamado', () => {
    const onClose = vi.fn();
    const filaEnviada = criarFila().map(i => ({ ...i, enviado: true }));
    render(
      <ModalFilaWhatsApp fila={filaEnviada} usuarioId="u1" onClose={onClose} />,
    );

    // Botão "Abrir próximo" não existe
    expect(screen.queryByText('Abrir próximo')).not.toBeInTheDocument();

    // Botão "Todos enviados! Fechar" existe
    const btnFechar = screen.getByText('Todos enviados! Fechar');
    expect(btnFechar).toBeInTheDocument();

    fireEvent.click(btnFechar);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 11. Envio automático com fake timers
  it('11. envio automático abre itens com delay de 1500ms e emite toast de conclusão', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onClose = vi.fn();
    render(
      <ModalFilaWhatsApp fila={criarFila()} usuarioId="u1" empresaId="e1" onClose={onClose} />,
    );

    const btnEnviarTodos = screen.getByText('Enviar todos');

    // Clica e avança microtasks/promises pendentes
    fireEvent.click(btnEnviarTodos);
    await act(async () => { await Promise.resolve(); });

    // Primeiro item aberto imediatamente
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(window.open).toHaveBeenCalledWith('https://wa.me/1', '_blank');

    // Avança 1500ms → segundo item
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(window.open).toHaveBeenCalledTimes(2);
    expect(window.open).toHaveBeenNthCalledWith(2, 'https://wa.me/2', '_blank');

    // Avança mais 1500ms → terceiro item
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(window.open).toHaveBeenCalledTimes(3);
    expect(window.open).toHaveBeenNthCalledWith(3, 'https://wa.me/3', '_blank');

    // Aguarda o estado async se resolver
    await act(async () => { await Promise.resolve(); });

    // Após conclusão: toast de sucesso + botão cancelar sumiu
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Envio automático concluído!');
    expect(screen.queryByText('Cancelar envio automático')).not.toBeInTheDocument();
  });

  // 12. Popup bloqueado → toast.warning no auto-envio
  it('12. popup bloqueado dispara toast.warning durante envio automático', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onClose = vi.fn();

    // window.open retorna null na primeira chamada (popup bloqueado)
    const openMock = vi.fn()
      .mockReturnValueOnce(null)
      .mockReturnValue({} as Window);
    vi.stubGlobal('open', openMock);

    render(
      <ModalFilaWhatsApp fila={criarFila()} usuarioId="u1" onClose={onClose} />,
    );

    // Clica e deixa a Promise do primeiro item resolver
    fireEvent.click(screen.getByText('Enviar todos'));
    await act(async () => { await Promise.resolve(); });

    // Primeiro item: popup bloqueado → toast.warning imediato
    expect(mocks.toastWarning).toHaveBeenCalledWith(
      'Popup bloqueado! Permita popups para este site.',
    );
  });

  // 13. Cancelar auto-envio
  it('13. cancelar envio automático interrompe o loop e não emite toast de conclusão', async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <ModalFilaWhatsApp fila={criarFila()} usuarioId="u1" onClose={onClose} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Enviar todos'));
    });

    // Primeiro item enviado imediatamente
    expect(window.open).toHaveBeenCalledTimes(1);

    // Avança 1500ms → segundo item enviado
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(window.open).toHaveBeenCalledTimes(2);

    // Cancela antes do terceiro
    fireEvent.click(screen.getByText('Cancelar envio automático'));

    // Avança tempo restante
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    // window.open chamado menos de 3 vezes (ou exatamente 2)
    expect((window.open as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThan(3);

    // Toast de conclusão NÃO foi chamado
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith('Envio automático concluído!');
  });
});
