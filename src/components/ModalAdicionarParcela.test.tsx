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
import { getTodayISO } from '@/lib/index';

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

// Base PAGA: os testes da lista e do recorrente não são sobre parcela em
// aberto — essa tem o bloco dela lá embaixo.
const acordo = {
  id: 'a1',
  acordo_grupo_id: null,
  nr_cliente: '12345',
  instituicao: 'COREN-PI',
  nome_cliente: 'Cliente Teste',
  tipo: 'boleto',
  status: 'pago',
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

  // A lista personalizada saiu da regra Cofen (06/11/2026: lá entra uma parcela
  // por vez). O que o teste antigo guardava — 'boleto' gravado precisa ter
  // uma opção que o mostre — continua valendo para o select da forma.
  it('regra Cofen: a forma da parcela oferece a opção que vai para o banco', async () => {
    abrir({ isPaguePlay: true, inicial: { vencimento: '2026-09-10', valor: 400, tipo: 'boleto' } });
    const forma = screen.getAllByRole('combobox')[0];
    expect(forma.textContent).toMatch(/Boleto \/ PIX/);
  });
});

/*
 * Parcela em aberto (06/11/2026). A nova não vira registro enquanto a atual
 * estiver em aberto, e o modal seguia calado — o valor, a data e a forma
 * digitados se perdiam. Agora ele avisa e a pessoa escolhe.
 */
describe('ModalAdicionarParcela — parcela atual em aberto', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  const aberto = { ...acordo, status: 'verificar_pendente' } as Acordo;

  it('Nosso produto: avisa e não confirma sem a pessoa escolher', async () => {
    const { toast } = await import('sonner');
    const { onConfirm } = abrir({ acordo: aberto });

    expect(screen.getByText(/A parcela #1 .* ainda está em aberto/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar parcela/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/escolha o que fazer/)));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('marcar a atual como paga manda a quitação junto, com o vencimento dela', async () => {
    const { onConfirm } = abrir({ acordo: aberto });
    fireEvent.click(screen.getByLabelText(/A #1 já foi paga/));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar parcela/i }));

    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][1]).toEqual({
      quitar: { parcelaId: 'a1', dataPagamento: '2026-09-10' },
    });
  });

  it('«só aumentar o total» diz que os dados não ficam e não quita nada', async () => {
    const { onConfirm } = abrir({ acordo: aberto });
    fireEvent.click(screen.getByLabelText(/só aumentar o total/));
    expect(screen.getByText(/não ficam guardados/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Aumentar total de parcelas/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][1]).toEqual({ quitar: null });
  });

  it('PIX Automático não entra só aumentando o total — não teria linha de acordo', async () => {
    const { toast } = await import('sonner');
    const hoje = getTodayISO();
    const { onConfirm } = abrir({
      acordo: aberto, inicial: { vencimento: hoje, valor: 900, tipo: 'pix_automatico' },
    });
    fireEvent.click(screen.getByLabelText(/só aumentar o total/));
    fireEvent.click(screen.getByLabelText(/Confirmo que o valor é o TOTAL/));
    fireEvent.click(screen.getByRole('button', { name: /Aumentar total de parcelas/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/depois que a atual for paga/), expect.anything(),
    ));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

/*
 * Regra Cofen (06/11/2026): quem tabulou só o valor da parcela lança a próxima
 * no mesmo acordo, e ela soma no valor total. Uma por vez, sempre registro.
 */
describe('ModalAdicionarParcela — regra Cofen', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('uma parcela por vez e o total do acordo somado na tela', () => {
    abrir({ isPaguePlay: true });
    expect(screen.queryByText(/Quantidade de parcelas/)).toBeNull();
    expect(screen.getByText(/Valor total do acordo:/).textContent).toMatch(/400,00.*800,00/);
  });

  it('parcela em aberto: só existe a opção de marcá-la como paga', async () => {
    const { toast } = await import('sonner');
    const { onConfirm } = abrir({
      isPaguePlay: true, acordo: { ...acordo, status: 'verificar_pendente' } as Acordo,
    });
    expect(screen.queryByLabelText(/só aumentar o total/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Adicionar parcela/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/Marque-a como paga/), expect.anything(),
    ));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/A #1 já foi paga/));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar parcela/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(onConfirm.mock.calls[0][1].quitar).toMatchObject({ parcelaId: 'a1' });
  });

  it('acordo com parcelas previstas ainda não registradas: manda para o reagendamento', () => {
    abrir({
      isPaguePlay: true,
      acordo: { ...acordo, parcelas: 3, valor_total: 1200 } as Acordo,
    });
    expect(screen.getByText(/já tem parcelas previstas/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Adicionar parcela/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});

/*
 * PIX Automático / Cartão Recorrente como PRÓXIMA parcela — liberado em
 * 08/10/2026 (entrada no Pix hoje, o resto no Pix Automático). Entra com as
 * travas do acordo novo: uma parcela só, valor TOTAL confirmado e data do mês
 * corrente. Lote com recorrente continua recusado.
 */
describe('ModalAdicionarParcela — recorrente como próxima parcela', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('PIX Automático entra como UMA parcela, só depois de confirmar o valor total', async () => {
    const { toast } = await import('sonner');
    const hoje = getTodayISO();
    const { onConfirm } = abrir({ inicial: { vencimento: hoje, valor: 2806.38, tipo: 'pix_automatico' } });

    expect(screen.getByText(/Valor TOTAL \*/)).toBeTruthy();
    expect(screen.queryByText(/Quantidade de parcelas/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Adicionar parcela/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/VALOR TOTAL/), expect.anything(),
    ));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText(/Confirmo que o valor é o TOTAL/));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar parcela/i }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    const enviadas = onConfirm.mock.calls[0][0];
    expect(enviadas).toHaveLength(1);
    expect(enviadas[0]).toMatchObject({ tipo: 'pix_automatico', valor: 2806.38, vencimento: hoje });
  });

  it('PIX Automático com data passada é recusado, mesmo confirmado', async () => {
    const { toast } = await import('sonner');
    const { onConfirm } = abrir({ inicial: { vencimento: '2020-01-10', valor: 400, tipo: 'pix_automatico' } });
    fireEvent.click(screen.getByLabelText(/Confirmo que o valor é o TOTAL/));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar parcela/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/data passada/), expect.anything(),
    ));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('PIX Automático dentro de um lote de parcelas é recusado, sem gravar', async () => {
    const { toast } = await import('sonner');
    const { onConfirm } = abrir();
    await ligarPersonalizacao('2');

    const selects = screen.getAllByRole('combobox');
    fireEvent.keyDown(selects[selects.length - 1], { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'PIX Automático' }));
    fireEvent.click(screen.getByRole('button', { name: /Adicionar parcela/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/UMA parcela só/),
      expect.anything(),
    ));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('acordo que JÁ É PIX Automático não recebe parcela: sem reparcelamento', async () => {
    const { toast } = await import('sonner');
    const { onConfirm } = abrir({ acordo: { ...acordo, tipo: 'pix_automatico' } as Acordo });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar parcela/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/não tem parcelas nem reparcelamento/),
      expect.anything(),
    ));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
