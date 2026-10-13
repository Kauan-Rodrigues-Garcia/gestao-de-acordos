/**
 * O visor do header: o fone vira a capa e o nome da música quando ela toca, e
 * só volta a ser fone depois de um tempo de pausa.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

const motor = vi.hoisted(() => ({
  snap: { estado: 'parado', silenciado: false, noAr: null as string | null, prefs: { faixa: 'halloween', playlists: [] } },
  ouvintes: new Set<() => void>(),
  pular: vi.fn(),
  alternar: vi.fn(),
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
    pular: motor.pular,
    alternar: motor.alternar,
  };
});

import { BotaoSomAmbiente, PAUSA_MS } from './BotaoSomAmbiente';

function noAr(faixa: string | null, estado = 'tocando') {
  act(() => {
    motor.snap = { ...motor.snap, estado, noAr: faixa };
    for (const o of motor.ouvintes) o();
  });
}

/** O visor está aberto quando o botão leva o nome da música. */
const visor = () => screen.getByRole('button', { name: /Abrir o painel/ });
const fone = () => screen.getByRole('button', { name: /^Som ambiente(, tocando)?$/ });

beforeEach(() => {
  vi.useFakeTimers();
  motor.snap = { estado: 'parado', silenciado: false, noAr: null, prefs: { faixa: 'halloween', playlists: [] } };
  motor.ouvintes.clear();
  motor.pular.mockClear();
  motor.alternar.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

describe('o visor', () => {
  it('sem música é o fone de sempre', () => {
    render(<BotaoSomAmbiente perfilId="p1" />);
    expect(fone()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Abrir o painel/ })).toBeNull();
  });

  it('tocando, vira o visor com o nome e a capa da música', () => {
    const { container } = render(<BotaoSomAmbiente perfilId="p1" />);
    noAr('saw');
    expect(visor()).toHaveAccessibleName(/Hello Zepp/);
    expect(container.querySelector('img[src="/sounds/capas/saw.jpg"]')).not.toBeNull();
  });

  it('com o mouse em cima, tem anterior, pausar e próxima', () => {
    render(<BotaoSomAmbiente perfilId="p1" />);
    noAr('saw');
    fireEvent.click(screen.getByRole('button', { name: 'Faixa anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Próxima faixa' }));
    expect(motor.pular.mock.calls).toEqual([[-1], [1]]);
    expect(motor.alternar).toHaveBeenCalledTimes(1);
  });

  it('pausou: o visor espera e só então volta a ser fone', () => {
    render(<BotaoSomAmbiente perfilId="p1" />);
    noAr('saw');
    noAr('saw', 'pausado');
    act(() => { vi.advanceTimersByTime(PAUSA_MS - 500); });
    expect(visor()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tocar' })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(600); });
    expect(screen.queryByRole('button', { name: /Abrir o painel/ })).toBeNull();
  });

  it('voltar a tocar dentro do prazo cancela a volta ao fone', () => {
    render(<BotaoSomAmbiente perfilId="p1" />);
    noAr('saw');
    noAr('saw', 'pausado');
    act(() => { vi.advanceTimersByTime(PAUSA_MS - 1000); });
    noAr('saw', 'tocando');
    act(() => { vi.advanceTimersByTime(PAUSA_MS * 2); });
    expect(visor()).toBeInTheDocument();
  });

  it('mouse em cima segura o visor: o prazo não corre', () => {
    const { container } = render(<BotaoSomAmbiente perfilId="p1" />);
    noAr('saw');
    noAr('saw', 'pausado');
    const grupo = container.querySelector('[role="group"]')!;
    fireEvent.mouseEnter(grupo);
    act(() => { vi.advanceTimersByTime(PAUSA_MS * 3); });
    expect(visor()).toBeInTheDocument();
    fireEvent.mouseLeave(grupo);
    act(() => { vi.advanceTimersByTime(PAUSA_MS + 100); });
    expect(screen.queryByRole('button', { name: /Abrir o painel/ })).toBeNull();
  });

  it('parar (nada no ar) recolhe na hora', () => {
    render(<BotaoSomAmbiente perfilId="p1" />);
    noAr('saw');
    noAr(null, 'parado');
    expect(screen.queryByRole('button', { name: /Abrir o painel/ })).toBeNull();
  });
});
