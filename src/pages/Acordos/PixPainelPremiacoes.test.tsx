/**
 * PixPainelPremiacoes.test.tsx — o painel da premiação dobrada.
 *
 * Dois fatos guiam estes casos, e os dois mudaram em 02/09/2026:
 *
 *   • **o critério é a dobra.** Quem não cumpriu os dois requisitos não aparece
 *     aqui — o pagamento dele já é controlado linha a linha na lista do Pix.
 *     Por isso todo cenário abaixo monta 20 acordos e passa a meta batida.
 *
 *   • **pagar é um botão**, e o rótulo dele carrega o valor que vai sair. Era um
 *     `<Switch>` de «Foi pago?», que não dizia nem o que ia acontecer nem
 *     quanto.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PixPainelPremiacoes } from './PixPainelPremiacoes';
import type {
  PixAutoAcordo,
  PixPremiacaoPagamento,
} from '@/services/pix_automatico.service';

const MES = '2026-08';

/** Bate a meta de recebimento — o SEGUNDO requisito da dobra. */
const META_BATIDA = { metaValor: 1_000, recebidoMes: 1_200 };

function acordo(id: string, extras: Partial<PixAutoAcordo> = {}): PixAutoAcordo {
  return {
    id,
    empresa_id: 'empresa-1',
    operador_id: 'operador-1',
    operador_nome: 'Ana Operadora',
    setor_id: 'setor-1',
    nr_cliente: `NR-${id}`,
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
    ...extras,
  };
}

/*
 * 20 acordos de R$ 10.000,00 a 1% = R$ 100,00 cada. Comissão R$ 2.000,00, passa
 * dos 18 do requisito; com a meta batida, a premiação é R$ 4.000,00.
 */
const VINTE_ACORDOS = Array.from({ length: 20 }, (_, i) => acordo(`a-${i}`));

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

/** As props que todo caso repete: os 20 acordos e a meta que fecha a dobra. */
const base = {
  itens: VINTE_ACORDOS,
  pctPorSetor: { 'setor-1': 1 },
  mes: MES,
  metaPorOperador: { 'operador-1': META_BATIDA },
};

/*
 * Cada caso usa a própria chave de estado.
 *
 * `useEstadoLembrado` guarda em memória de módulo, e ela atravessa os testes do
 * arquivo: sem chaves distintas, um caso que fechasse o painel deixaria o
 * seguinte com ele fechado.
 */
let contador = 0;
const chaveNova = () => `teste-premiacoes-${contador++}`;

describe('PixPainelPremiacoes — quem entra na lista', () => {
  it('não renderiza nada quando ninguém dobrou', () => {
    // Mesmos acordos, SEM a meta de recebimento: a dobra não fecha, e o painel
    // deixa de existir. Quem tem só comissão simples é pago pela lista do Pix.
    const { container } = render(
      <PixPainelPremiacoes
        {...base}
        metaPorOperador={{}}
        chaveEstado={chaveNova()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra a conta da dobra na linha de quem cumpriu os dois requisitos', () => {
    render(<PixPainelPremiacoes {...base} chaveEstado={chaveNova()} />);

    expect(screen.getByText('Ana Operadora')).toBeInTheDocument();
    // A conta embaixo do valor dobrado: sem ela, quem sabe de cor quanto a
    // pessoa fez acha que o número está errado.
    expect(screen.getByText('R$ 2.000,00 × 2')).toBeInTheDocument();
    const cabecalho = screen.getByRole('button', { name: /Premiação dobrada a pagar/i });
    expect(within(cabecalho).getByText('R$ 4.000,00')).toBeInTheDocument();
  });
});

describe('PixPainelPremiacoes — status de pagamento', () => {
  it('o botão de pagar diz o valor que vai sair, e é ele que quita', async () => {
    const user = userEvent.setup();
    const onMarcarPago = vi.fn();
    render(
      <PixPainelPremiacoes
        {...base}
        podeMarcarPago
        onMarcarPago={onMarcarPago}
        chaveEstado={chaveNova()}
      />,
    );

    const botao = screen.getByRole('button', { name: /marcar a premiação de Ana Operadora/i });
    expect(botao).toHaveTextContent('Pagar R$ 4.000,00');
    await user.click(botao);
    // O terceiro argumento é o que a marcação QUITA — o «falta pagar» daquele
    // instante. Sem ele o carimbo não conversaria com o número da mesma linha.
    expect(onMarcarPago).toHaveBeenCalledWith('operador-1', true, 4_000);
  });

  it('marcar como paga zera o que falta, mesmo sem valor gravado (linha antiga)', () => {
    render(
      <PixPainelPremiacoes {...base} pagamentos={[pagamento]} chaveEstado={chaveNova()} />,
    );

    // `pagamento` é anterior à migration 20260903100000: `pago` sem valor.
    // A leitura conservadora é «quitou o que faltava» — quem já marcou
    // pagamento antes desta versão não pode ver a dívida reabrir.
    const cabecalho = screen.getByRole('button', { name: /Premiação dobrada a pagar/i });
    expect(within(cabecalho).getByText('R$ 0,00')).toBeInTheDocument();
    expect(screen.getByText(/R\$ 4\.000,00 na premiação/)).toBeInTheDocument();
  });

  it('valor gravado parcial deixa o resto visível', () => {
    render(
      <PixPainelPremiacoes
        {...base}
        pagamentos={[{ ...pagamento, valor_pago: 1_000 }]}
        chaveEstado={chaveNova()}
      />,
    );

    const cabecalho = screen.getByRole('button', { name: /Premiação dobrada a pagar/i });
    expect(within(cabecalho).getByText('R$ 3.000,00')).toBeInTheDocument();
  });

  it('mostra o estado para quem só pode consultar e tira o pago do total pendente', () => {
    render(
      <PixPainelPremiacoes {...base} pagamentos={[pagamento]} chaveEstado={chaveNova()} />,
    );

    // Sem permissão não há botão de pagar nem de desfazer — só o carimbo.
    expect(screen.queryByRole('button', { name: /marcar a premiação/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /desfazer o pagamento/i })).not.toBeInTheDocument();
    expect(screen.getByText('Pago')).toBeInTheDocument();
    const cabecalho = screen.getByRole('button', { name: /Premiação dobrada a pagar/i });
    expect(within(cabecalho).getByText('R$ 0,00')).toBeInTheDocument();
  });

  it('pago, o botão vira desfazer — e desfazer não manda valor nenhum', async () => {
    const user = userEvent.setup();
    const onMarcarPago = vi.fn();
    render(
      <PixPainelPremiacoes
        {...base}
        pagamentos={[pagamento]}
        podeMarcarPago
        onMarcarPago={onMarcarPago}
        chaveEstado={chaveNova()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /desfazer o pagamento da premiação de Ana Operadora/i }));
    expect(onMarcarPago).toHaveBeenCalledWith('operador-1', false, 0);
  });
});
