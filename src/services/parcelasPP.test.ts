/**
 * A regra de gravação do editor de parcelas da PaguePlay.
 *
 * O que importa: na parcela PAGA, o dia escolhido vale para o registro inteiro
 * (`data_pagamento` E `vencimento`, como faz o «marcar pago»); deixar de ser
 * paga limpa o dia do pagamento; nada mudou, nada é gravado.
 */
import { describe, it, expect } from 'vitest';
import type { Acordo } from '@/lib/supabase';
import { mudancasDaParcela, paraLinha } from '@/services/parcelasPP';

function parcela(o: Partial<Acordo> = {}): Acordo {
  return {
    id: 'p1', numero_parcela: 2, status: 'verificar_pendente', valor: 150,
    vencimento: '2026-09-10', data_pagamento: null, ...o,
  } as unknown as Acordo;
}

describe('mudancasDaParcela', () => {
  it('sem mudança não grava nada', () => {
    expect(mudancasDaParcela(paraLinha(parcela()))).toEqual({});
    expect(mudancasDaParcela(paraLinha(parcela({
      status: 'pago', data_pagamento: '2026-09-05', vencimento: '2026-09-05',
    })))).toEqual({});
  });

  it('parcela paga: mudar o dia grava data_pagamento e vencimento juntos', () => {
    const l = paraLinha(parcela({ status: 'pago', data_pagamento: '2026-09-05', vencimento: '2026-09-05' }));
    expect(l.data).toBe('2026-09-05');
    expect(mudancasDaParcela({ ...l, data: '2026-09-12' })).toEqual({
      status: 'pago', valor: 150, data_pagamento: '2026-09-12', vencimento: '2026-09-12',
    });
  });

  it('pendente vira paga no dia escolhido', () => {
    const l = paraLinha(parcela());
    expect(mudancasDaParcela({ ...l, status: 'pago', data: '2026-09-08' })).toEqual({
      status: 'pago', valor: 150, data_pagamento: '2026-09-08', vencimento: '2026-09-08',
    });
  });

  it('paga volta a pendente: o dia do pagamento sai', () => {
    const l = paraLinha(parcela({ status: 'pago', data_pagamento: '2026-09-05', vencimento: '2026-09-05' }));
    expect(mudancasDaParcela({ ...l, status: 'verificar_pendente', data: '2026-09-10' })).toEqual({
      status: 'verificar_pendente', valor: 150, vencimento: '2026-09-10', data_pagamento: null,
    });
  });

  it('só o valor muda: grava o valor, com a situação e a data que já estavam', () => {
    const l = paraLinha(parcela({ status: 'nao_pago' }));
    expect(mudancasDaParcela({ ...l, valor: '175,50' })).toEqual({
      status: 'nao_pago', valor: 175.5, vencimento: '2026-09-10',
    });
  });

  it('paga antiga sem data_pagamento usa o vencimento como dia do pagamento', () => {
    const l = paraLinha(parcela({ status: 'pago', data_pagamento: null, vencimento: '2026-08-30' }));
    expect(l.data).toBe('2026-08-30');
    expect(mudancasDaParcela(l)).toEqual({});
  });
});
