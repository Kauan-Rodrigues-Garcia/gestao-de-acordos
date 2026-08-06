/**
 * ModalAdicionarParcela.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A lista de "parcelas personalizadas" nasceu com dois defeitos que só
 * apareciam usando a tela, e é por isso que estes testes existem:
 *
 *  1. o campo de valor guardava o NÚMERO convertido e reescrevia o campo a cada
 *     tecla — "150," virava "150" na mesma hora e nunca dava para digitar os
 *     centavos;
 *  2. na PaguePlay o select de forma da parcela ficava vazio, porque a lista
 *     grava 'boleto' e a única opção oferecida era 'cartao'.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ModalAdicionarParcela, type ModalAdicionarParcelaProps } from './ModalAdicionarParcela';
import type { Acordo } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  },
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const acordo = {
  id: 'a1',
  acordo_grupo_id: null,
  nr_cliente: '12345',
  instituicao: 'COREN-PI',
  nome_cliente: 'Cliente Teste',
  tipo: 'boleto',
  status: 'verificar_pendente',
  valor: 400,
  vencimento: '2026-09-10',
  parcelas: 1,
  numero_parcela: 1,
} as unknown as Acordo;

function abrir(props: Partial<ModalAdicionarParcelaProps> = {}) {
  const onConfirm = vi.fn();
  render(
    <ModalAdicionarParcela
      aberto
      acordo={acordo}
      isPaguePlay={false}
      // Vencimento e valor já preenchidos: o que está em teste é a lista, não o
      // calendário do campo base.
      inicial={{ vencimento: '2026-09-10', valor: 400 }}
      salvando={false}
      onConfirm={onConfirm}
      onClose={vi.fn()}
      {...props}
    />,
  );
  return { onConfirm };
}

/** Liga a lista: quantidade > 1 + checkbox "Parcelas personalizadas". */
async function ligarPersonalizacao(quantidade = '3') {
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: quantidade } });
  fireEvent.click(await screen.findByRole('checkbox'));
  return screen.findAllByPlaceholderText(/R\$/);
}

describe('ModalAdicionarParcela — parcelas personalizadas', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('deixa digitar centavos: a vírgula não é apagada a cada tecla', async () => {
    abrir();
    const campos = await ligarPersonalizacao();

    // O bug aparecia já em "150," — o campo voltava para "150".
    fireEvent.change(campos[0], { target: { value: '150,' } });
    expect((campos[0] as HTMLInputElement).value).toBe('150,');

    fireEvent.change(campos[0], { target: { value: '150,5' } });
    fireEvent.change(campos[0], { target: { value: '150,55' } });
    expect((campos[0] as HTMLInputElement).value).toBe('150,55');
  });

  it('grava o valor com centavos e mantém o padrão nas linhas em branco', async () => {
    const { onConfirm } = abrir();
    const campos = await ligarPersonalizacao();

    fireEvent.change(campos[0], { target: { value: '150,55' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar parcela/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    const lote = onConfirm.mock.calls[0][0];
    expect(lote).toHaveLength(3);
    expect(lote[0].valor).toBe(150.55);
    // Linhas 2 e 3 ficaram em branco: usam o valor do lote, não zero.
    expect(lote[1].valor).toBe(400);
    expect(lote[2].valor).toBe(400);
  });

  it('valor em branco não vira parcela de R$ 0', async () => {
    const { onConfirm } = abrir();
    const campos = await ligarPersonalizacao('2');

    // Digita e apaga: o campo volta a "em branco", não a zero.
    fireEvent.change(campos[0], { target: { value: '90' } });
    fireEvent.change(campos[0], { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar parcela/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][0][0].valor).toBe(400);
  });

  it('PaguePlay: a forma da parcela oferece a opção que vai para o banco', async () => {
    abrir({ isPaguePlay: true });
    await ligarPersonalizacao('2');

    // Antes: as opções eram filtradas para tirar 'boleto_pix' e sobrava só
    // 'cartao' — o select não tinha como exibir o 'boleto' que seria gravado.
    const selects = screen.getAllByRole('combobox');
    const daParcela = selects[selects.length - 1];
    fireEvent.keyDown(daParcela, { key: 'Enter' });

    expect(await screen.findByRole('option', { name: 'Boleto / PIX' })).toBeTruthy();
  });
});
