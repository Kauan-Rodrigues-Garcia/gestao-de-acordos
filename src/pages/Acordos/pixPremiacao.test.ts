/**
 * pixPremiacao.test.ts — a conta que decide quanto sai do caixa.
 *
 * O caso do enunciado do Cleber (02/09/2026) está aqui com os números dele:
 * premiação de R$ 1.039,18 com R$ 891,18 já pagos e a meta batida tem de virar
 * R$ 2.078,36 de premiação e R$ 1.187,18 a pagar — e não os R$ 148,00 que a
 * primeira versão mostrava por não receber a meta de recebimento.
 *
 * O teste que mais importa é o do esquecimento: SEM `metaRecebimento` a dobra
 * não acontece. É o comportamento certo e foi o defeito real — o painel
 * chamava esta função sem a meta e mostrava a comissão simples de quem tinha
 * direito ao dobro.
 */
import { describe, it, expect } from 'vitest';
import { premiacaoDoOperador, painelPremiacoes, totalDoPainel } from './pixPremiacao';
import type { PixAutoAcordo } from '@/services/pix_automatico.service';

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
    extra: p.extra ?? false,
    criado_em: p.criado_em ?? `${MES}-05T10:00:00Z`,
    atualizado_em: `${MES}-05T10:00:00Z`,
  } as PixAutoAcordo;
}

/** Bate a meta de recebimento — o SEGUNDO requisito da dobra. */
const META_BATIDA = { metaValor: 1000, recebidoMes: 1200 };

describe('premiacaoDoOperador — a dobra', () => {
  it('dobra a premiação e desconta o que já foi pago (o caso do print)', () => {
    /*
     * 20 acordos de R$ 5.000,00 a 1% = R$ 50,00 cada. Comissão R$ 1.000,00,
     * passa dos 18 do requisito, meta batida: premiação R$ 2.000,00.
     * Metade pago (R$ 500,00) deixa R$ 1.500,00.
     */
    const itens = Array.from({ length: 20 }, (_, i) =>
      acordo({ id: `a-${i}`, valor: 5000, pago: i < 10 }));

    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens,
      pctPorSetor: PCT, mes: MES, metaRecebimento: META_BATIDA,
    });

    expect(r.dobrou).toBe(true);
    expect(r.comissao).toBe(1000);
    expect(r.bonus).toBe(1000);
    expect(r.premiacao).toBe(2000);
    expect(r.jaPago).toBe(500);
    expect(r.falta).toBe(1500);
  });

  it('SEM a meta de recebimento não dobra — foi o defeito de 02/09', () => {
    // Mesmos 20 acordos: o requisito de QUANTIDADE está cumprido. Sem a meta
    // de recebimento o segundo requisito fica em aberto, e prometer o dobro
    // sem ter contra o que comparar seria prometer dinheiro não conferido.
    const itens = Array.from({ length: 20 }, (_, i) => acordo({ id: `a-${i}`, valor: 5000 }));
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens, pctPorSetor: PCT, mes: MES,
    });

    expect(r.dobrou).toBe(false);
    expect(r.bonus).toBe(0);
    expect(r.premiacao).toBe(1000);
  });

  it('meta de recebimento NÃO batida também não dobra', () => {
    const itens = Array.from({ length: 20 }, (_, i) => acordo({ id: `a-${i}`, valor: 5000 }));
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens, pctPorSetor: PCT, mes: MES,
      metaRecebimento: { metaValor: 1000, recebidoMes: 400 },
    });
    expect(r.dobrou).toBe(false);
    expect(r.premiacao).toBe(1000);
  });

  it('acordos de menos não dobram, mesmo com a meta batida', () => {
    // Um requisito só não basta: são dois, e os dois precisam fechar.
    const itens = [acordo({ id: 'a-1', valor: 4000 })];
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens, pctPorSetor: PCT, mes: MES,
      metaRecebimento: META_BATIDA,
    });
    expect(r.dobrou).toBe(false);
    expect(r.premiacao).toBe(40);
  });
});

