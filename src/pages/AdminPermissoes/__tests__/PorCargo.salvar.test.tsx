/**
 * PorCargo — salvar não apaga o que a tela não mostra.
 *
 * O defeito de 02/10/2026: a tela gravava o mapa só com as chaves do recorte
 * do produto. No Comercial, cada «Salvar» no cargo apagava `ver_painel_lider`
 * (e o que mais o painel dele escondesse), e o líder perdia a aba sem ninguém
 * tê-la desligado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const upsert = vi.fn(async (_linha: unknown, _opcoes: unknown) => ({ error: null }));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ upsert: (l: unknown, o: unknown) => upsert(l, o) }) },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/useEmpresa', () => ({
  useEmpresa: () => ({ empresa: { id: 'e-comercial' }, tenantSlug: 'comercial' }),
}));
vi.mock('@/hooks/useCargoPermissoes', () => ({
  useCargoPermissoes: () => ({
    todasPermissoes: [{
      cargo: 'operador',
      permissoes: {
        ver_vendas: false,
        // Fora do painel do Comercial — a tela não mostra, e não pode apagar.
        ver_acordos: true,
        chave_que_nao_existe_mais: true,
      },
    }],
    refresh: vi.fn(async () => {}),
  }),
}));

import { PorCargo } from '../PorCargo';

beforeEach(() => upsert.mockClear());

describe('PorCargo — salvar', () => {
  it('o Comercial mostra os cards das abas dele', () => {
    render(<PorCargo />);
    for (const rotulo of [
      'Aba Vendas', 'Aba Indicações', 'Aba Acompanhamento', 'Painel do Líder',
      'Analítico: Desafios', 'Aba Tickets',
    ]) {
      expect(screen.getByRole('switch', { name: rotulo }), rotulo).toBeInTheDocument();
    }
  });

  it('grava o que mudou e mantém as chaves fora do recorte do produto', async () => {
    render(<PorCargo />);
    fireEvent.click(screen.getByRole('switch', { name: 'Aba Vendas' }));
    fireEvent.click(screen.getByRole('button', { name: /Salvar/ }));

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const linha = upsert.mock.calls[0][0] as { cargo: string; permissoes: Record<string, boolean> };
    expect(linha.cargo).toBe('operador');
    expect(linha.permissoes.ver_vendas).toBe(true);
    expect(linha.permissoes.ver_acordos).toBe(true);
    expect(linha.permissoes.chave_que_nao_existe_mais).toBe(true);
  });
});
