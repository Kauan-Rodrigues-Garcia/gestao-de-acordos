/**
 * ComemoracaoOverlay.test.tsx — a festa chegando na tela certa.
 *
 * O que se perde se isto quebrar: comemoração aparecendo para o setor errado,
 * ou não aparecendo para ninguém. As duas falham em silêncio em produção.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

const somMock = vi.fn();
vi.mock('@/lib/som-comemoracao', () => ({
  tocarSomComemoracao: (...a: unknown[]) => somMock(...a),
  estaMudo: () => false,
  definirMudo: vi.fn(),
}));

let perfilAtual: { id: string; setor_id: string | null } | null = null;
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: perfilAtual }) }));
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: { id: 'emp' } }) }));

interface LinhaFake {
  id: string; titulo: string; mensagem: string | null;
  efeito: string; som: string; inicia_em: string; duracao_s: number;
  setores_alvo: string[]; cancelada_em: string | null; criado_por: string | null;
  criado_em: string; empresa_id: string;
  homenageados: { id: string; nome: string; foto_url: string | null }[];
}

interface ParabensFake {
  comemoracao_id: string;
  usuario_id: string;
  frase: string;
  criado_em: string;
  pessoa: { id: string; nome: string; foto_url: string | null } | null;
}

let linhas: LinhaFake[] = [];
let parabensNoBanco: ParabensFake[] = [];
const parabenizarMock = vi.fn(() => Promise.resolve({ ok: true, erro: null, dados: null }));

vi.mock('@/services/comemoracoes.service', () => ({
  buscarComemoracoes: () => Promise.resolve({
    data: linhas, dbAtiva: true, erro: null, agoraServidor: new Date().toISOString(),
  }),
  buscarParabens: () => Promise.resolve(parabensNoBanco),
  parabenizar: (...a: unknown[]) => parabenizarMock(...(a as [])),
}));

vi.mock('@/lib/realtime', () => ({ assinarTabela: () => () => {} }));

// framer-motion com fake timers trava o teste; aqui só a estrutura importa.
//
// A TAG é preservada (`motion.button` vira `<button>`, não `<div>`): sem isso
// o botão de parabenizar perderia o papel de botão e sumiria das buscas por
// role — que é como o leitor de tela também o encontraria.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: unknown }) => children as never,
  motion: new Proxy({}, {
    get: (_alvo, tag: string) => ({ children, ...p }: Record<string, unknown> & { children?: unknown }) => {
      const limpo = Object.fromEntries(
        Object.entries(p).filter(([k]) => !['initial', 'animate', 'exit', 'transition'].includes(k)),
      );
      return React.createElement(tag, limpo as never, children as never);
    },
  }),
}));

import { ComemoracaoOverlay } from './ComemoracaoOverlay';

function linha(over: Partial<LinhaFake> = {}): LinhaFake {
  return {
    id: 'c1', titulo: 'META BATIDA!', mensagem: null,
    efeito: 'confete', som: 'fanfarra',
    inicia_em: new Date().toISOString(), duracao_s: 20,
    setores_alvo: ['s-a'], cancelada_em: null, criado_por: 'outro',
    criado_em: new Date().toISOString(), empresa_id: 'emp',
    homenageados: [{ id: 'op1', nome: 'Ana Silva', foto_url: null }],
    ...over,
  };
}

beforeEach(() => {
  somMock.mockClear();
  parabenizarMock.mockClear();
  linhas = [];
  parabensNoBanco = [];
  perfilAtual = { id: 'eu', setor_id: 's-a' };
});

afterEach(() => { vi.useRealTimers(); });

/** Renderiza e deixa o efeito de carga resolver. */
async function montar() {
  let r: ReturnType<typeof render>;
  await act(async () => {
    r = render(React.createElement(ComemoracaoOverlay));
    await Promise.resolve();
  });
  return r!;
}

