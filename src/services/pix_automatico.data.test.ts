/**
 * pix_automatico.data.test.ts — o dia de um registro lançado em outro mês.
 *
 * A aba do Pix passou a seguir o mês escolhido no sistema. Registrar olhando
 * agosto tem de produzir um acordo DE AGOSTO: todas as contas da tela (dobra,
 * ranking, meta por equipe, premiação) filtram por `criado_em.startsWith(mes)`,
 * e uma linha nascida em setembro sumiria da tela que a criou.
 *
 * O teste que importa é o do fuso. `criado_em` é `timestamptz`: meia-noite em
 * São Paulo vira 03:00 UTC do mesmo dia, mas meia-noite UTC seria 21:00 do dia
 * ANTERIOR — e um acordo do dia 01/08 gravado assim cairia em 31/07. Por isso
 * o instante é meio-dia local.
 */
import { describe, it, expect, vi } from 'vitest';

// O módulo importa `supabase` no topo; sem mock, createClient() explode em
// teste por falta de VITE_SUPABASE_URL. Mesmo padrão de `pix_automatico.formato`.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));

import { instanteDoDiaPix } from './pix_automatico.service';

/** A data local (São Paulo) de um instante ISO — o que a tabela mostra. */
function diaLocal(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

describe('instanteDoDiaPix', () => {
  it('devolve um instante que continua sendo o mesmo dia em São Paulo', () => {
    for (const dia of ['2026-08-01', '2026-08-15', '2026-08-31']) {
      const iso = instanteDoDiaPix(dia)!;
      expect(iso).not.toBeNull();
      expect(diaLocal(iso)).toBe(dia);
    }
  });

  it('o primeiro e o último dia do mês ficam DENTRO do mês, em UTC também', () => {
    // É o `startsWith` das contas da tela que lê este prefixo. Se o dia 31 de
    // agosto virasse `2026-09-01T...`, o acordo sumiria de agosto no instante
    // seguinte ao registro — o defeito que este formato existe para evitar.
    expect(instanteDoDiaPix('2026-08-01')!.startsWith('2026-08')).toBe(true);
    expect(instanteDoDiaPix('2026-08-31')!.startsWith('2026-08')).toBe(true);
  });

  it('recusa o que não é uma data', () => {
    expect(instanteDoDiaPix('')).toBeNull();
    expect(instanteDoDiaPix('2026-08')).toBeNull();
    expect(instanteDoDiaPix('31/08/2026')).toBeNull();
    expect(instanteDoDiaPix('2026-13-01')).toBeNull();
  });
});