describe('premiacaoDoOperador — o que já saiu', () => {
  it('o acerto de divergência carimbado entra pelo já pago', () => {
    /*
     * A divergência não tem coluna neste painel: quem a aplica é a ação
     * «Corrigir valor», que a carimba em `ajuste_valor`. `valorAPagarDe` já a
     * soma, então o que saiu foi 40 − 20 = 20, e é isso que `jaPago` mostra.
     */
    const itens = [acordo({ id: 'a-1', valor: 4000, pago: true, ajuste_valor: -20 })];
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens, pctPorSetor: PCT, mes: MES,
    });

    expect(r.premiacao).toBe(40);
    expect(r.jaPago).toBe(20);
    expect(r.falta).toBe(20);
  });

  it('mês anterior não entra na conta deste mês', () => {
    const itens = [
      acordo({ id: 'a-1', valor: 4000 }),
      acordo({ id: 'a-2', valor: 9000, criado_em: '2026-08-15T10:00:00Z', pago: true }),
    ];
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens, pctPorSetor: PCT, mes: MES,
    });
    expect(r.comissao).toBe(40);
    expect(r.jaPago).toBe(0);
  });

  it('falta negativo quando saiu mais do que era devido', () => {
    // Não é zerado de propósito: é o caso que precisa de decisão de gente.
    const itens = [acordo({ id: 'a-1', valor: 4000, pago: true, ajuste_valor: 30 })];
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens, pctPorSetor: PCT, mes: MES,
    });
    expect(r.jaPago).toBe(70);
    expect(r.falta).toBe(-30);
  });
});

/*
 * ── O painel lista SÓ quem dobrou ─────────────────────────────────────────
 *
 * O critério mudou em 02/09/2026, a pedido: era «tem premiação ou pagamento no
 * mês», e isso fazia o painel repetir a tabela do Pix automático com outro
 * desenho. O pagamento de quem não dobrou já é controlado linha a linha lá; a
 * dobra é a única coisa que não tem onde ser carimbada, e é ela que fica aqui.
 */
describe('painelPremiacoes', () => {
  it('lista quem dobrou e ordena por quem falta mais', () => {
    const itens = [
      ...Array.from({ length: 20 }, (_, i) =>
        acordo({ id: `ana-${i}`, operador_id: 'ana', operador_nome: 'Ana', valor: 4000 })),
      ...Array.from({ length: 20 }, (_, i) =>
        acordo({ id: `bru-${i}`, operador_id: 'bruno', operador_nome: 'Bruno', valor: 9000 })),
    ];
    const linhas = painelPremiacoes({
      itens, pctPorSetor: PCT, mes: MES,
      metaPorOperador: { ana: META_BATIDA, bruno: META_BATIDA },
    });

    expect(linhas.map(l => l.nome)).toEqual(['Bruno', 'Ana']);
    // 20 × R$ 90,00 de comissão = R$ 1.800,00, dobrados.
    expect(linhas[0].falta).toBe(3600);
    // 20 × R$ 40,00 = R$ 800,00, dobrados.
    expect(linhas[1].falta).toBe(1600);
  });

  it('quem não dobrou fica de fora, mesmo com muito a receber', () => {
    const itens = [
      ...Array.from({ length: 20 }, (_, i) =>
        acordo({ id: `ana-${i}`, operador_id: 'ana', operador_nome: 'Ana', valor: 5000 })),
      ...Array.from({ length: 20 }, (_, i) =>
        acordo({ id: `bru-${i}`, operador_id: 'bruno', operador_nome: 'Bruno', valor: 5000 })),
    ];
    const linhas = painelPremiacoes({
      itens, pctPorSetor: PCT, mes: MES,
      metaPorOperador: { ana: META_BATIDA },
    });

    // Bruno fez os mesmos acordos e não tem meta cadastrada: não dobra, e por
    // isso não aparece. Os R$ 1.000,00 dele saem pela lista de acordos.
    expect(linhas.map(l => l.nome)).toEqual(['Ana']);
    expect(linhas[0].dobrou).toBe(true);
    expect(linhas[0].premiacao).toBe(2000);
  });

  it('sem ninguém dobrando, a lista é vazia', () => {
    const itens = [acordo({ id: 'a-1', valor: 4000 })];
    expect(painelPremiacoes({ itens, pctPorSetor: PCT, mes: MES })).toEqual([]);
  });

  it('o total do painel soma as parcelas de quem dobrou', () => {
    const itens = [
      ...Array.from({ length: 20 }, (_, i) =>
        acordo({ id: `ana-${i}`, operador_id: 'ana', operador_nome: 'Ana', valor: 5000, pago: i < 10 })),
      // Bruno não dobra: não entra em nenhuma das somas abaixo.
      acordo({ id: 'b-1', operador_id: 'bruno', operador_nome: 'Bruno', valor: 9000 }),
    ];
    const t = totalDoPainel(painelPremiacoes({
      itens, pctPorSetor: PCT, mes: MES, metaPorOperador: { ana: META_BATIDA },
    }));

    expect(t.comDobra).toBe(1);
    expect(t.bonus).toBe(1000);
    expect(t.premiacao).toBe(2000);
    expect(t.jaPago).toBe(500);
    expect(t.falta).toBe(1500);
  });
});

