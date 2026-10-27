/**
 * useComemoracaoNoAr — a festa agendada com horas de antecedência toca.
 *
 * 27/10/2026: o Luciano agendou três comemorações e nenhuma tocou para quem
 * estava com o sistema aberto. O overlay só armava timer para o que começava
 * nos próximos 30 min, e nada mais o acordava — a página aberta desde cedo
 * passava pela hora da festa sem olhar a fila.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Comemoracao } from '@/services/comemoracoes.service';

vi.mock('@/services/comemoracoes.service', () => ({
  buscarComemoracoes:   vi.fn(),
  buscarParabens:       vi.fn(),
  parabenizar:          vi.fn(),
  finalizarComemoracao: vi.fn(async () => {}),
  buscarMinhasEquipes:  vi.fn(async () => []),
}));
vi.mock('@/lib/sinais', () => ({
  assinarAviso: () => () => {},
  assinarSinal: () => () => {},
  avisoToca:    () => false,
}));

import { useComemoracaoNoAr, useComemoracoes } from '@/hooks/useComemoracoes';
import { buscarComemoracoes } from '@/services/comemoracoes.service';

const T0 = new Date('2026-10-27T13:00:00.000Z').getTime();

function festa(iniciaEmMs: number, over: Partial<Comemoracao> = {}): Comemoracao {
  return {
    id: 'festa-1',
    empresa_id: 'emp',
    criado_por: 'luciano',
    inicia_em: new Date(iniciaEmMs).toISOString(),
    duracao_s: 20,
    cancelada_em: null,
    finalizada_em: null,
    empresa_inteira: false,
    equipes_alvo: [],
    setores_alvo: ['setor-a'],
    ...over,
  } as unknown as Comemoracao;
}

function montar(lista: Comemoracao[]) {
  return renderHook(() => useComemoracaoNoAr({
    comemoracoes:   lista,
    meuSetorId:     'setor-a',
    meuUsuarioId:   'operador-1',
    agoraCorrigido: () => Date.now(),
  }));
}

describe('useComemoracaoNoAr — agendamento distante', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('agendada para daqui a 5 h, página aberta o tempo todo: entra na hora', () => {
    const lista = [festa(T0 + 5 * 3_600_000)];
    const { result } = montar(lista);
    expect(result.current.atual).toBeNull();

    // Um minuto antes, ainda nada.
    act(() => { vi.advanceTimersByTime(5 * 3_600_000 - 60_000); });
    expect(result.current.atual).toBeNull();

    act(() => { vi.advanceTimersByTime(60_000 + 100); });
    expect(result.current.atual?.id).toBe('festa-1');
  });

  it('timer atrasado (aba escondida, PC dormindo): a vigia pega dentro da janela', () => {
    // 120 s: a vigia acorda até 1 min depois, e a festa ainda tem de estar no ar.
    const lista = [festa(T0 + 2 * 3_600_000, { duracao_s: 120 })];
    const { result } = montar(lista);

    // O relógio pula sem os timers rodarem — o navegador segurou a aba.
    act(() => { vi.setSystemTime(T0 + 2 * 3_600_000 + 10_000); });
    expect(result.current.atual).toBeNull();

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.atual?.id).toBe('festa-1');
  });

  it('a aba volta a aparecer: entra na hora, sem esperar a vigia', () => {
    const lista = [festa(T0 + 3 * 3_600_000)];
    const { result } = montar(lista);

    act(() => { vi.setSystemTime(T0 + 3 * 3_600_000 + 1_000); });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(result.current.atual?.id).toBe('festa-1');
  });

  it('o relógio da tela é o do PC, não o criado_em da festa', async () => {
    // O defeito das 14:50: a «hora do servidor» era o criado_em da festa mais
    // à frente, e a tela voltava 40 min no tempo — tudo seguia «agendada».
    vi.mocked(buscarComemoracoes).mockResolvedValue({
      data: [festa(T0 + 60_000, { criado_em: new Date(T0 - 40 * 60_000).toISOString() } as never)],
      dbAtiva: true, erro: null,
    });
    const { result } = renderHook(() => useComemoracoes('emp'));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.comemoracoes).toHaveLength(1);
    expect(result.current.agoraCorrigido()).toBe(T0);
  });

  it('de outro setor continua sem explodir', () => {
    const lista = [festa(T0 + 60_000, { setores_alvo: ['setor-b'], criado_por: 'outro' })];
    const { result } = montar(lista);
    act(() => { vi.advanceTimersByTime(2 * 60_000); });
    expect(result.current.atual).toBeNull();
  });
});
