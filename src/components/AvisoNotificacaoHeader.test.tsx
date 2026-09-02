/**
 * AvisoNotificacaoHeader.test.tsx — o aviso de notificação na barra superior.
 *
 * As regras que substituíram a pilha de cards flutuantes (02/09/2026):
 *
 *   1. o que chega na CARGA INICIAL é histórico do sino, não vira aviso —
 *      era isto que fazia 50 notificações desfilarem ao entrar;
 *   2. o que chega com a ABA ESCONDIDA também não vira aviso;
 *   3. um por vez, com teto de fila: o excesso vira "+N" e leva ao sino;
 *   4. some no tempo da urgência, o mouse em cima congela, clicar navega.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { Notificacao } from '@/lib/supabase';

const navigateMock   = vi.fn();
const marcarLidaMock = vi.fn(() => Promise.resolve());
const somMock        = vi.fn();

// A arrow adia a leitura dos mocks: `vi.mock` é içado para o topo do arquivo e
// passar a referência direta a leria antes da inicialização.
vi.mock('@/lib/som-notificacao', () => ({
  tocarSomNotificacao: (u?: string) => somMock(u),
  prepararSomNotificacao: () => {},
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('@/lib/tenant-config', () => ({ useTenant: () => ({ isPaguePlay: true }) }));

let estado: { notificacoes: Notificacao[]; cargaInicialConcluida: boolean } = {
  notificacoes: [], cargaInicialConcluida: true,
};
vi.mock('@/providers/NotificacoesProvider', () => ({
  useNotificacoes: () => ({
    notificacoes: estado.notificacoes,
    marcarLida: marcarLidaMock,
    cargaInicialConcluida: estado.cargaInicialConcluida,
  }),
}));

/*
 * framer-motion animando com fake timers trava o teste; aqui só a estrutura
 * importa.
 *
 * O `cache` não é detalhe: sem ele o proxy devolve uma FUNÇÃO NOVA a cada
 * acesso a `motion.div`, e componente com identidade nova faz o React desmontar
 * e remontar a árvore inteira a cada render. O elemento capturado pelo teste
 * ficava órfão no primeiro `setState`, e todo evento disparado nele — o
 * `pointerout` que despausa, por exemplo — nunca chegava ao listener da raiz.
 */
vi.mock('framer-motion', () => {
  const cache = new Map<string, unknown>();
  return {
    AnimatePresence: ({ children }: { children?: unknown }) => children as never,
    motion: new Proxy({}, {
      get: (_alvo, tag: string) => {
        if (!cache.has(tag)) {
          cache.set(tag, ({ children, ...p }: Record<string, unknown> & { children?: unknown }) => {
            const limpo = Object.fromEntries(
              Object.entries(p).filter(([k]) => !['initial', 'animate', 'exit', 'transition', 'layout'].includes(k)),
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (globalThis as any).__React.createElement('div', limpo, children as never);
          });
        }
        return cache.get(tag);
      },
    }),
  };
});

import React from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).__React = React;

import { AvisoNotificacaoHeader, MAX_FILA } from './AvisoNotificacaoHeader';
import { DURACAO_POR_URGENCIA } from '@/lib/notificacoes-tipo';

/** Título que a taxonomia classifica como `importacao`/`info`. */
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
  return render(React.createElement(AvisoNotificacaoHeader));
}

/** Reidrata o provider e deixa os efeitos rodarem. */
function chegam(rerender: (ui: React.ReactElement) => void, lista: Notificacao[]) {
  estado = { ...estado, notificacoes: lista };
  act(() => { rerender(React.createElement(AvisoNotificacaoHeader)); });
}

function esconderAba(escondida: boolean) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (escondida ? 'hidden' : 'visible'),
  });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

/** Quantos avisos estão na barra (o container vazio sempre existe). */
function avisosNaTela(): number {
  return screen.queryAllByRole('button', { name: /^Fechar aviso:/ }).length;
}

