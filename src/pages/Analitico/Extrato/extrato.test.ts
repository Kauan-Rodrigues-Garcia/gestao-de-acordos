import { describe, it, expect } from 'vitest';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import {
  agruparPorDia, filtrarExtrato, resumirVinculos, rotuloDoDia, temExtra,
  totaisPorDiaDoMes, vinculoDaLinha,
} from './extrato';

function linha(p: Partial<AnaliticoRecebimento>): AnaliticoRecebimento {
  return {
    id: Math.random().toString(36), empresa_id: 'e', operador_id: 'op', operador_usuario: 'op',
    codigo: '1', nome_cliente: null, forma_pagamento: 'boleto_pix', valor_recebido: 100,
    total_ho: 0, data_pagamento: '2026-10-05', mes_referencia: '2026-10-01', acordo_id: null,
    status_tabulacao: 'nao_tabulado', visto: true, importado_por_id: null,
    importado_em: '2026-10-05T10:00:00Z', lote_id: 'l', tipo_comissao: null,
    ...p,
  } as AnaliticoRecebimento;
}

describe('vínculo da linha', () => {
  it('lê a coluna Tipo comissão do relatório', () => {
    expect(vinculoDaLinha(linha({ tipo_comissao: 'Extra' }))).toBe('extra');
    expect(vinculoDaLinha(linha({ tipo_comissao: 'Integral' }))).toBe('direto');
  });

  it('sem a coluna não vira Direto por omissão', () => {
    expect(vinculoDaLinha(linha({ tipo_comissao: null }))).toBeNull();
  });

  it('a divisão só aparece quando existe algum Extra', () => {
    expect(temExtra([linha({ tipo_comissao: 'Integral' })])).toBe(false);
    expect(temExtra([linha({ tipo_comissao: 'Integral' }), linha({ tipo_comissao: 'Extra' })])).toBe(true);
  });

  it('o resumo soma valor e quantidade de cada lado, e conta os sem informação', () => {
    const r = resumirVinculos([
      linha({ tipo_comissao: 'Extra', valor_recebido: 30 }),
      linha({ tipo_comissao: 'Integral', valor_recebido: 70 }),
      linha({ tipo_comissao: 'Integral', valor_recebido: 10 }),
      linha({ tipo_comissao: null, valor_recebido: 5 }),
    ]);
    expect(r).toEqual({ direto: 80, extra: 30, qtdDireto: 2, qtdExtra: 1, qtdSemInfo: 1 });
  });
});

describe('filtros do extrato', () => {
  const ls = [
    linha({ id: 'a', status_tabulacao: 'tabulado', tipo_comissao: 'Extra' }),
    linha({ id: 'b', status_tabulacao: 'nao_tabulado', tipo_comissao: 'Integral' }),
    linha({ id: 'c', status_tabulacao: 'divergente', tipo_comissao: 'Extra' }),
  ];

  it('«A tabular» inclui o divergente — ele ainda pede ação', () => {
    expect(filtrarExtrato(ls, 'a_tabular', 'todos').map(l => l.id)).toEqual(['b', 'c']);
  });

  it('combina situação e vínculo', () => {
    expect(filtrarExtrato(ls, 'a_tabular', 'extra').map(l => l.id)).toEqual(['c']);
    expect(filtrarExtrato(ls, 'tabulados', 'direto')).toEqual([]);
  });
});

describe('agrupar por dia', () => {
  it('dia mais recente primeiro, maior valor primeiro dentro do dia, com o total', () => {
    const dias = agruparPorDia([
      linha({ id: 'x', data_pagamento: '2026-10-02', valor_recebido: 10 }),
      linha({ id: 'y', data_pagamento: '2026-10-09', valor_recebido: 5 }),
      linha({ id: 'z', data_pagamento: '2026-10-09', valor_recebido: 50 }),
    ]);
    expect(dias.map(d => d.dia)).toEqual(['2026-10-09', '2026-10-02']);
    expect(dias[0].linhas.map(l => l.id)).toEqual(['z', 'y']);
    expect(dias[0].total).toBe(55);
  });
});

describe('fita do mês', () => {
  it('um ponto por dia do mês, zero onde não entrou nada', () => {
    const fita = totaisPorDiaDoMes([
      { data_pagamento: '2026-02-03', valor_recebido: 10 },
      { data_pagamento: '2026-02-03', valor_recebido: 5 },
    ], '2026-02');
    expect(fita).toHaveLength(28);
    expect(fita[2]).toEqual({ dia: '2026-02-03', total: 15 });
    expect(fita[0].total).toBe(0);
  });
});

describe('rótulo do dia', () => {
  it('hoje e ontem pelo nome; o resto pela data', () => {
    expect(rotuloDoDia('2026-10-16', '2026-10-16').principal).toBe('Hoje');
    expect(rotuloDoDia('2026-10-15', '2026-10-16').principal).toBe('Ontem');
    expect(rotuloDoDia('2026-10-01', '2026-10-16').principal).toMatch(/01/);
    expect(rotuloDoDia('2026-10-01', '2026-10-16').semana).toBe('quinta');
  });
});
