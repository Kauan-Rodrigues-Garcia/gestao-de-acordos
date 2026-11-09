/**
 * O card do canto MONTA e aparece só quando deve? — com o banco simulado.
 *
 * Votação aberta e eu não votei → «Votar agora», que abre a votação de verdade
 * e envia pelo banco. Já votei → nada. Resultado liberado → «Ver resultado».
 * Banco sem a migration → nada, e não fica perguntando.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RetratoDaVotacao } from './banco';

vi.mock('framer-motion', () => {
  const limpar = (p: Record<string, unknown>) => {
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(p)) if (!['initial', 'animate', 'exit', 'transition', 'whileHover', 'whileTap', 'layout'].includes(k)) r[k] = v;
    return r;
  };
  return {
    motion: new Proxy({}, {
      get: (_, tag: string) => ({ children, ...p }: { children?: React.ReactNode }) => {
        const Tag = tag as unknown as React.ElementType;
        return <Tag {...limpar(p)}>{children}</Tag>;
      },
    }),
    AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  };
});
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ perfil: { id: 'a', perfil: 'lider' } }) }));

const PERGUNTAS = Array.from({ length: 3 }, (_, i) => ({ id: `q${i + 1}`, emoji: '⭐', texto: `Pergunta ${i + 1}?` }));
const aberta = (enviado_em: string | null): RetratoDaVotacao => ({
  votacao: { id: 'v1', titulo: 'Votação de novembro', produto: 'cobranca', estado: 'aberta', aberta_em: null, liberada_em: null },
  perguntas: PERGUNTAS,
  participantes: ['Ana', 'Bruno', 'Carla', 'Diego'].map((nome, i) => ({ id: 'abcd'[i], nome, foto: null, perfil: 'lider', setor: 'Play 1' })),
  contagem: null, desempates: null, enviado_em,
});

const banco = vi.hoisted(() => ({
  minhas: vi.fn(), resultados: vi.fn(), enviar: vi.fn(), resultado: vi.fn(),
}));
vi.mock('./banco', async importOriginal => ({
  ...(await importOriginal<typeof import('./banco')>()),
  lerMinhasVotacoes: banco.minhas,
  lerMeusResultados: banco.resultados,
  enviarVotos: banco.enviar,
  lerResultado: banco.resultado,
}));

class RO { observe() {} disconnect() {} unobserve() {} }
Object.defineProperty(globalThis, 'ResizeObserver', { value: RO, configurable: true });
Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1280 });
Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 700 });

const { AvisoVotacao } = await import('./AvisoVotacao');
const { ErroDoBanco } = await import('./banco');

describe('AvisoVotacao', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(banco).forEach(f => f.mockReset());
    banco.resultados.mockResolvedValue([]);
  });

  it('votação aberta e eu não votei: «Votar agora» abre, só envia completo, e grava pelo banco', async () => {
    banco.minhas.mockResolvedValue([aberta(null)]);
    banco.enviar.mockResolvedValue(undefined);
    render(<AvisoVotacao recuoEsquerda={16} />);
    expect(await screen.findByText('Sua vez de votar!')).toBeTruthy();
    expect(screen.queryByText(/demonstração/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Votar agora/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Começar/ }));
    expect(screen.queryByText(/nada é gravado/i)).toBeNull(); // modo de verdade, sem selo

    // 4 participantes: 3 colegas para 3 categorias.
    const escolher = async (n: number, nome: string) => {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Pergunta ${n}\\? — sem escolha`) }));
      fireEvent.click(within(await screen.findByRole('radiogroup', { name: `Pergunta ${n}?` })).getByRole('radio', { name: nome }));
      await waitFor(() => expect(screen.queryByRole('radiogroup', { name: `Pergunta ${n}?` })).toBeNull());
    };
    await escolher(1, 'Bruno');
    await escolher(2, 'Carla');
    const botao = () => screen.getByRole('button', { name: /Faltam|Enviar meus votos/ }) as HTMLButtonElement;
    expect(botao().disabled).toBe(true);
    await escolher(3, 'Diego');
    fireEvent.click(botao());
    expect(await screen.findByText('Votos enviados!')).toBeTruthy();
    expect(banco.enviar).toHaveBeenCalledWith('v1', { q1: 'b', q2: 'c', q3: 'd' }, expect.any(String));
  });

  it('o banco recusou: mostra o erro e não fecha', async () => {
    banco.minhas.mockResolvedValue([aberta(null)]);
    banco.enviar.mockRejectedValue(new ErroDoBanco('Esta votação não está aberta.', '22023'));
    render(<AvisoVotacao recuoEsquerda={16} />);
    fireEvent.click(await screen.findByRole('button', { name: /Votar agora/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Começar/ }));
    for (const [n, nome] of [[1, 'Bruno'], [2, 'Carla'], [3, 'Diego']] as const) {
      fireEvent.click(await screen.findByRole('button', { name: new RegExp(`Pergunta ${n}\\? — sem escolha`) }));
      fireEvent.click(within(await screen.findByRole('radiogroup', { name: `Pergunta ${n}?` })).getByRole('radio', { name: nome }));
      await waitFor(() => expect(screen.queryByRole('radiogroup', { name: `Pergunta ${n}?` })).toBeNull());
    }
    fireEvent.click(screen.getByRole('button', { name: /Enviar meus votos/ }));
    expect(await screen.findByText('Esta votação não está aberta.')).toBeTruthy();
    expect(screen.queryByText('Votos enviados!')).toBeNull();
  });

  it('já votei: nenhum card', async () => {
    banco.minhas.mockResolvedValue([aberta('2026-11-04T12:00:00Z')]);
    render(<AvisoVotacao recuoEsquerda={16} />);
    await waitFor(() => expect(banco.minhas).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText('Sua vez de votar!')).toBeNull();
  });

  it('resultado liberado: «Ver resultado», e dispensar some com ele', async () => {
    banco.minhas.mockResolvedValue([]);
    banco.resultados.mockResolvedValue([{ id: 'v9', titulo: 'Votação de outubro', liberada_em: '2026-11-01T12:00:00Z' }]);
    render(<AvisoVotacao recuoEsquerda={16} />);
    expect(await screen.findByText('Saiu o resultado!')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByText('Saiu o resultado!')).toBeNull();
    expect(localStorage.getItem('votacao-lideres:resultado-visto:v9')).toBe('1');
  });

  it('resultado de verdade: não fala em demonstração', async () => {
    banco.minhas.mockResolvedValue([]);
    banco.resultados.mockResolvedValue([{ id: 'v9', titulo: 'Votação de outubro', liberada_em: '2026-11-01T12:00:00Z' }]);
    banco.resultado.mockResolvedValue({
      ...aberta(null), votacao: { ...aberta(null).votacao, id: 'v9', estado: 'liberada' },
      contagem: [{ pergunta_id: 'q1', candidato_id: 'b', votos: 3 }], desempates: [],
    });
    render(<AvisoVotacao recuoEsquerda={16} />);
    fireEvent.click(await screen.findByRole('button', { name: /Ver resultado/ }));
    expect(await screen.findByText(/Liberado pela diretoria/)).toBeTruthy();
    expect(screen.queryByText(/demonstração|sorteados/i)).toBeNull();
  });

  it('aba escondida não pergunta; a volta põe em dia, mas não repete leitura recente', async () => {
    vi.useFakeTimers();
    const visibilidade = (v: 'visible' | 'hidden') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    try {
      banco.minhas.mockResolvedValue([]);
      render(<AvisoVotacao recuoEsquerda={16} />);
      await act(async () => { await vi.advanceTimersByTimeAsync(0); });
      expect(banco.minhas).toHaveBeenCalledTimes(1);

      visibilidade('hidden');
      await act(async () => { await vi.advanceTimersByTimeAsync(13 * 60_000); });
      expect(banco.minhas).toHaveBeenCalledTimes(1); // 2 voltas do relógio, nenhuma pergunta

      visibilidade('visible');
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      expect(banco.minhas).toHaveBeenCalledTimes(2);

      visibilidade('hidden');
      visibilidade('visible');
      await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
      expect(banco.minhas).toHaveBeenCalledTimes(2); // leu há menos de 2 min
    } finally {
      delete (document as unknown as { visibilityState?: string }).visibilityState;
      vi.useRealTimers();
    }
  });

  it('banco sem a migration: nada aparece', async () => {
    banco.minhas.mockRejectedValue(new ErroDoBanco('Could not find the function public.fn_votacao_lideranca_minha', 'PGRST202'));
    render(<AvisoVotacao recuoEsquerda={16} />);
    await waitFor(() => expect(banco.minhas).toHaveBeenCalledTimes(1));
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
