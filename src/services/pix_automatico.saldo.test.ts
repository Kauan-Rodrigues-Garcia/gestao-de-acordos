/**
 * O acerto de valor divergente, na parte que é conta pura.
 *
 * O ciclo (anotar → aplicar → quitar no pagamento) vive em RPC e trigger, e
 * quem o garante é a migration `20260823080000`. O que dá para provar aqui é a
 * fronteira que separa as duas leituras de dinheiro desta aba, e ela já foi
 * confundida uma vez no desenho: se a correção entrasse dentro de `comissaoDe`,
 * o ranking, a meta e o card da dobra passariam a contar como desempenho um
 * acerto de pagamento do mês passado.
 */
import { describe, it, expect, vi } from 'vitest';

// O módulo importa `supabase` no topo; sem mock, createClient() explode por
// falta de VITE_SUPABASE_URL.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import {
  comissaoDe, valorAPagarDe, formatarCopiaPix, saldosPorOperador,
  type PixAutoSaldo,
} from './pix_automatico.service';

const SETOR = 'setor-1';
const PCT = { [SETOR]: 0.25 };

/** Acordo aprovado de R$ 10.000,00 → comissão de 0,25% = R$ 25,00. */
function acordo(over: Partial<Parameters<typeof valorAPagarDe>[0]> = {}) {
  return {
    valor: 10000,
    status: 'aprovado' as const,
    pct_comissao: 0.25,
    setor_id: SETOR,
    ajuste_valor: null as number | null,
    ...over,
  };
}

describe('valorAPagarDe', () => {
  it('sem correção, paga exatamente a comissão', () => {
    const a = acordo();
    expect(comissaoDe(a, PCT)).toBe(25);
    expect(valorAPagarDe(a, PCT)).toBe(25);
  });

  it('saldo positivo SOMA — a empresa devia e devolve neste pagamento', () => {
    const a = acordo({ ajuste_valor: 10 });
    expect(valorAPagarDe(a, PCT)).toBe(35);
  });

  it('saldo negativo SUBTRAI — a empresa pagou a mais e desconta aqui', () => {
    const a = acordo({ ajuste_valor: -10 });
    expect(valorAPagarDe(a, PCT)).toBe(15);
  });

  it('a correção NÃO entra na comissão', () => {
    // A separação é o ponto: comissão mede desempenho, correção acerta caixa.
    const a = acordo({ ajuste_valor: -10 });
    expect(comissaoDe(a, PCT)).toBe(25);
  });

  it('desconto maior que a comissão devolve negativo, sem piso', () => {
    // Não há `Math.max(0, …)` de propósito: esconder o negativo faria a linha
    // dizer que nada é devido, e o restante do desconto sumiria no ar.
    expect(valorAPagarDe(acordo({ ajuste_valor: -40 }), PCT)).toBe(-15);
  });

  it('arredonda em duas casas', () => {
    const a = acordo({ valor: 3333, ajuste_valor: 0.335 });
    expect(Number.isInteger(valorAPagarDe(a, PCT) * 100)).toBe(true);
  });
});

describe('formatarCopiaPix com correção', () => {
  it('descreve a correção antes do total', () => {
    const texto = formatarCopiaPix([
      { acordo: { nr_cliente: '111' }, comissao: 25 },
      { acordo: { nr_cliente: '222' }, comissao: 35, ajuste: 10 },
    ]);
    expect(texto).toBe(
      '111\n' +
      '222\n' +
      'Correção no 222: +R$ 10,00\n' +
      'R$ 60,00',
    );
  });

  it('usa o sinal de menos para desconto', () => {
    const texto = formatarCopiaPix([
      { acordo: { nr_cliente: 'A' }, comissao: 15, ajuste: -10 },
    ]);
    expect(texto).toContain('Correção no A: −R$ 10,00');
    expect(texto.endsWith('R$ 15,00')).toBe(true);
  });

  it('sem correção, o texto é exatamente o de antes', () => {
    // Contrato com quem já usa o botão: o formato antigo não muda.
    const texto = formatarCopiaPix([
      { acordo: { nr_cliente: '111' }, comissao: 8.33 },
      { acordo: { nr_cliente: '222' }, comissao: 1.67 },
    ]);
    expect(texto).toBe('111\n222\nR$ 10,00');
  });

  it('ajuste zero não vira linha', () => {
    const texto = formatarCopiaPix([{ acordo: { nr_cliente: 'A' }, comissao: 25, ajuste: 0 }]);
    expect(texto).toBe('A\nR$ 25,00');
  });
});

describe('saldosPorOperador', () => {
  const base: PixAutoSaldo = {
    id: 's1', empresa_id: 'e', operador_id: 'op-1', operador_nome: 'João',
    setor_id: SETOR, valor: 10, motivo: null, acordo_id: null, reservado_em: null,
    criado_por: null, criado_por_nome: null,
    criado_em: '2026-08-01T00:00:00Z', atualizado_em: '2026-08-01T00:00:00Z',
  };

  it('indexa por operador', () => {
    const mapa = saldosPorOperador([base, { ...base, id: 's2', operador_id: 'op-2', valor: -5 }]);
    expect(mapa['op-1'].valor).toBe(10);
    expect(mapa['op-2'].valor).toBe(-5);
  });

  it('operador sem saldo não aparece no mapa', () => {
    expect(saldosPorOperador([base])['op-9']).toBeUndefined();
  });
});
