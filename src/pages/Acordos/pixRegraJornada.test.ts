/**
 * Pix com a regra do Jornada (05/11/2026): comissão em VALOR FIXO por Pix e
 * meta em QUANTIDADE de acordos. Os setores que não escolherem nada seguem
 * exatamente como antes (percentual e R$).
 */
import { describe, expect, it } from 'vitest';
import {
  comissaoDe, regrasDeComissao, valorAPagarDe, valorFixoDoSetor,
  type PixAutoAcordo, type PixAutoConfig,
} from '@/services/pix_automatico.service';
import { calcularMetaPix } from './pixAutomaticoView';

const JORNADA = 'setor-jornada';
const PLAY1 = 'setor-play1';

const config = (c: Partial<PixAutoConfig> & { setor_id: string }): PixAutoConfig => ({
  id: c.setor_id, empresa_id: 'emp', pct: 0.25, permite_registro_operador: true,
  atualizado_por: null, atualizado_por_nome: null, atualizado_em: '2026-11-05', ...c,
});

const regras = regrasDeComissao([
  config({ setor_id: JORNADA, comissao_modo: 'fixo', comissao_valor_fixo: 3 }),
  config({ setor_id: PLAY1, pct: 0.5 }),
]);

const linha = (l: Partial<PixAutoAcordo>): PixAutoAcordo => ({
  id: 'x', empresa_id: 'emp', operador_id: 'op', operador_nome: null, setor_id: JORNADA,
  nr_cliente: '1', valor: 200, status: 'pendente', pct_comissao: null,
  avaliado_por: null, avaliado_por_nome: null, avaliado_em: null,
  pago: false, pago_em: null, pago_por: null, pago_por_nome: null,
  ajuste_valor: null, ajuste_motivo: null, ajuste_em: null, ajuste_por: null, ajuste_por_nome: null,
  extra: false, criado_em: '2026-11-04T12:00:00Z',
  ...l,
} as PixAutoAcordo);

describe('comissão em valor fixo por Pix', () => {
  it('o mapa continua dando o % de cada setor, e o fixo só a quem escolheu', () => {
    expect(regras[JORNADA]).toBe(0.25);
    expect(regras[PLAY1]).toBe(0.5);
    expect(Object.keys(regras).sort()).toEqual([JORNADA, PLAY1].sort()); // o fixo não vira «setor»
    expect(valorFixoDoSetor(regras, JORNADA)).toBe(3);
    expect(valorFixoDoSetor(regras, PLAY1)).toBeNull();
  });

  it('pendente do setor fixo vale o valor de hoje, qualquer que seja o valor do Pix', () => {
    expect(comissaoDe(linha({ valor: 200 }), regras)).toBe(3);
    expect(comissaoDe(linha({ valor: 10 }), regras)).toBe(3);
  });

  it('aprovado vale o que travou na aprovação — mudar o setor depois não mexe', () => {
    const aprovado = linha({ status: 'aprovado', pct_comissao: 0.25, comissao_fixa: 2.5 });
    expect(comissaoDe(aprovado, regras)).toBe(2.5);
  });

  it('aprovado antes da regra (sem comissao_fixa) continua percentual', () => {
    const antigo = linha({ status: 'aprovado', pct_comissao: 0.25, valor: 200 });
    expect(comissaoDe(antigo, regras)).toBe(0.5);
  });

  it('setor percentual segue igual, com bônus por período', () => {
    expect(comissaoDe(linha({ setor_id: PLAY1, valor: 200 }), regras)).toBe(1);
    expect(comissaoDe(linha({ setor_id: PLAY1, valor: 200, bonus_pct: 0.5 } as Partial<PixAutoAcordo>), regras)).toBe(2);
  });

  it('o bônus de % não se aplica ao valor fixo; a correção de divergência sim', () => {
    const l = linha({ bonus_pct: 0.5, ajuste_valor: 1.25 } as Partial<PixAutoAcordo>);
    expect(comissaoDe(l, regras)).toBe(3);
    expect(valorAPagarDe(l, regras)).toBe(4.25);
  });
});

describe('meta do Pix em quantidade', () => {
  const base = { configMes: null, mes: '2026-11' as const, hojeISO: '2026-11-05' };
  const feitos = [
    linha({ status: 'aprovado', valor: 100 }),
    linha({ status: 'aprovado', valor: 50 }),
    linha({ status: 'pendente', valor: 25 }),
  ];

  it('em valor, o de sempre', () => {
    const r = calcularMetaPix({ ...base, itens: feitos, metaValor: 1000, metaAcordos: 0 })!;
    expect(r.modo).toBe('valor');
    expect(r.pct).toBe(r.pctValor);
  });

  it('em quantidade, o % e o «bateu» contam acordos, não R$', () => {
    const r = calcularMetaPix({ ...base, itens: feitos, metaValor: 1_000_000, metaAcordos: 4, modo: 'quantidade' })!;
    expect(r.modo).toBe('quantidade');
    expect(r.pct).toBe(Math.round((r.acordos / 4) * 100));
    expect(r.metaBatida).toBe(r.acordos >= 4);
    const batida = calcularMetaPix({ ...base, itens: feitos, metaValor: 1_000_000, metaAcordos: 1, modo: 'quantidade' })!;
    expect(batida.metaBatida).toBe(true); // R$ 1 milhão de meta em valor não importa
  });

  it('em quantidade sem meta de quantidade não há o que medir', () => {
    expect(calcularMetaPix({ ...base, itens: feitos, metaValor: 1000, metaAcordos: 0, modo: 'quantidade' })).toBeNull();
  });
});
