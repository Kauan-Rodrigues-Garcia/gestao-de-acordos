/**
 * NotificacaoToast.test.tsx — fila do card temporário.
 *
 * Regras pedidas: um card por vez (o segundo espera o primeiro sair), some
 * sozinho depois do tempo, e clicar leva para a aba de origem.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { Notificacao } from '@/lib/supabase';

const navigateMock = vi.fn();
const marcarLidaMock = vi.fn(() => Promise.resolve());
const somMock = vi.fn();

// A arrow adia a leitura de `somMock`: `vi.mock` é içado para o topo do arquivo
// e passar a referência direta a leria antes da inicialização.
vi.mock('@/lib/som-notificacao', () => ({ tocarSomNotificacao: () => somMock() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('@/lib/tenant-config', () => ({ useTenant: () => ({ isPaguePlay: true }) }));

let estado: { notificacoes: Notificacao[] } = { notificacoes: [] };
vi.mock('@/providers/NotificacoesProvider', () => ({
  useNotificacoes: () => ({ notificacoes: estado.notificacoes, marcarLida: marcarLidaMock }),
}));

// framer-motion animando com fake timers trava o teste; aqui só a estrutura importa.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: unknown }) => children as never,
  motion: new Proxy({}, {
    get: () => ({ children, ...p }: Record<string, unknown> & { children?: unknown }) => {
      const limpo = Object.fromEntries(
        Object.entries(p).filter(([k]) => !['initial', 'animate', 'exit', 'transition'].includes(k)),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (globalThis as any).__React.createElement('div', limpo, children as never);
    },
  }),
}));

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__React = React;

import { NotificacaoToast, DURACAO_TOAST_MS } from './NotificacaoToast';

function notif(over: Partial<Notificacao> & { id: string }): Notificacao {
  return {
    usuario_id: 'eu', titulo: 'Analítico atualizado', mensagem: 'chegou',
    lida: false, criado_em: new Date().toISOString(), rota: '/analitico',
    ...over,
  } as Notificacao;
}

function renderizar() {
  return render(React.createElement(NotificacaoToast));
}

beforeEach(() => {
  vi.useFakeTimers();
  navigateMock.mockClear();
  marcarLidaMock.mockClear();
  somMock.mockClear();
  estado = { notificacoes: [] };
});
afterEach(() => { vi.useRealTimers(); });

describe('NotificacaoToast', () => {
  it('não mostra o que já existia ao montar — isso é histórico', () => {
    estado = { notificacoes: [notif({ id: 'velha' })] };
    renderizar();
    expect(screen.queryByText('Analítico atualizado')).toBeNull();
  });

  it('mostra a notificação que chega depois de montar', () => {
    const { rerender } = renderizar();
    estado = { notificacoes: [notif({ id: 'n1', titulo: 'Chegou agora' })] };
    act(() => { rerender(React.createElement(NotificacaoToast)); });
    expect(screen.getByText('Chegou agora')).toBeTruthy();
  });

  it('some sozinha depois do tempo', () => {
    const { rerender } = renderizar();
    estado = { notificacoes: [notif({ id: 'n1', titulo: 'Some em 2s' })] };
    act(() => { rerender(React.createElement(NotificacaoToast)); });
    expect(screen.getByText('Some em 2s')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(DURACAO_TOAST_MS + 50); });
    expect(screen.queryByText('Some em 2s')).toBeNull();
  });

  it('duas juntas viram fila: a segunda só entra quando a primeira sai', () => {
    const { rerender } = renderizar();
    // A lista do provider vem da mais nova para a mais antiga.
    estado = { notificacoes: [
      notif({ id: 'n2', titulo: 'Segunda' }),
      notif({ id: 'n1', titulo: 'Primeira' }),
    ] };
    act(() => { rerender(React.createElement(NotificacaoToast)); });

    // A que chegou antes aparece primeiro, e só ela.
    expect(screen.getByText('Primeira')).toBeTruthy();
    expect(screen.queryByText('Segunda')).toBeNull();

    act(() => { vi.advanceTimersByTime(DURACAO_TOAST_MS + 50); });
    expect(screen.queryByText('Primeira')).toBeNull();
    expect(screen.getByText('Segunda')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(DURACAO_TOAST_MS + 50); });
    expect(screen.queryByText('Segunda')).toBeNull();
  });

  it('clicar leva para a rota da notificação e marca como lida', () => {
    const { rerender } = renderizar();
    estado = { notificacoes: [notif({ id: 'n1', rota: '/analitico?aba=diario' })] };
    act(() => { rerender(React.createElement(NotificacaoToast)); });

    act(() => { screen.getByRole('button', { name: /Analítico atualizado/i }).click(); });

    expect(navigateMock).toHaveBeenCalledWith('/analitico?aba=diario');
    expect(marcarLidaMock).toHaveBeenCalledWith('n1');
  });

  it('toca o som ao abrir o card', () => {
    const { rerender } = renderizar();
    // Nada apareceu ainda: o histórico da montagem não pode tocar nada.
    expect(somMock).not.toHaveBeenCalled();

    estado = { notificacoes: [notif({ id: 'n1', titulo: 'Com som' })] };
    act(() => { rerender(React.createElement(NotificacaoToast)); });
    expect(somMock).toHaveBeenCalledTimes(1);
  });

  it('duas na fila tocam uma vez cada, não um estalo só', () => {
    const { rerender } = renderizar();
    estado = { notificacoes: [
      notif({ id: 'n2', titulo: 'Segunda' }),
      notif({ id: 'n1', titulo: 'Primeira' }),
    ] };
    act(() => { rerender(React.createElement(NotificacaoToast)); });
    expect(somMock).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(DURACAO_TOAST_MS + 50); });
    expect(somMock).toHaveBeenCalledTimes(2);
  });

  it('notificação já lida não vira card', () => {
    const { rerender } = renderizar();
    estado = { notificacoes: [notif({ id: 'n1', titulo: 'Lida', lida: true })] };
    act(() => { rerender(React.createElement(NotificacaoToast)); });
    expect(screen.queryByText('Lida')).toBeNull();
  });
});
