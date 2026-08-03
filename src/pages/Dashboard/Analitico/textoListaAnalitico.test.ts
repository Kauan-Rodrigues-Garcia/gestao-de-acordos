/**
 * textoListaAnalitico.test.ts
 *
 * O texto do "Copiar lista" sai do sistema pelo WhatsApp e chega ao operador
 * como prestação de contas do mês. Formato herdado do protótipo HTML, e é por
 * isso que os testes conferem a linha inteira: mudar a ordem das colunas ou o
 * separador quebra a leitura de quem recebe.
 */
import { describe, it, expect } from 'vitest';
import { formatBRL } from '@/lib/money';
import type { AnaliticoRecebimento } from '@/lib/supabase';
import {
  fmtDataAnalitico, periodoDasLinhas, montarTextoListaAnalitico,
} from './textoListaAnalitico';

function linha(over: Partial<AnaliticoRecebimento> = {}): AnaliticoRecebimento {
  return {
    codigo: '4141294',
    forma_pagamento: 'boleto_pix',
    valor_recebido: 250.5,
    total_ho: 62.5,
    data_pagamento: '2026-07-15',
    ...over,
  } as AnaliticoRecebimento;
}

describe('fmtDataAnalitico', () => {
  it('inverte para dd/mm/yyyy', () => {
    expect(fmtDataAnalitico('2026-07-05')).toBe('05/07/2026');
  });

  it('sem data, travessão', () => {
    expect(fmtDataAnalitico(null)).toBe('—');
  });
});

describe('periodoDasLinhas', () => {
  it('um dia só não vira intervalo', () => {
    expect(periodoDasLinhas([linha({ data_pagamento: '2026-07-05' })])).toBe('05/07/2026');
  });

  it('pega a menor e a maior data, fora de ordem', () => {
    const periodo = periodoDasLinhas([
      linha({ data_pagamento: '2026-07-20' }),
      linha({ data_pagamento: '2026-07-03' }),
      linha({ data_pagamento: '2026-07-11' }),
    ]);
    expect(periodo).toBe('03/07/2026 a 20/07/2026');
  });

  it('lista vazia não tem período', () => {
    expect(periodoDasLinhas([])).toBe('');
  });
});

describe('montarTextoListaAnalitico', () => {
  it('monta cabeçalho, linhas e totais', () => {
    const texto = montarTextoListaAnalitico('MARIA', [
      linha({ codigo: '111', valor_recebido: 100, total_ho: 25, data_pagamento: '2026-07-01' }),
      linha({ codigo: '222', valor_recebido: 200, total_ho: 50, data_pagamento: '2026-07-10',
              forma_pagamento: 'cartao' }),
    ]);

    expect(texto).toContain('*MARIA* — acordos pagos (01/07/2026 a 10/07/2026)');
    expect(texto).toContain(`111 - Boleto/Pix - ${formatBRL(100)} - ${formatBRL(25)} - 01/07/2026`);
    expect(texto).toContain(`222 - Cartão - ${formatBRL(200)} - ${formatBRL(50)} - 10/07/2026`);
    expect(texto).toContain(`Total: ${formatBRL(300)} | HO: ${formatBRL(75)}`);
  });

  it('lista vazia ainda fecha com total zero', () => {
    const texto = montarTextoListaAnalitico('JOAO', []);
    expect(texto).toContain('*JOAO* — acordos pagos\n');
    expect(texto).toContain(`Total: ${formatBRL(0)} | HO: ${formatBRL(0)}`);
  });

  it('linha sem data não quebra o texto', () => {
    const texto = montarTextoListaAnalitico('JOAO', [linha({ data_pagamento: null })]);
    expect(texto).toContain('- —');
  });
});
