/**
 * NotificacaoToast.test.tsx — a pilha de cards temporários.
 *
 * As regras da 2.0 (11/08/2026): até TRÊS cards ao mesmo tempo, o que passar
 * disso espera em fila, cada um some no tempo da sua urgência, o mouse em cima
 * congela a contagem, e clicar leva para a aba de origem.
 *
 * A regra antiga era "um por vez". Ela caiu porque três notificações seguidas
 * levavam 6 s para terminar de aparecer, e a terceira chegava sem contexto das
 * outras duas.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { Notificacao } from '@/lib/supabase';

const navigateMock = vi.fn();
const marcarLidaMock = vi.fn(() => Promise.resolve());
const somMock = vi.fn();

// A arrow adia a leitura dos mocks: `vi.mock` é içado para o topo do arquivo e
// passar a referência direta a leria antes da inicialização.
vi.mock('@/lib/som-notificacao', () => ({
  tocarSomNotificacao: (u?: string) => somMock(u),
  prepararSomNotificacao: () => {},
}));
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
        Object.entries(p).filter(([k]) => !['initial', 'animate', 'exit', 'transition', 'layout'].includes(k)),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (globalThis as any).__React.createElement('div', limpo, children as never);
    },
  }),
}));

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__React = React;

import { NotificacaoToast, MAX_VISIVEIS } from './NotificacaoToast';
import { DURACAO_POR_URGENCIA } from '@/lib/notificacoes-tipo';

/** Título que a taxonomia classifica como `importacao`/`info` — o mais curto. */
const INFO = 'Analítico atualizado';
/** Título classificado como `vinculo`/`critica` — o que fica mais tempo. */
const CRITICO = 'Seu acordo EXTRA virou DIRETO';

function notif(over: Partial<Notificacao> & { id: string }): Notificacao {
  return {
    usuario_id: 'eu', titulo: INFO, mensagem: 'chegou',
    lida: false, criado_em: new Date().toISOString(), rota: '/analitico',
    ...over,
  } as Notificacao;
}

function renderizar() {
  return render(React.createElement(NotificacaoToast));
}

/** Reidrata o provider e deixa o efeito de promoção rodar. */
function chegam(rerender: (ui: React.ReactElement) => void, lista: Notificacao[]) {
  estado = { notificacoes: lista };
  act(() => { rerender(React.createElement(NotificacaoToast)); });
}

beforeEach(() => {
  vi.useFakeTimers();
  navigateMock.mockClear();
  marcarLidaMock.mockClear();
  somMock.mockClear();
  estado = { notificacoes: [] };
});
afterEach(() => { vi.useRealTimers(); });

describe('o que entra na pilha', () => {
  it('não mostra o que já existia ao montar — isso é histórico', () => {
    estado = { notificacoes: [notif({ id: 'velha' })] };
    renderizar();
    expect(screen.queryByText(INFO)).toBeNull();
  });

  it('mostra a notificação que chega depois de montar', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'n1', titulo: 'Chegou agora' })]);
    expect(screen.getByText('Chegou agora')).toBeTruthy();
  });

  it('notificação já lida não vira card', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'n1', titulo: 'Lida', lida: true })]);
    expect(screen.queryByText('Lida')).toBeNull();
  });
});

describe('pilha de três', () => {
  it('três chegando juntas aparecem TODAS, não uma por vez', () => {
    const { rerender } = renderizar();
    // A lista do provider vem da mais nova para a mais antiga.
    chegam(rerender, [
      notif({ id: 'n3', titulo: 'Terceira' }),
      notif({ id: 'n2', titulo: 'Segunda' }),
      notif({ id: 'n1', titulo: 'Primeira' }),
    ]);

    expect(screen.getByText('Primeira')).toBeTruthy();
    expect(screen.getByText('Segunda')).toBeTruthy();
    expect(screen.getByText('Terceira')).toBeTruthy();
  });

  it('a quarta espera vaga e é anunciada na fila', () => {
    const { rerender } = renderizar();
    chegam(rerender, [
      notif({ id: 'n4', titulo: 'Quarta' }),
      notif({ id: 'n3', titulo: 'Terceira' }),
      notif({ id: 'n2', titulo: 'Segunda' }),
      notif({ id: 'n1', titulo: 'Primeira' }),
    ]);

    expect(screen.queryByText('Quarta')).toBeNull();
    expect(screen.getByText('+1 na fila')).toBeTruthy();

    // Some a primeira → abre vaga para a quarta.
    act(() => { vi.advanceTimersByTime(DURACAO_POR_URGENCIA.info + 200); });
    expect(screen.queryByText('Primeira')).toBeNull();
    expect(screen.getByText('Quarta')).toBeTruthy();
  });

  it('nunca passa do teto de visíveis', () => {
    const { rerender } = renderizar();
    chegam(rerender, Array.from({ length: 6 }, (_, i) =>
      notif({ id: `n${6 - i}`, titulo: `Card ${6 - i}` })));

    const naTela = Array.from({ length: 6 }, (_, i) => i + 1)
      .filter(i => screen.queryByText(`Card ${i}`) !== null);
    expect(naTela).toHaveLength(MAX_VISIVEIS);
  });
});

