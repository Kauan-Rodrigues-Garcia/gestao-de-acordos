/**
 * pixPremiacao.test.ts — a conta que decide quanto sai do caixa.
 *
 * Os dois casos que o Cleber descreveu em 02/09/2026 estão aqui com os números
 * dele, e são os dois primeiros testes: premiação de R$ 40,00 com R$ 20,00 de
 * divergência paga R$ 20,00; premiação dobrada de R$ 2.000,00 com R$ 1.000,00
 * já pagos deixa R$ 1.000,00 a pagar.
 *
 * O terceiro caso é o que ninguém pediu e é o que mais importa: a divergência
 * já carimbada num pagamento NÃO pode ser descontada de novo.
 */
import { describe, it, expect } from 'vitest';
import {
  divergenciaEmAberto, premiacaoDoOperador, painelPremiacoes,
  aPagarComDivergencia, totalDoPainel,
} from './pixPremiacao';
import type { PixAutoAcordo, PixAutoSaldo } from '@/services/pix_automatico.service';

const MES = '2026-09';
const PCT = { 'setor-1': 1 };   // 1% — facilita as contas de cabeça

function acordo(p: Partial<PixAutoAcordo> & { id: string; valor: number }): PixAutoAcordo {
  return {
    id: p.id,
    empresa_id: 'emp',
    operador_id: p.operador_id ?? 'ana',
    operador_nome: p.operador_nome ?? 'Ana',
    setor_id: p.setor_id ?? 'setor-1',
    nr_cliente: p.nr_cliente ?? `nr-${p.id}`,
    valor: p.valor,
    status: p.status ?? 'aprovado',
    pct_comissao: p.pct_comissao ?? 1,
    avaliado_por: null, avaliado_por_nome: null, avaliado_em: null,
    pago: p.pago ?? false,
    pago_em: null, pago_por: null, pago_por_nome: null,
    ajuste_valor: p.ajuste_valor ?? null,
    ajuste_motivo: null, ajuste_em: null, ajuste_por: null, ajuste_por_nome: null,
    criado_em: p.criado_em ?? `${MES}-05T10:00:00Z`,
    atualizado_em: `${MES}-05T10:00:00Z`,
  } as PixAutoAcordo;
}

function saldo(p: Partial<PixAutoSaldo> & { valor: number }): PixAutoSaldo {
  return {
    id: p.id ?? 's-1',
    empresa_id: 'emp',
    operador_id: p.operador_id ?? 'ana',
    operador_nome: p.operador_nome ?? 'Ana',
    setor_id: 'setor-1',
    valor: p.valor,
    motivo: p.motivo ?? 'Pix pago em duplicidade',
    acordo_id: p.acordo_id ?? null,
    reservado_em: p.acordo_id ? `${MES}-06T10:00:00Z` : null,
    criado_por: null, criado_por_nome: null,
    criado_em: `${MES}-02T10:00:00Z`,
    atualizado_em: `${MES}-02T10:00:00Z`,
  } as PixAutoSaldo;
}

/** Bate a meta de recebimento — o segundo requisito da dobra. */
const META_BATIDA = { metaValor: 1000, recebidoMes: 1200 };

describe('divergenciaEmAberto', () => {
  it('conta só o saldo que ainda não foi carimbado num acordo', () => {
    const livre     = saldo({ valor: -20 });
    const reservado = saldo({ id: 's-2', valor: -50, acordo_id: 'a-1' });

    expect(divergenciaEmAberto('ana', [livre]).valor).toBe(-20);
    // Reservado já está dentro de `valorAPagarDe` da linha — contar aqui de
    // novo descontaria a mesma divergência duas vezes.
    expect(divergenciaEmAberto('ana', [reservado]).valor).toBe(0);
  });

  it('sem operador e sem saldo devolve zero, não quebra', () => {
    expect(divergenciaEmAberto(null, []).valor).toBe(0);
    expect(divergenciaEmAberto('ana', []).valor).toBe(0);
  });
});

describe('premiacaoDoOperador — o caso do enunciado', () => {
  it('premiação de R$ 40,00 devendo R$ 20,00 deixa R$ 20,00 a pagar', () => {
    // 1% de R$ 4.000,00 = R$ 40,00 de comissão.
    const itens = [acordo({ id: 'a-1', valor: 4000 })];
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens,
      saldos: [saldo({ valor: -20 })],
      pctPorSetor: PCT, mes: MES,
    });

    expect(r.comissao).toBe(40);
    expect(r.premiacao).toBe(40);
    expect(r.jaPago).toBe(0);
    expect(r.divergencia).toBe(-20);
    expect(r.falta).toBe(20);
  });

  it('premiação dobrada de R$ 2.000,00 com R$ 1.000,00 pagos deixa R$ 1.000,00', () => {
    /*
     * 20 acordos de R$ 5.000,00 a 1% = R$ 50,00 cada, R$ 1.000,00 de comissão.
     * Passa dos 18 do requisito e a meta está batida, então dobra: R$ 2.000,00.
     * Metade das linhas já foi paga — R$ 500,00... não: metade das linhas paga
     * é R$ 500,00 de comissão, e o que já saiu é isso. Para chegar aos
     * R$ 1.000,00 do enunciado, TODAS as linhas estão pagas (a comissão
     * simples), e o que falta é justamente o bônus da dobra.
     */
    const itens = Array.from({ length: 20 }, (_, i) =>
      acordo({ id: `a-${i}`, valor: 5000, pago: true }));

    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens, saldos: [],
      pctPorSetor: PCT, mes: MES, metaRecebimento: META_BATIDA,
    });

    expect(r.dobrou).toBe(true);
    expect(r.comissao).toBe(1000);
    expect(r.premiacao).toBe(2000);
    expect(r.jaPago).toBe(1000);
    expect(r.falta).toBe(1000);
  });
});