/*
 * ── O carimbo mensal da premiação ─────────────────────────────────────────
 *
 * Até 03/09/2026 marcar a premiação como paga gravava um booleano e nada mais:
 * o painel mostrava «Pago» no switch e «Falta pagar R$ 412,30» na mesma linha.
 * Agora o carimbo carrega o valor e entra na conta — e o carimbo ANTIGO, sem
 * valor, é lido como quitação total. Reabrir o que a operação considera pago
 * seria o pior desfecho possível de uma migração.
 */
describe('premiacaoDoOperador — pagamento mensal da premiação', () => {
  const dezAcordos = Array.from({ length: 10 }, (_, i) =>
    acordo({ id: `a${i}`, valor: 1000 }));   // 1% de 1000 = R$ 10,00 cada

  it('sem carimbo, o que falta é a premiação inteira', () => {
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens: dezAcordos, pctPorSetor: PCT, mes: MES,
    });
    expect(r.premiacao).toBe(100);
    expect(r.jaPago).toBe(0);
    expect(r.pagoNaPremiacao).toBe(0);
    expect(r.falta).toBe(100);
    expect(r.premiacaoPaga).toBe(false);
  });

  it('carimbo com valor entra no já pago e desconta do que falta', () => {
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens: dezAcordos, pctPorSetor: PCT, mes: MES,
      pagamentoMensal: { pago: true, valorPago: 40 },
    });
    expect(r.pagoNaPremiacao).toBe(40);
    expect(r.jaPago).toBe(40);
    expect(r.falta).toBe(60);
    expect(r.premiacaoPaga).toBe(true);
  });

  it('carimbo antigo (sem valor) quita o que faltava', () => {
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens: dezAcordos, pctPorSetor: PCT, mes: MES,
      pagamentoMensal: { pago: true, valorPago: null },
    });
    expect(r.pagoNaPremiacao).toBe(100);
    expect(r.falta).toBe(0);
  });

  it('carimbo antigo não paga de novo o que as linhas já pagaram', () => {
    // Metade das linhas já estava marcada como paga: o carimbo sem valor cobre
    // só o resto. Cobrir a premiação inteira faria o painel afirmar que saíram
    // R$ 150,00 de uma premiação de R$ 100,00.
    const metadePaga = dezAcordos.map((a, i) => (i < 5 ? { ...a, pago: true } : a));
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens: metadePaga, pctPorSetor: PCT, mes: MES,
      pagamentoMensal: { pago: true, valorPago: null },
    });
    expect(r.pagoNaPremiacao).toBe(50);
    expect(r.jaPago).toBe(100);
    expect(r.falta).toBe(0);
  });

  it('desmarcado, o carimbo não conta nem com valor gravado', () => {
    const r = premiacaoDoOperador({
      operadorId: 'ana', nome: 'Ana', itens: dezAcordos, pctPorSetor: PCT, mes: MES,
      pagamentoMensal: { pago: false, valorPago: 40 },
    });
    expect(r.pagoNaPremiacao).toBe(0);
    expect(r.falta).toBe(100);
  });

  it('painelPremiacoes repassa o carimbo de cada pessoa', () => {
    // Os dois dobram, que é o critério para entrar no painel — sem isso não há
    // linha nenhuma a que repassar carimbo. Ver `painelPremiacoes`.
    const itens = [
      ...Array.from({ length: 20 }, (_, i) =>
        acordo({ id: `ana-${i}`, valor: 1000 })),           // 20 × R$ 10 = R$ 200 → R$ 400
      ...Array.from({ length: 20 }, (_, i) =>
        acordo({ id: `bru-${i}`, valor: 2000,               // 20 × R$ 20 = R$ 400 → R$ 800
          operador_id: 'bruno', operador_nome: 'Bruno' })),
    ];
    const linhas = painelPremiacoes({
      itens, pctPorSetor: PCT, mes: MES,
      metaPorOperador: { ana: META_BATIDA, bruno: META_BATIDA },
      pagamentoPorOperador: { ana: { pago: true, valorPago: 400 } },
    });
    const ana   = linhas.find(l => l.operadorId === 'ana');
    const bruno = linhas.find(l => l.operadorId === 'bruno');
    expect(ana?.falta).toBe(0);
    expect(bruno?.falta).toBe(800);
    expect(totalDoPainel(linhas).falta).toBe(800);
    expect(totalDoPainel(linhas).pagoNaPremiacao).toBe(400);
  });
});
