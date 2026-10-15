/**
 * CenaV2.test.tsx — a comemoração 2.0 chegando pelo overlay.
 *
 * O que se perde se isto quebrar: o "Testar" do estúdio não mostrando o card
 * novo, ou uma comemoração da 1.0 sendo desenhada pelo card errado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

vi.mock('@/lib/som-comemoracao', () => ({
  tocarSomComemoracao: vi.fn(),
  tocarArquivoDeSom: vi.fn(() => () => {}),
  estaMudo: () => false,
  definirMudo: vi.fn(),
}));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'eu', setor_id: 's', equipe_id: null } }) }));
vi.mock('@/hooks/useEmpresa', () => ({ useEmpresa: () => ({ empresa: { id: 'emp' } }) }));
vi.mock('@/hooks/useEquipesDoPerfil', () => ({ useEquipesDoPerfil: () => ({ todas: [] }) }));
vi.mock('@/services/comemoracoes.service', () => ({
  buscarComemoracoes: () => Promise.resolve({ data: [], dbAtiva: true, erro: null, agoraServidor: null }),
  buscarParabens: () => Promise.resolve([]),
  parabenizar: vi.fn(),
  finalizarComemoracao: vi.fn(),
  buscarMinhasEquipes: () => Promise.resolve([]),
}));
// As fontes vêm do Google: no teste não há rede, e a letra não é o que se testa.
vi.mock('./carregarFontes', () => ({ carregarFontesDoCard: vi.fn() }));
vi.mock('@/lib/sinais', () => ({ assinarSinal: () => () => {}, assinarAviso: () => () => {}, avisoToca: () => false }));

// Movimento reduzido: sem partículas e sem animação, só a estrutura.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children?: unknown }) => children as never,
  useReducedMotion: () => true,
  motion: new Proxy({}, {
    get: (_alvo, tag: string) => ({ children, ...p }: Record<string, unknown> & { children?: unknown }) => {
      const limpo = Object.fromEntries(
        Object.entries(p).filter(([k]) => !['initial', 'animate', 'exit', 'transition'].includes(k)),
      );
      return React.createElement(tag, limpo as never, children as never);
    },
  }),
}));

import { ComemoracaoOverlay } from '@/components/comemoracao/ComemoracaoOverlay';
import { dispararTeste, type ComemoracaoTeste } from '@/pages/Comemoracoes/testeLocal';
import { designPadrao } from './design';

function teste(over: Partial<ComemoracaoTeste> = {}): ComemoracaoTeste {
  return {
    titulo: 'RECORDE!', mensagem: 'Mandou muito bem', homenageados: [{ id: 'op', nome: 'Ana Souza', foto_url: null }],
    efeito: 'confete', som: 'fanfarra', gifUrl: null, somUrl: null, somInicioS: 0,
    layout: {}, duracaoS: 10, ...over,
  };
}

describe('overlay com a Comemoração 2.0', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('ensaio com design mostra o card novo, com o selo e o troféu', async () => {
    render(<ComemoracaoOverlay />);
    await act(async () => {
      dispararTeste(teste({ design: { ...designPadrao(), selo: 'META DE OUTUBRO' } }));
    });
    expect(screen.getByText('Teste · só você vê')).toBeInTheDocument();
    expect(screen.getByText('RECORDE!')).toBeInTheDocument();
    expect(screen.getByText('META DE OUTUBRO')).toBeInTheDocument();
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Troféu' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar comemoração' })).toBeInTheDocument();
  });

  it('com GIF escolhido, o card mostra o GIF e não o troféu', async () => {
    render(<ComemoracaoOverlay />);
    const gif = {
      id: 'g', titulo: 'dancinha', url: 'https://media.giphy.com/g.gif',
      previa: 'https://media.giphy.com/g.webp', largura: 200, altura: 200,
    };
    await act(async () => { dispararTeste(teste({ design: { ...designPadrao(), gif } })); });
    expect(screen.getByRole('img', { name: 'dancinha' })).toHaveAttribute('src', gif.url);
    expect(screen.queryByRole('img', { name: 'Troféu' })).toBeNull();
  });

  it('ensaio sem design continua no card da 1.0', async () => {
    render(<ComemoracaoOverlay />);
    await act(async () => { dispararTeste(teste()); });
    expect(screen.getByText('RECORDE!')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Troféu' })).toBeNull();
  });
});
