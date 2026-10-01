/**
 * O card «Tocando agora»: aparece quando começa uma música nova — e só aí.
 * Trocar de tela remonta o `Layout` (e este botão); isso não é música nova.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const motor = vi.hoisted(() => ({
  snap: { estado: 'parado', silenciado: false, noAr: null as string | null, prefs: { playlists: [] } },
  ouvintes: new Set<() => void>(),
}));

vi.mock('./motor', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useSomAmbiente: () => useSyncExternalStore(
      (o: () => void) => { motor.ouvintes.add(o); return () => { motor.ouvintes.delete(o); }; },
      () => motor.snap,
    ),
    iniciarSessao: () => {},
    soltarSessao: () => {},
    dentroDoPalco: () => false,
  };
});

import { BotaoSomAmbiente } from './BotaoSomAmbiente';
import { __esquecerAnuncio } from './anuncio';

function noAr(faixa: string | null, estado = 'tocando') {
  act(() => {
    motor.snap = { ...motor.snap, estado, noAr: faixa };
    for (const o of motor.ouvintes) o();
  });
}

const card = () => document.querySelector('[data-som-tocando-agora]');

beforeEach(() => {
  __esquecerAnuncio();
  motor.snap = { estado: 'parado', silenciado: false, noAr: null, prefs: { playlists: [] } };
  motor.ouvintes.clear();
});

describe('Tocando agora', () => {
  it('anuncia a música que começa', () => {
    render(<BotaoSomAmbiente perfilId="p1" />);
    expect(card()).toBeNull();
    noAr('halloween');
    expect(card()).not.toBeNull();
    expect(screen.getByText('Tocando agora')).toBeInTheDocument();
  });

  it('trocar de tela (remontar o botão) não anuncia de novo a mesma música', () => {
    const primeira = render(<BotaoSomAmbiente perfilId="p1" />);
    noAr('halloween');
    expect(card()).not.toBeNull();
    primeira.unmount();
    expect(card()).toBeNull();

    render(<BotaoSomAmbiente perfilId="p1" />);
    expect(card()).toBeNull();
  });

  it('carregando e voltando, ou pausa e play, não é música nova', () => {
    // Anunciada numa tela; as oscilações acontecem já na seguinte.
    const tela = render(<BotaoSomAmbiente perfilId="p1" />);
    noAr('halloween');
    tela.unmount();
    render(<BotaoSomAmbiente perfilId="p1" />);
    noAr('halloween', 'carregando');
    noAr('halloween', 'tocando');
    noAr('halloween', 'pausado');
    noAr('halloween', 'tocando');
    expect(card()).toBeNull();
  });

  it('música seguinte anuncia; e a primeira de uma sessão nova também', () => {
    const { unmount } = render(<BotaoSomAmbiente perfilId="p1" />);
    noAr('halloween');
    noAr('sexta13');
    expect(screen.getByText(/Sexta/)).toBeInTheDocument();

    // Saiu do sistema (nada no ar) e entrou de novo.
    noAr(null, 'parado');
    unmount();
    render(<BotaoSomAmbiente perfilId="p1" />);
    noAr('sexta13');
    expect(card()).not.toBeNull();
  });
});