describe('AvisoNotificacaoHeader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    estado = { notificacoes: [], cargaInicialConcluida: true };
    navigateMock.mockClear();
    marcarLidaMock.mockClear();
    somMock.mockClear();
    esconderAba(false);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('a carga inicial é histórico: 50 notificações não viram 50 avisos', () => {
    // Entra com a lista ainda vazia e a carga NÃO concluída — é o estado real
    // no primeiro quadro, antes de o banco responder.
    estado = { notificacoes: [], cargaInicialConcluida: false };
    const { rerender } = renderizar();

    // O banco responde com a caixa cheia.
    const caixaCheia = Array.from({ length: 50 }, (_, i) => notif({ id: `h${i}` }));
    estado = { notificacoes: caixaCheia, cargaInicialConcluida: true };
    act(() => { rerender(React.createElement(AvisoNotificacaoHeader)); });

    expect(avisosNaTela()).toBe(0);
    expect(somMock).not.toHaveBeenCalled();
  });

  it('o que chega depois da carga inicial vira aviso', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'a' })]);

    expect(avisosNaTela()).toBe(1);
    expect(screen.getByText(INFO)).toBeTruthy();
    expect(somMock).toHaveBeenCalledTimes(1);
  });

  it('com a aba escondida não aparece aviso nenhum', () => {
    const { rerender } = renderizar();
    esconderAba(true);
    chegam(rerender, [notif({ id: 'a' }), notif({ id: 'b' })]);

    expect(avisosNaTela()).toBe(0);
    expect(somMock).not.toHaveBeenCalled();
  });

  it('voltar para a aba não mostra o que passou', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'a' })]);
    expect(avisosNaTela()).toBe(1);

    esconderAba(true);
    expect(avisosNaTela()).toBe(0);

    esconderAba(false);
    expect(avisosNaTela()).toBe(0);
  });

  it('um por vez, e o excesso da fila vira "+N"', () => {
    const { rerender } = renderizar();
    // 1 na tela + MAX_FILA esperando + 2 que nem entram na fila.
    const total = 1 + MAX_FILA + 2;
    chegam(rerender, Array.from({ length: total }, (_, i) => notif({ id: `n${i}` })));

    expect(avisosNaTela()).toBe(1);
    // Sobram `total - 1` aguardando, entre fila e excedente.
    expect(screen.getByText(`+${total - 1}`)).toBeTruthy();
  });

  // A lista do provider vem da mais NOVA para a mais antiga; a fila mostra na
  // ordem em que chegaram. Então `b`, que é a mais antiga das duas, aparece
  // primeiro — e é isso que este teste fixa.
  it('some no tempo da urgência e o seguinte entra, na ordem de chegada', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'a' }), notif({ id: 'b', titulo: CRITICO })]);

    expect(screen.getByText(CRITICO)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(DURACAO_POR_URGENCIA.critica + 200); });
    expect(screen.getByText(INFO)).toBeTruthy();
  });

  // `pointerover`/`pointerout`, e não `pointerenter`/`pointerleave`: é deste
  // par que o React deriva `onPointerEnter`/`onPointerLeave` (os originais não
  // borbulham e não chegam ao listener da raiz).
  it('o mouse em cima congela a contagem', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'a' })]);

    const aviso = screen.getByRole('button', { name: /^Abrir:/ });
    fireEvent.pointerOver(aviso);
    act(() => { vi.advanceTimersByTime(DURACAO_POR_URGENCIA.info * 3); });
    expect(avisosNaTela()).toBe(1);

    fireEvent.pointerOut(aviso, { relatedTarget: document.body });
    act(() => { vi.advanceTimersByTime(DURACAO_POR_URGENCIA.info + 200); });
    expect(avisosNaTela()).toBe(0);
  });

  it('clicar marca como lida e navega', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'a', rota: '/analitico' })]);

    fireEvent.click(screen.getByRole('button', { name: /^Abrir:/ }));
    expect(marcarLidaMock).toHaveBeenCalledWith('a');
    expect(navigateMock).toHaveBeenCalledWith('/analitico');
  });

  it('o X fecha sem navegar', () => {
    const { rerender } = renderizar();
    chegam(rerender, [notif({ id: 'a' })]);

    fireEvent.click(screen.getByRole('button', { name: /^Fechar aviso:/ }));
    expect(avisosNaTela()).toBe(0);
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