describe('tempo na tela', () => {
  it('some sozinha depois do tempo da urgência', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'n1' })]);
    expect(screen.getByText(INFO)).toBeTruthy();

    act(() => { vi.advanceTimersByTime(DURACAO_POR_URGENCIA.info + 200); });
    expect(screen.queryByText(INFO)).toBeNull();
  });

  // Os 2 s antigos valiam para tudo e não davam para ler duas linhas.
  it('a crítica continua na tela quando a informativa já saiu', () => {
    const { rerender } = renderizar();
    chegam(rerender, [
      notif({ id: 'n2', titulo: CRITICO, rota: null }),
      notif({ id: 'n1', titulo: INFO }),
    ]);

    act(() => { vi.advanceTimersByTime(DURACAO_POR_URGENCIA.info + 200); });
    expect(screen.queryByText(INFO)).toBeNull();
    expect(screen.getByText(CRITICO)).toBeTruthy();

    act(() => { vi.advanceTimersByTime(DURACAO_POR_URGENCIA.critica); });
    expect(screen.queryByText(CRITICO)).toBeNull();
  });

  it('mouse em cima congela a contagem — é o que torna o card legível', () => {
    const { rerender, container } = renderizar();
    chegam(rerender, [notif({ id: 'n1' })]);

    const pilha = container.firstElementChild as HTMLElement;
    act(() => { fireEvent.mouseEnter(pilha); });
    act(() => { vi.advanceTimersByTime(DURACAO_POR_URGENCIA.info * 3); });
    expect(screen.getByText(INFO)).toBeTruthy();

    act(() => { fireEvent.mouseLeave(pilha); });
    act(() => { vi.advanceTimersByTime(DURACAO_POR_URGENCIA.info + 200); });
    expect(screen.queryByText(INFO)).toBeNull();
  });
});

describe('interação', () => {
  it('clicar leva para a rota da notificação e marca como lida', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'n1', rota: '/analitico?aba=diario' })]);

    act(() => { screen.getByLabelText(`Abrir: ${INFO}`).click(); });

    expect(navigateMock).toHaveBeenCalledWith('/analitico?aba=diario');
    expect(marcarLidaMock).toHaveBeenCalledWith('n1');
  });

  it('o X fecha só aquele card e NÃO navega', () => {
    const { rerender } = renderizar();
    chegam(rerender, [
      notif({ id: 'n2', titulo: 'Fica' }),
      notif({ id: 'n1', titulo: 'Sai' }),
    ]);

    act(() => { screen.getByLabelText('Fechar aviso: Sai').click(); });

    expect(screen.queryByText('Sai')).toBeNull();
    expect(screen.getByText('Fica')).toBeTruthy();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

describe('som', () => {
  it('não toca nada pelo histórico da montagem', () => {
    estado = { notificacoes: [notif({ id: 'velha' })] };
    renderizar();
    expect(somMock).not.toHaveBeenCalled();
  });

  it('toca ao abrir o card', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'n1' })]);
    expect(somMock).toHaveBeenCalledTimes(1);
  });

  // Três promovidas no mesmo ciclo são UM evento para o ouvido; três estalos
  // colados viram ruído, não aviso.
  it('uma leva inteira toca uma vez só', () => {
    const { rerender } = renderizar();
    chegam(rerender, [
      notif({ id: 'n3', titulo: 'C' }),
      notif({ id: 'n2', titulo: 'B' }),
      notif({ id: 'n1', titulo: 'A' }),
    ]);
    expect(somMock).toHaveBeenCalledTimes(1);
  });

  it('a leva toca com a urgência da mais grave dela', () => {
    const { rerender } = renderizar();
    chegam(rerender, [
      notif({ id: 'n2', titulo: CRITICO, rota: null }),
      notif({ id: 'n1', titulo: INFO }),
    ]);
    expect(somMock).toHaveBeenCalledWith('critica');
  });

  it('leva só de informativas toca no volume discreto', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'n1' })]);
    expect(somMock).toHaveBeenCalledWith('info');
  });
});
