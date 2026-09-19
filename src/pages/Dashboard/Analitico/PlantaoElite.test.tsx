/**
 * PlantaoElite.test.tsx — a aba do plantão das Elites.
 *
 * As contas têm teste próprio (`plantaoElite.test.ts`). Aqui fica o que é da
 * tela: qual dia ela pede, o quadro que desenha e o botão de copiar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { RespostaPlantaoElite } from '@/services/plantaoElite/plantaoElite';

const { buscarPlantaoElite, copiarImagemDoElemento } = vi.hoisted(() => ({
  buscarPlantaoElite: vi.fn(),
  copiarImagemDoElemento: vi.fn(async () => 'copiado' as const),
}));

vi.mock('@/services/plantaoElite/plantaoElite', async (original) => ({
  ...(await original<typeof import('@/services/plantaoElite/plantaoElite')>()),
  buscarPlantaoElite,
}));
vi.mock('@/lib/copiarImagem', () => ({ copiarImagemDoElemento }));
vi.mock('@/lib/sinais', () => ({ assinarSinal: () => () => undefined }));
vi.mock('@/lib/index', async (original) => ({
  ...(await original<typeof import('@/lib/index')>()),
  getTodayISO: () => '2026-09-18',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { PlantaoElite } from './PlantaoElite';

function resposta(over: Partial<RespostaPlantaoElite> = {}): RespostaPlantaoElite {
  return {
    data: '2026-09-17',
    plantao: 'impar',
    sou_da_dupla: true,
    membros: [
      { id: 'tiago', nome: 'Tiago Almada', usuario: 'tiago_almada' },
      { id: 'agatha', nome: 'Agatha Rocha', usuario: 'agatha_rocha' },
    ],
    chegadas: [
      { operador_id: 'tiago', hora: 12, valor: 1794, qtd: 2 },
      { operador_id: 'agatha', hora: 11, valor: 2071.33, qtd: 1 },
    ],
    setor: { id: 'rec', nome: 'Receptivo', total: 91435.61, qtd: 412 },
    ultima_chegada: '2026-09-17T23:07:00Z',
    ...over,
  };
}

describe('PlantaoElite', () => {
  beforeEach(() => {
    buscarPlantaoElite.mockReset();
    copiarImagemDoElemento.mockClear();
  });

  it('quem é da dupla ímpar, abrindo num dia par, cai no último dia ímpar', async () => {
    buscarPlantaoElite.mockResolvedValue(resposta());
    render(<PlantaoElite empresaId="emp" />);

    await waitFor(() => expect(buscarPlantaoElite).toHaveBeenCalledWith('emp', '2026-09-17'));
    expect(buscarPlantaoElite).toHaveBeenNthCalledWith(1, 'emp', '2026-09-18');
    expect(await screen.findByText(/Quinta-feira, 17\/09\/2026/)).toBeInTheDocument();
  });

  it('desenha a dupla, as faixas e o total do Receptivo', async () => {
    buscarPlantaoElite.mockResolvedValue(resposta());
    render(<PlantaoElite empresaId="emp" />);

    expect(await screen.findByText('Plantão Ímpar — Tiago & Agatha')).toBeInTheDocument();
    expect(screen.getByText('10:00 - 11:00')).toBeInTheDocument();
    expect(screen.getByText('19:00 - 20:00')).toBeInTheDocument();
    expect(screen.getByText('Total do Receptivo no dia')).toBeInTheDocument();
    expect(screen.getByText('R$ 91.435,61')).toBeInTheDocument();
    // 1.794,00 + 2.071,33
    expect(screen.getAllByText('R$ 3.865,33').length).toBeGreaterThan(0);
  });

  it('o botão copia a folha como imagem', async () => {
    buscarPlantaoElite.mockResolvedValue(resposta());
    render(<PlantaoElite empresaId="emp" />);
    await screen.findByText('Plantão Ímpar — Tiago & Agatha');

    const botao = screen.getByRole('button', { name: /Copiar imagem/ });
    await waitFor(() => expect(botao).toBeEnabled());
    fireEvent.click(botao);

    await waitFor(() => expect(copiarImagemDoElemento).toHaveBeenCalledTimes(1));
    const [el, nome] = copiarImagemDoElemento.mock.calls[0] as unknown as [HTMLElement, string];
    expect(el.classList.contains('folha-elite')).toBe(true);
    expect(nome).toBe('plantao-elite-2026-09-17-Tiago-Agatha.png');
  });

  it('sem dupla cadastrada, avisa em vez de desenhar folha vazia', async () => {
    buscarPlantaoElite.mockResolvedValue(resposta({ sou_da_dupla: false, plantao: 'par', membros: [], chegadas: [] }));
    render(<PlantaoElite empresaId="emp" />);
    expect(await screen.findByText(/Nenhuma dupla cadastrada para o plantão par/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copiar imagem/ })).toBeDisabled();
  });

  it('erro do banco aparece com o que fazer', async () => {
    buscarPlantaoElite.mockRejectedValue(new Error('Sem permissão para o Plantão Elite.'));
    render(<PlantaoElite empresaId="emp" />);
    expect(await screen.findByText('Sem permissão para o Plantão Elite.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
