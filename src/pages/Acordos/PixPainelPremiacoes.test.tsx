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
    expect(onMarcarPago).toHaveBeenCalledWith('operador-1', true);
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
