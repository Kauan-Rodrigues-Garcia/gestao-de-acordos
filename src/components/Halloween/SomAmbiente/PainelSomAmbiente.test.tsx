/**
 * O seletor de faixas do painel: temas e músicas em abas separadas, em
 * páginas — a lista cresce sem virar uma rolagem sem fim.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { MUSICAS, PADRAO, TEMAS_DE_TERROR } from './preferencias';

const motor = vi.hoisted(() => ({
  snap: {} as Record<string, unknown>,
  ouvintes: new Set<() => void>(),
  escolher: vi.fn(),
}));

vi.mock('./motor', async () => {
  const { useSyncExternalStore } = await import('react');
  const nada = () => {};
  return {
    ALTURA_PALCO: 152,
    useSomAmbiente: () => useSyncExternalStore(
      (o: () => void) => { motor.ouvintes.add(o); return () => { motor.ouvintes.delete(o); }; },
      () => motor.snap,
    ),
    escolher: motor.escolher,
    alternar: nada, ancorarPalco: nada, buscar: nada, definirRepetir: nada, definirTocarAoEntrar: nada,
    definirVolume: nada, pular: nada, salvarPlaylists: nada, progresso: () => null,
  };
});

import { PainelSomAmbiente, POR_PAGINA } from './PainelSomAmbiente';

const SPOTIFY = { id: 'spotify:playlist:A', url: 'https://open.spotify.com/playlist/A', nome: 'Foco' };

function publicar(parcial: Record<string, unknown>) {
  act(() => {
    motor.snap = { ...motor.snap, ...parcial };
    for (const o of motor.ouvintes) o();
  });
}

const faixasNaTela = () => [...screen.getByRole('tabpanel').querySelectorAll('button[aria-pressed]')];

beforeEach(() => {
  motor.snap = {
    estado: 'parado', prefs: { ...PADRAO, playlists: [SPOTIFY] }, silenciado: false, noAr: null,
    playerAberto: false, completo: false, volumeMax: 50, erro: null, perfil: 'p1',
  };
  motor.ouvintes.clear();
  motor.escolher.mockClear();
});

describe('seletor de faixas', () => {
  it('enxuto: abas Temas e Músicas, sem Playlists, abrindo na aba da faixa escolhida', () => {
    render(<PainelSomAmbiente />);
    const abas = screen.getAllByRole('tab').map(t => t.textContent);
    expect(abas).toEqual([`Temas${TEMAS_DE_TERROR.length}`, `Músicas${MUSICAS.length}`]);
    expect(screen.getByRole('tab', { name: /Temas/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel')).queryByText('Rainha da Finesse')).toBeNull();
  });

  it('mostra uma página por vez e vira a página', () => {
    render(<PainelSomAmbiente />);
    fireEvent.click(screen.getByRole('tab', { name: /Músicas/ }));
    expect(faixasNaTela()).toHaveLength(POR_PAGINA);
    expect(screen.getByText(`1 de ${Math.ceil(MUSICAS.length / POR_PAGINA)}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(faixasNaTela()).toHaveLength(MUSICAS.length - POR_PAGINA);
    expect(screen.getByRole('button', { name: 'Próxima página' })).toBeDisabled();
  });

  it('busca por nome ou artista, sem acento', () => {
    render(<PainelSomAmbiente />);
    fireEvent.click(screen.getByRole('tab', { name: /Músicas/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar na lista' }), { target: { value: 'linkin' } });
    expect(faixasNaTela().map(b => b.textContent)).toEqual(['NumbLinkin Park']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar na lista' }), { target: { value: 'BOLADAO' } });
    expect(faixasNaTela()).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar na lista' }), { target: { value: 'xyz' } });
    expect(screen.getByText(/Nada com/)).toBeInTheDocument();
  });

  it('clicar escolhe a faixa', () => {
    render(<PainelSomAmbiente />);
    fireEvent.click(screen.getByRole('tab', { name: /Músicas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Numb/ }));
    expect(motor.escolher).toHaveBeenCalledWith('numb');
  });

  it('trocar de faixa pelo anterior/próxima leva à aba e à página dela', () => {
    render(<PainelSomAmbiente />);
    publicar({ prefs: { ...PADRAO, faixa: MUSICAS[MUSICAS.length - 1], playlists: [] } });
    expect(screen.getByRole('tab', { name: /Músicas/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel')).getByText('Geme Baixo')).toBeInTheDocument();
  });

  it('completo: tem a aba Playlists, com as da pessoa e o campo de adicionar', () => {
    motor.snap = { ...motor.snap, completo: true, volumeMax: 100 };
    render(<PainelSomAmbiente />);
    fireEvent.click(screen.getByRole('tab', { name: /Playlists/ }));
    expect(within(screen.getByRole('tabpanel')).getByText('Foco')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Link do Spotify ou YouTube')).toBeInTheDocument();
  });
});
