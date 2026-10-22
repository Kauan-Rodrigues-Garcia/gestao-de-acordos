import { describe, expect, it } from 'vitest';
import { chaveDeduplicacaoColchao } from './colchao.service';
import type { LinhaColchao } from './analiticoComum';

function linha(parcela: string): LinhaColchao {
  return {
    operador_usuario: 'OPERADOR_A',
    equipe: 'RECEPTIVO',
    codigo: '123',
    nome_cliente: 'CLIENTE',
    nr_documento: '12847788',
    titulo: '4191831',
    parcela,
    forma_pagamento: 'boleto_pix',
    tpdoc_original: 'PIX AUTOMÁTICO',
    valor_recebido: 10,
    total_ho: 0,
    data_pagamento: new Date(2026, 7, 13),
  };
}

describe('chaveDeduplicacaoColchao', () => {
  it('é estável para diferenças de caixa e acento do texto operacional', () => {
    const a = linha('15');
    const b = { ...linha('15'), operador_usuario: 'operador_a', tpdoc_original: 'PIX AUTOMATICO' };
    expect(chaveDeduplicacaoColchao(a)).toBe(chaveDeduplicacaoColchao(b));
  });

  it('não mistura parcelas diferentes do mesmo NR', () => {
    expect(chaveDeduplicacaoColchao(linha('15'))).not.toBe(chaveDeduplicacaoColchao(linha('16')));
  });
});