describe('ComemoracaoOverlay', () => {
  it('explode para quem é do setor alvo', async () => {
    linhas = [linha()];
    await montar();
    expect(screen.getByText('META BATIDA!')).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
  });

  it('NÃO explode para quem é de outro setor', async () => {
    linhas = [linha({ setores_alvo: ['s-b'] })];
    await montar();
    expect(screen.queryByText('META BATIDA!')).toBeNull();
  });

  it('explode para quem criou, mesmo de fora do setor', async () => {
    perfilAtual = { id: 'eu', setor_id: 's-z' };
    linhas = [linha({ criado_por: 'eu', setores_alvo: ['s-a'] })];
    await montar();
    expect(screen.getByText('META BATIDA!')).toBeTruthy();
  });

  it('comemoração já terminada não aparece', async () => {
    const antiga = new Date(Date.now() - 60_000).toISOString();
    linhas = [linha({ inicia_em: antiga, duracao_s: 10 })];
    await montar();
    expect(screen.queryByText('META BATIDA!')).toBeNull();
  });

  it('cancelada não aparece', async () => {
    linhas = [linha({ cancelada_em: new Date().toISOString() })];
    await montar();
    expect(screen.queryByText('META BATIDA!')).toBeNull();
  });

  it('toca o som uma vez só', async () => {
    linhas = [linha()];
    await montar();
    expect(somMock).toHaveBeenCalledTimes(1);
    expect(somMock).toHaveBeenCalledWith('fanfarra');
  });

  it('uma de cada vez: a segunda espera', async () => {
    linhas = [
      linha({ id: 'c1', titulo: 'PRIMEIRA', inicia_em: new Date(Date.now() - 1000).toISOString() }),
      linha({ id: 'c2', titulo: 'SEGUNDA',  inicia_em: new Date().toISOString() }),
    ];
    await montar();
    expect(screen.getByText('PRIMEIRA')).toBeTruthy();
    expect(screen.queryByText('SEGUNDA')).toBeNull();
  });

  it('fechar tira o card da tela', async () => {
    linhas = [linha()];
    await montar();
    await act(async () => {
      screen.getByLabelText('Fechar comemoração').click();
      await Promise.resolve();
    });
    expect(screen.queryByText('META BATIDA!')).toBeNull();
  });

  it('sem perfil não renderiza nada', async () => {
    perfilAtual = null;
    linhas = [linha()];
    await montar();
    expect(screen.queryByText('META BATIDA!')).toBeNull();
  });
});

describe('parabéns', () => {
  it('quem assiste vê o botão com o nome do homenageado', async () => {
    linhas = [linha()];
    await montar();
    expect(screen.getByRole('button', { name: /Parabenizar Ana/i })).toBeTruthy();
  });

  it('com vários homenageados, o botão fala do time', async () => {
    linhas = [linha({
      homenageados: [
        { id: 'op1', nome: 'Ana Silva', foto_url: null },
        { id: 'op2', nome: 'Bruno Costa', foto_url: null },
      ],
    })];
    await montar();
    expect(screen.getByRole('button', { name: /Parabenizar o time/i })).toBeTruthy();
  });

  it('O HOMENAGEADO NÃO se parabeniza', async () => {
    // Sem esta regra a pessoa veria um botão para se aplaudir, e o próprio
    // nome subiria entre os balões dos colegas.
    perfilAtual = { id: 'op1', setor_id: 's-a' };
    linhas = [linha({ homenageados: [{ id: 'op1', nome: 'Ana Silva', foto_url: null }] })];
    await montar();
    expect(screen.queryByRole('button', { name: /Parabenizar/i })).toBeNull();
  });

  it('clicar registra o parabéns com uma frase', async () => {
    linhas = [linha()];
    await montar();

    await act(async () => {
      screen.getByRole('button', { name: /Parabenizar/i }).click();
      await Promise.resolve();
    });

    expect(parabenizarMock).toHaveBeenCalledTimes(1);
    const args = parabenizarMock.mock.calls[0][0] as { frase: string; usuarioId: string };
    expect(args.usuarioId).toBe('eu');
    expect(args.frase.length).toBeGreaterThan(0);
  });

  it('quem já parabenizou vê o botão travado', async () => {
    parabensNoBanco = [{
      comemoracao_id: 'c1', usuario_id: 'eu', frase: 'Que orgulho!',
      criado_em: new Date().toISOString(),
      pessoa: { id: 'eu', nome: 'Eu Mesmo', foto_url: null },
    }];
    linhas = [linha()];
    await montar();

    expect(screen.getByRole('button', { name: /Parabenizado/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Parabenizar Ana/i })).toBeNull();
  });

  it('o contador mostra quantos parabenizaram', async () => {
    parabensNoBanco = [
      { comemoracao_id: 'c1', usuario_id: 'u1', frase: 'Show!', criado_em: new Date().toISOString(), pessoa: null },
      { comemoracao_id: 'c1', usuario_id: 'u2', frase: 'Boa!',  criado_em: new Date().toISOString(), pessoa: null },
    ];
    linhas = [linha()];
    await montar();
    expect(screen.getByRole('button', { name: /Parabenizar Ana/i }).textContent).toContain('2');
  });

  it('o ensaio não oferece parabenizar', async () => {
    // Parabéns de teste sujariam o histórico da comemoração.
    linhas = [];
    await montar();
    expect(screen.queryByRole('button', { name: /Parabenizar/i })).toBeNull();
  });
});