describe('premiacaoDoOperador — não descontar duas vezes', () => {
  it('divergência já carimbada e paga não volta a descontar', () => {
    /*
     * O acerto de −20 está DENTRO da linha paga (`ajuste_valor`), então
     * `jaPago` é 40 − 20 = 20. O saldo correspondente está reservado naquele
     * acordo, e por isso não entra de novo como divergência aberta.
     *
     * Sem esse cuidado, `falta` daria −20: a tela pediria para descontar mais
     * R$ 20,00 de uma dívida que já tinha sido quitada.
     */
    const itens = [acordo({ id: 'a-1', valor: 4000, pago: true, ajuste_valor: -20 })];
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens,
      saldos: [saldo({ valor: -20, acordo_id: 'a-1' })],
      pctPorSetor: PCT, mes: MES,
    });

    expect(r.premiacao).toBe(40);
    expect(r.jaPago).toBe(20);
    expect(r.divergencia).toBe(0);
    expect(r.falta).toBe(20);
  });

  it('sem meta de recebimento a comissão NÃO dobra', () => {
    const itens = Array.from({ length: 20 }, (_, i) => acordo({ id: `a-${i}`, valor: 5000 }));
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens, saldos: [], pctPorSetor: PCT, mes: MES,
    });
    expect(r.dobrou).toBe(false);
    expect(r.premiacao).toBe(1000);
  });

  it('mês anterior não entra na conta deste mês', () => {
    const itens = [
      acordo({ id: 'a-1', valor: 4000 }),
      acordo({ id: 'a-2', valor: 9000, criado_em: '2026-08-15T10:00:00Z', pago: true }),
    ];
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens, saldos: [], pctPorSetor: PCT, mes: MES,
    });
    expect(r.comissao).toBe(40);
    expect(r.jaPago).toBe(0);
  });
});

describe('painelPremiacoes', () => {
  it('lista quem tem a receber e ordena por quem falta mais', () => {
    const itens = [
      acordo({ id: 'a-1', operador_id: 'ana',   operador_nome: 'Ana',   valor: 4000 }),
      acordo({ id: 'a-2', operador_id: 'bruno', operador_nome: 'Bruno', valor: 9000 }),
    ];
    const linhas = painelPremiacoes({ itens, saldos: [], pctPorSetor: PCT, mes: MES });

    expect(linhas.map(l => l.nome)).toEqual(['Bruno', 'Ana']);
    expect(linhas[0].falta).toBe(90);
    expect(linhas[1].falta).toBe(40);
  });

  it('quem só tem dívida aparece mesmo sem registro no mês', () => {
    // O caso que some da tela sozinho: recebeu a mais em agosto, não lançou
    // nada em setembro. Sem esta regra ninguém desconta nunca.
    const linhas = painelPremiacoes({
      itens: [],
      saldos: [saldo({ operador_id: 'carla', operador_nome: 'Carla', valor: -30 })],
      pctPorSetor: PCT, mes: MES,
    });

    expect(linhas).toHaveLength(1);
    expect(linhas[0].nome).toBe('Carla');
    expect(linhas[0].falta).toBe(-30);
  });

  it('o total do painel soma as quatro parcelas', () => {
    const itens = [
      acordo({ id: 'a-1', operador_id: 'ana',   valor: 4000, pago: true }),
      acordo({ id: 'a-2', operador_id: 'bruno', valor: 9000 }),
    ];
    const t = totalDoPainel(painelPremiacoes({
      itens, saldos: [saldo({ valor: -20 })], pctPorSetor: PCT, mes: MES,
    }));

    expect(t.premiacao).toBe(130);
    expect(t.jaPago).toBe(40);
    expect(t.divergencia).toBe(-20);
    expect(t.falta).toBe(70);
  });
});

describe('aPagarComDivergencia', () => {
  it('desconta a divergência aberta do total a pagar', () => {
    const itens = [acordo({ id: 'a-1', valor: 4000 })];
    const r = aPagarComDivergencia(itens, [saldo({ valor: -20 })], PCT);

    expect(r.bruto).toBe(40);
    expect(r.divergencia).toBe(-20);
    expect(r.liquido).toBe(20);
  });

  it('ignora a divergência de quem não está na lista visível', () => {
    // Um líder filtrando a própria equipe não pode ver descontada a dívida de
    // alguém que ele nem está olhando — o total da tela não fecharia com nada.
    const itens = [acordo({ id: 'a-1', operador_id: 'ana', valor: 4000 })];
    const r = aPagarComDivergencia(
      itens, [saldo({ operador_id: 'zeca', valor: -500 })], PCT,
    );

    expect(r.divergencia).toBe(0);
    expect(r.liquido).toBe(40);
  });

  it('linha já paga não conta como a pagar', () => {
    const itens = [acordo({ id: 'a-1', valor: 4000, pago: true })];
    expect(aPagarComDivergencia(itens, [], PCT).bruto).toBe(0);
  });
});
