import { renderHook, waitFor } from '@testing-library/react';

const listarSetoresDoCalendario = vi.fn();
const buscarMes = vi.fn();
vi.mock('@/services/calendario/calendario.service', () => ({
  EVENTO_CALENDARIO_SETOR: 'calendario-setor-mudou',
  listarSetoresDoCalendario: (...a: unknown[]) => listarSetoresDoCalendario(...a),
  buscarMes: (...a: unknown[]) => buscarMes(...a),
}));

import { useCalendarioHoje } from '../useCalendarioHoje';

const mes = (publicado: boolean, tema: string | null) => ({
  publicado, temPublicacao: true, publicadoEm: null, eventos: [], capa: tema ? { tema } : null,
});

describe('useCalendarioHoje — a cor do botão do tempo', () => {
  beforeEach(() => {
    listarSetoresDoCalendario.mockReset().mockResolvedValue([{ id: 's1', nome: 'Receptivo', pode_editar: true }]);
    buscarMes.mockReset();
  });

  it('mês liberado: o tema dele vale para o tempo', async () => {
    buscarMes.mockResolvedValue(mes(true, 'natal'));
    const { result } = renderHook(() => useCalendarioHoje('e1', 's1', true));
    await waitFor(() => expect(result.current.temSetor).toBe(true));
    expect(result.current.temaLiberado).toBe('natal');
    expect(result.current.setorId).toBe('s1');
  });

  it('rascunho que o líder monta: o calendário veste, o tempo não', async () => {
    buscarMes.mockResolvedValue(mes(false, 'natal'));
    const { result } = renderHook(() => useCalendarioHoje('e1', 's1', true));
    await waitFor(() => expect(result.current.temSetor).toBe(true));
    expect(result.current.tema).toBe('natal');
    expect(result.current.temaLiberado).toBeNull();
  });

  it('sem calendário (sem a chave): nada, e o tempo fica no tema padrão do mês', async () => {
    const { result } = renderHook(() => useCalendarioHoje('e1', 's1', false));
    await new Promise(r => setTimeout(r, 10));
    expect(result.current.temaLiberado).toBeNull();
    expect(buscarMes).not.toHaveBeenCalled();
  });
});
