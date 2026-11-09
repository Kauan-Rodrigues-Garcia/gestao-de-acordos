/**
 * Ver a abertura do Natal de novo, pelo card da música, e o aviso de quem não
 * viu (09/11/2026).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const { rpc, impersonando } = vi.hoisted(() => ({ rpc: vi.fn(), impersonando: { atual: false } }));

vi.mock('@/lib/supabaseSemTipo', () => ({ rpcSemTipo: rpc }));
vi.mock('@/services/impersonacao.service', () => ({ getImpersonacaoAtiva: () => impersonando.atual }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'ana' } }) }));
// A rádio não toca no jsdom: só o estado que o botão desenha.
vi.mock('./musica', () => ({
  useMusicaNatal: () => ({ ligada: false, volume: 50, tocando: false, aviso: false }),
  entrarNaRadio: vi.fn(), sairDaRadio: vi.fn(), ligarMusica: vi.fn(), mudarVolume: vi.fn(),
  fecharAvisoDaMusica: vi.fn(), abaixarRadio: vi.fn(),
}));
vi.mock('./presente/RevisaoDaAbertura', () => ({
  RevisaoDaAbertura: ({ src, aoAssistirInteiro }: { src: string; aoAssistirInteiro: () => void }) => (
    <div data-testid="revisao" data-src={src}>
      <button type="button" onClick={aoAssistirInteiro}>terminou</button>
    </div>
  ),
}));

import { BotaoMusicaNatal } from './BotaoMusicaNatal';
import { esquecerLeiturasDaAbertura } from './assistiuAbertura';
import { segundosAssistidos } from './presente/RevisaoDaAbertura.logica';

function resposta(extra: Record<string, unknown>) {
  rpc.mockImplementation((fn: string) => Promise.resolve(
    fn === 'fn_natal_minha_abertura' ? { data: { cidade: 'Marília', ...extra }, error: null } : { data: null, error: null },
  ));
}

describe('a abertura de novo no card da música', () => {
  beforeEach(() => {
    // O balão mede o botão para apontar a seta; no jsdom tudo mede 0.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      { left: 900, right: 932, top: 10, bottom: 42, width: 32, height: 32, x: 900, y: 10, toJSON: () => ({}) } as DOMRect,
    );
    rpc.mockReset();
    impersonando.atual = false;
    esquecerLeiturasDaAbertura();
    localStorage.clear();
  });

  it('quem pulou vê o balão e o aviso; assistir até o fim grava e o aviso some', async () => {
    resposta({ assistiu_em: null, pulou_em: '2026-11-09T12:00:00Z', liberou_em: '2026-11-09T12:00:00Z' });
    render(<BotaoMusicaNatal />);
    expect(await screen.findByRole('button', { name: 'Agora não' })).toBeTruthy(); // o balão
    expect(screen.getByRole('button', { name: /você ainda não viu a abertura do natal/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Assistir agora' }));
    // O vídeo da cidade: Marília.
    expect(await screen.findByTestId('revisao')).toHaveAttribute('data-src', '/video/natal/abertura-marilia.mp4');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'terminou' })); });
    expect(rpc).toHaveBeenCalledWith('fn_natal_abertura_marcar', { p_evento: 'assistiu', p_video: 'marilia' });
    await waitFor(() => expect(screen.queryByRole('button', { name: /você ainda não viu/i })).toBeNull());
    expect(localStorage.getItem('natal:assistiu-abertura:ana')).toBe('1');
  });

  it('«Agora não» cala o balão até amanhã', async () => {
    resposta({ assistiu_em: null });
    render(<BotaoMusicaNatal />);
    fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    expect(screen.queryByRole('button', { name: 'Agora não' })).toBeNull();
    expect(localStorage.getItem('natal:aviso-abertura-dispensado:ana')).toBe(new Date().toLocaleDateString('sv-SE'));
  });

  it('quem viu inteiro não tem aviso, mas pode ver de novo pelo card', async () => {
    resposta({ assistiu_em: '2026-11-09T12:00:00Z' });
    render(<BotaoMusicaNatal />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Agora não' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Música de Natal/ }));
    expect(await screen.findByRole('button', { name: /Ver a abertura de novo/ })).toBeTruthy();
  });

  it('banco sem resposta: sem aviso nenhum', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } });
    render(<BotaoMusicaNatal />);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Agora não' })).toBeNull();
    expect(screen.queryByRole('button', { name: /você ainda não viu/i })).toBeNull();
  });

  it('no «Entrar como»: não pergunta ao banco nem avisa', async () => {
    impersonando.atual = true;
    resposta({ assistiu_em: null });
    render(<BotaoMusicaNatal />);
    await act(async () => { await Promise.resolve(); });
    expect(rpc).not.toHaveBeenCalledWith('fn_natal_minha_abertura', {});
    expect(screen.queryByRole('button', { name: 'Agora não' })).toBeNull();
    expect(screen.queryByRole('button', { name: /você ainda não viu/i })).toBeNull();
  });
});

describe('«viu inteiro» é o que tocou, não onde a barra parou', () => {
  const trechos = (pares: [number, number][]) => ({
    length: pares.length, start: (i: number) => pares[i][0], end: (i: number) => pares[i][1],
  });
  it('soma os trechos tocados', () => {
    expect(segundosAssistidos(trechos([[0, 30], [100, 120]]))).toBe(50);
    expect(segundosAssistidos(trechos([]))).toBe(0);
  });
});
