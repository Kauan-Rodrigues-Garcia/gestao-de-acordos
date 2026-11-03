/**
 * useCalendarioSetor — o calendário é sempre o do setor de agora.
 *
 * Quem decide os setores é o banco (`fn_calendario_setores`), pelo cadastro
 * atual. A memória da aba só faz a tela nascer pronta. Cenários:
 *
 *   1. Transferido do Play 2 para o Play 3 com a aba aberta: abre no Play 3, o
 *      mês do Play 2 nunca é pedido, e o botão do topo é avisado.
 *   2. O perfil da aba ainda diz Play 2 (o banco já diz Play 3): vale o banco.
 *   3. Outra pessoa na mesma aba («Entrar como») não herda a lista da anterior.
 *   4. Sem transferência, a lista confirmada não avisa o botão à toa.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const { mockListarSetores, mockBuscarMes } = vi.hoisted(() => ({
  mockListarSetores: vi.fn(),
  mockBuscarMes: vi.fn(),
}));

vi.mock('@/services/calendario/calendario.service', () => ({
  EVENTO_CALENDARIO_SETOR: 'calendario-setor-mudou',
  listarSetoresDoCalendario: mockListarSetores,
  buscarMes: mockBuscarMes,
}));
vi.mock('@/services/metas/metasConfig.service', () => ({
  getMetasConfig: vi.fn().mockResolvedValue({ data: null }),
}));
vi.mock('@/services/vendas/calendarioVendas.service', () => ({
  buscarCalendario: vi.fn(),
}));

import { useCalendarioSetor } from '../useCalendarioSetor';

const PLAY2 = { id: 'setor-play2', nome: 'Play 2', pode_editar: false };
const PLAY3 = { id: 'setor-play3', nome: 'Play 3', pode_editar: false };
const MES = '2026-11';

const mesDoSetor = (titulo: string) => ({
  capa: { tema: 'automatico', titulo, frase: null, expediente_semana: null, expediente_sabado: null },
  eventos: [], publicado: true, publicadoEm: null, temPublicacao: true,
});

beforeEach(() => {
  mockListarSetores.mockReset();
  mockBuscarMes.mockReset();
  mockBuscarMes.mockImplementation(async (_e: string, setorId: string) =>
    mesDoSetor(setorId === PLAY2.id ? 'Mês do Play 2' : 'Mês do Play 3'));
});

describe('useCalendarioSetor — transferência de setor', () => {
  it('transferido com a aba aberta: abre no Play 3 e nunca pede o mês do Play 2', async () => {
    // Primeira abertura, ainda no Play 2: a lista e o mês ficam guardados na aba.
    mockListarSetores.mockResolvedValueOnce([PLAY2]);
    const antes = renderHook(() => useCalendarioSetor('pessoa-1', 'empresa-1', 'cobranca', PLAY2.id, MES));
    await waitFor(() => expect(antes.result.current.dados.capa?.titulo).toBe('Mês do Play 2'));
    antes.unmount();

    // Transferida. Fecha e abre o calendário de novo.
    mockBuscarMes.mockClear();
    mockListarSetores.mockResolvedValueOnce([PLAY3]);
    const aviso = vi.fn();
    window.addEventListener('calendario-setor-mudou', aviso);

    const depois = renderHook(() => useCalendarioSetor('pessoa-1', 'empresa-1', 'cobranca', PLAY3.id, MES));
    await waitFor(() => expect(depois.result.current.dados.capa?.titulo).toBe('Mês do Play 3'));

    expect(depois.result.current.setorId).toBe(PLAY3.id);
    expect(depois.result.current.setores).toEqual([PLAY3]);
    expect(mockBuscarMes).not.toHaveBeenCalledWith('empresa-1', PLAY2.id, MES);
    expect(aviso).toHaveBeenCalled();
    window.removeEventListener('calendario-setor-mudou', aviso);
  });

  it('perfil da aba ainda no Play 2, banco já no Play 3: vale o banco', async () => {
    mockListarSetores.mockResolvedValueOnce([PLAY3]);
    const { result } = renderHook(() => useCalendarioSetor('pessoa-2', 'empresa-1', 'cobranca', PLAY2.id, MES));

    await waitFor(() => expect(result.current.dados.capa?.titulo).toBe('Mês do Play 3'));
    expect(result.current.setorId).toBe(PLAY3.id);
    expect(mockBuscarMes).not.toHaveBeenCalledWith('empresa-1', PLAY2.id, MES);
  });

  it('outra pessoa na mesma aba não herda a lista nem o mês da anterior', async () => {
    mockListarSetores.mockResolvedValueOnce([PLAY2]);
    const primeira = renderHook(() => useCalendarioSetor('pessoa-3', 'empresa-2', 'cobranca', PLAY2.id, MES));
    await waitFor(() => expect(primeira.result.current.dados.capa?.titulo).toBe('Mês do Play 2'));
    primeira.unmount();

    let responder: (l: typeof PLAY3[]) => void = () => undefined;
    mockListarSetores.mockReturnValueOnce(new Promise(r => { responder = r; }));
    const segunda = renderHook(() => useCalendarioSetor('pessoa-4', 'empresa-2', 'cobranca', PLAY3.id, MES));

    // Antes de o banco responder: nada da pessoa anterior na tela.
    expect(segunda.result.current.setores).toEqual([]);
    expect(segunda.result.current.carregandoSetores).toBe(true);
    expect(segunda.result.current.dados.capa).toBeNull();

    responder([PLAY3]);
    await waitFor(() => expect(segunda.result.current.dados.capa?.titulo).toBe('Mês do Play 3'));
  });

  it('sem transferência, reabrir não avisa o botão do topo', async () => {
    mockListarSetores.mockResolvedValue([PLAY3]);
    const primeira = renderHook(() => useCalendarioSetor('pessoa-5', 'empresa-3', 'cobranca', PLAY3.id, MES));
    await waitFor(() => expect(primeira.result.current.dados.capa?.titulo).toBe('Mês do Play 3'));
    primeira.unmount();

    const aviso = vi.fn();
    window.addEventListener('calendario-setor-mudou', aviso);
    const segunda = renderHook(() => useCalendarioSetor('pessoa-5', 'empresa-3', 'cobranca', PLAY3.id, MES));
    // Nasce pronta, com o que estava guardado.
    expect(segunda.result.current.dados.capa?.titulo).toBe('Mês do Play 3');
    await waitFor(() => expect(mockListarSetores).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(segunda.result.current.carregandoMes).toBe(false));
    expect(aviso).not.toHaveBeenCalled();
    window.removeEventListener('calendario-setor-mudou', aviso);
  });
});

describe('useCalendarioSetor — seletor de setor', () => {
  it('quem enxerga vários setores troca pelo seletor, e reabrir volta no escolhido', async () => {
    mockListarSetores.mockResolvedValue([PLAY2, PLAY3]);
    const primeira = renderHook(() => useCalendarioSetor('pessoa-6', 'empresa-4', 'cobranca', PLAY2.id, MES));
    await waitFor(() => expect(primeira.result.current.dados.capa?.titulo).toBe('Mês do Play 2'));
    expect(primeira.result.current.setores).toHaveLength(2);

    act(() => primeira.result.current.setSetorId(PLAY3.id));
    await waitFor(() => expect(primeira.result.current.dados.capa?.titulo).toBe('Mês do Play 3'));
    primeira.unmount();

    const segunda = renderHook(() => useCalendarioSetor('pessoa-6', 'empresa-4', 'cobranca', PLAY2.id, MES));
    expect(segunda.result.current.setorId).toBe(PLAY3.id);
  });

  it('setor escolhido que saiu da lista: volta para o próprio', async () => {
    mockListarSetores.mockResolvedValueOnce([PLAY2, PLAY3]);
    const primeira = renderHook(() => useCalendarioSetor('pessoa-7', 'empresa-5', 'cobranca', PLAY2.id, MES));
    await waitFor(() => expect(primeira.result.current.setores).toHaveLength(2));
    act(() => primeira.result.current.setSetorId(PLAY3.id));
    primeira.unmount();

    mockListarSetores.mockResolvedValueOnce([PLAY2]);
    const segunda = renderHook(() => useCalendarioSetor('pessoa-7', 'empresa-5', 'cobranca', PLAY2.id, MES));
    await waitFor(() => expect(segunda.result.current.setores).toEqual([PLAY2]));
    expect(segunda.result.current.setorId).toBe(PLAY2.id);
  });
});
