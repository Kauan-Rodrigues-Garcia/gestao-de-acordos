import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PixPainelPremiacoes } from './PixPainelPremiacoes';
import type {
  PixAutoAcordo,
  PixPremiacaoPagamento,
} from '@/services/pix_automatico.service';

const MES = '2026-08';

const acordo: PixAutoAcordo = {
  id: 'acordo-1',
  empresa_id: 'empresa-1',
  operador_id: 'operador-1',
  operador_nome: 'Ana Operadora',
  setor_id: 'setor-1',
  nr_cliente: 'NR-1',
  valor: 10_000,
  status: 'aprovado',
  pct_comissao: 1,
  avaliado_por: null,
  avaliado_por_nome: null,
  avaliado_em: null,
  pago: false,
  pago_em: null,
  pago_por: null,
  pago_por_nome: null,
  ajuste_valor: null,
  ajuste_motivo: null,
  ajuste_em: null,
  ajuste_por: null,
  ajuste_por_nome: null,
  extra: false,
  criado_em: `${MES}-10T12:00:00Z`,
  atualizado_em: `${MES}-10T12:00:00Z`,
};

const pagamento: PixPremiacaoPagamento = {
  id: 1,
  empresa_id: 'empresa-1',
  operador_id: 'operador-1',
  operador_nome: 'Ana Operadora',
  mes: `${MES}-01`,
  pago: true,
  pago_em: `${MES}-31T15:00:00Z`,
  pago_por: 'gerente-1',
  pago_por_nome: 'Gisele Gerente',
  atualizado_em: `${MES}-31T15:00:00Z`,
  atualizado_por: 'gerente-1',
  atualizado_por_nome: 'Gisele Gerente',
};

describe('PixPainelPremiacoes — status de pagamento', () => {
  it('permite que a gerência marque a premiação como paga', async () => {
    const user = userEvent.setup();
    const onMarcarPago = vi.fn();
    render(
      <PixPainelPremiacoes
        itens={[acordo]}
        pctPorSetor={{ 'setor-1': 1 }}
        mes={MES}
        podeMarcarPago
        onMarcarPago={onMarcarPago}
      />,
    );

    expect(screen.getByText('Foi pago?')).toBeInTheDocument();
    expect(screen.getByText('Não pago')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /marcar premiação de Ana Operadora/i }));
    // O terceiro argumento é o que a marcação QUITA: R$ 100,00 de comissão
    // (1% de R$ 10.000,00), nada pago ainda. Sem ele o switch voltaria a ser
    // um carimbo que não conversa com o «falta pagar» da mesma linha.
    expect(onMarcarPago).toHaveBeenCalledWith('operador-1', true, 100);
  });

  it('marcar como paga zera o que falta, mesmo sem valor gravado (linha antiga)', () => {
    render(
      <PixPainelPremiacoes
        itens={[acordo]}
        pctPorSetor={{ 'setor-1': 1 }}
        mes={MES}
        pagamentos={[pagamento]}
      />,
    );

    // `pagamento` é anterior à migration 20260903100000: `pago` sem valor.
    // A leitura conservadora é «quitou o que faltava» — quem já marcou
    // pagamento antes desta versão não pode ver a dívida reabrir.
    const cabecalho = screen.getByRole('button', { name: /Premiação a pagar/i });
    expect(within(cabecalho).getByText('R$ 0,00')).toBeInTheDocument();
    expect(screen.getByText(/R\$ 100,00 na premiação/)).toBeInTheDocument();
  });

  it('valor gravado parcial deixa o resto visível', () => {
    render(
      <PixPainelPremiacoes
        itens={[acordo]}
        pctPorSetor={{ 'setor-1': 1 }}
        mes={MES}
        pagamentos={[{ ...pagamento, valor_pago: 40 }]}
      />,
    );

    const cabecalho = screen.getByRole('button', { name: /Premiação a pagar/i });
    expect(within(cabecalho).getByText('R$ 60,00')).toBeInTheDocument();
  });

  it('mostra o estado para quem só pode consultar e tira o pago do total pendente', () => {
    render(
      <PixPainelPremiacoes
        itens={[acordo]}
        pctPorSetor={{ 'setor-1': 1 }}
        mes={MES}
        pagamentos={[pagamento]}
      />,
    );

    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('Pago')).toBeInTheDocument();
    const cabecalho = screen.getByRole('button', { name: /Premiação a pagar/i });
    expect(within(cabecalho).getByText('R$ 0,00')).toBeInTheDocument();
  });
});
