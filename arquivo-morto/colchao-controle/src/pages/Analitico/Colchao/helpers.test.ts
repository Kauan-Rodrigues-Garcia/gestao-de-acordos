import { describe, expect, it } from 'vitest';
import { agruparColchaoPorOperador, formatarCopiaColchao, nrsUnicos } from './helpers';
import type { ColchaoForaMeta } from '@/services/analitico/colchao.service';

function linha(id: number, operador: string, nr: string, parcela: string, valor: number): ColchaoForaMeta {
  return {
    id,
    empresa_id: 'empresa',
    setor_id: 'setor',
    operador_id: 'operador',
    operador_usuario: operador,
    equipe: 'RECEPTIVO',
    codigo: '123',
    nome_cliente: 'CLIENTE',
    nr_documento: nr,
    titulo: '4191831',
    parcela,
    forma_pagamento: 'boleto_pix',
    tpdoc_original: 'PIX AUTOMÁTICO',
    tipo_comissao: 'Integral',
    valor_recebido: valor,
    total_ho: 0,
    data_pagamento: '2026-08-13',
    mes_referencia: '2026-08-01',
    chave_deduplicacao: `chave-${id}`,
    lote_id: 'lote',
    importado_por_id: 'usuario',
    importado_em: '2026-08-13T12:00:00Z',
  };
}

describe('helpers do Colchão', () => {
  const linhas = [
    linha(1, 'OPERADOR_B', '200', '1', 10),
    linha(2, 'OPERADOR_A', '100', '15', 20),
    linha(3, 'OPERADOR_A', '100', '16', 30),
  ];

  it('remove NR repetido sem perder as parcelas do grupo', () => {
    expect(nrsUnicos(linhas)).toEqual(['100', '200']);
    const grupos = agruparColchaoPorOperador(linhas);
    expect(grupos[0].operador).toBe('OPERADOR_A');
    expect(grupos[0].linhas).toHaveLength(2);
    expect(grupos[0].nrs).toEqual(['100']);
    expect(grupos[0].total).toBe(50);
  });

  it('formata texto por data e operador com NRs únicos', () => {
    expect(formatarCopiaColchao('2026-08-13', linhas)).toBe(
      'COLCHÃO 13/08/2026\n\nOPERADOR_A (1 NR)\n100\n\nOPERADOR_B (1 NR)\n200',
    );
  });
});
