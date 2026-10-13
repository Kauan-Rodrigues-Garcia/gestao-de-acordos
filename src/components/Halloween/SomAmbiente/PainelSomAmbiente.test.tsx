/**
 * O painel do Som ambiente: o «Tocando agora» na capa da faixa, e o seletor
 * — temas e músicas em abas separadas, em páginas quando a lista passa de uma
 * (a lista cresce sem virar uma rolagem sem fim).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { MUSICAS, PADRAO, TEMAS_DE_TERROR } from './preferencias';
import { EMBUTIDAS } from './faixas';

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

/** Sete playlists: passa de uma página e liga a busca. */
const MUITAS = Array.from({ length: 7 }, (_, i) => ({
  id: `youtube:playlist:P${i}`,
  url: `https://www.youtube.com/playlist?list=P${i}`,
  nome: i === 6 ? 'Lo-fi Ação' : `Lista ${i}`,
}));

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
    expect(within(screen.getByRole('tabpanel')).queryByText('Provavelmente')).toBeNull();
  });

  it('cinco temas e quatro músicas cabem numa página, sem busca', () => {
    render(<PainelSomAmbiente />);
    expect(faixasNaTela()).toHaveLength(TEMAS_DE_TERROR.length);
    fireEvent.click(screen.getByRole('tab', { name: /Músicas/ }));
    expect(faixasNaTela()).toHaveLength(MUSICAS.length);
    expect(screen.queryByRole('textbox', { name: 'Buscar na lista' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Próxima página' })).toBeNull();
  });

  it('lista que passa de uma página vira páginas, com busca sem acento', () => {
    motor.snap = { ...motor.snap, completo: true, volumeMax: 100, prefs: { ...PADRAO, playlists: MUITAS } };
    render(<PainelSomAmbiente />);
    fireEvent.click(screen.getByRole('tab', { name: /Playlists/ }));
    expect(faixasNaTela()).toHaveLength(POR_PAGINA);
    expect(screen.getByText('1 de 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    expect(faixasNaTela()).toHaveLength(MUITAS.length - POR_PAGINA);
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar na lista' }), { target: { value: 'ACAO' } });
    expect(faixasNaTela().map(b => b.textContent)).toEqual(['Lo-fi AçãoYouTube']);
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar na lista' }), { target: { value: 'xyz' } });
    expect(screen.getByText(/Nada com/)).toBeInTheDocument();
  });

  it('clicar escolhe a faixa', () => {
    render(<PainelSomAmbiente />);
    fireEvent.click(screen.getByRole('tab', { name: /Músicas/ }));
    fireEvent.click(screen.getByRole('button', { name: /Do I Wanna Know/ }));
    expect(motor.escolher).toHaveBeenCalledWith('doiwannaknow');
  });

  it('trocar de faixa pelo anterior/próxima leva à aba e à página dela', () => {
    render(<PainelSomAmbiente />);
    publicar({ prefs: { ...PADRAO, faixa: MUSICAS[MUSICAS.length - 1], playlists: [] } });
    expect(screen.getByRole('tab', { name: /Músicas/ })).toHaveAttribute('aria-selected', 'true');
    expect(within(screen.getByRole('tabpanel')).getByText('Raindance')).toBeInTheDocument();
  });

  it('completo: tem a aba Playlists, com as da pessoa e o campo de adicionar', () => {
    motor.snap = { ...motor.snap, completo: true, volumeMax: 100 };
    render(<PainelSomAmbiente />);
    fireEvent.click(screen.getByRole('tab', { name: /Playlists/ }));
    expect(within(screen.getByRole('tabpanel')).getByText('Foco')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Link do Spotify ou YouTube')).toBeInTheDocument();
  });
});

describe('tocando agora', () => {
  const heroi = () => screen.getByRole('region', { name: 'Tocando agora' });

  it('mostra a capa, o nome e o artista, nas cores da faixa', () => {
    render(<PainelSomAmbiente />);
    expect(within(heroi()).getByText('Halloween')).toBeInTheDocument();
    expect(within(heroi()).getByText('Tema de John Carpenter')).toBeInTheDocument();
    const capas = [...heroi().querySelectorAll('img')].map(i => i.getAttribute('src'));
    expect(capas).toContain('/sounds/capas/halloween.jpg');
    expect(heroi().style.getPropertyValue('--som-fundo')).toBe(EMBUTIDAS.halloween.cor.fundo);
  });

  it('cada faixa da lista tem a sua capa', () => {
    render(<PainelSomAmbiente />);
    for (const id of TEMAS_DE_TERROR) {
      expect(screen.getByRole('tabpanel').querySelector(`img[src="${EMBUTIDAS[id].capa}"]`)).not.toBeNull();
    }
  });

  it('playlist, que não tem capa, fica com o ícone', () => {
    motor.snap = { ...motor.snap, completo: true, volumeMax: 100, prefs: { ...PADRAO, faixa: SPOTIFY.id, playlists: [SPOTIFY] } };
    render(<PainelSomAmbiente />);
    expect(within(heroi()).getByText('Foco')).toBeInTheDocument();
    expect(heroi().querySelector('img')).toBeNull();
    expect(within(heroi()).getByText('Playlist do Spotify')).toBeInTheDocument();
  });

  it('volume e posição têm nome para o leitor de tela', () => {
    render(<PainelSomAmbiente />);
    expect(screen.getByRole('slider', { name: 'Volume, até 50%' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Posição na música' })).toBeInTheDocument();
  });
});
