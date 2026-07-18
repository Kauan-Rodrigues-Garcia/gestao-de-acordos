import { describe, it, expect } from 'vitest';
import { formatarLinhaPix } from './pix_automatico.service';

describe('formatarLinhaPix', () => {
  it('monta o texto de encaminhamento no formato esperado', () => {
    const linha = formatarLinhaPix(
      {
        nr_cliente: '23232',
        operador_nome: 'LUIZ_SILVA',
        valor: 3334,
        criado_em: '2026-07-08T10:30:00.000Z',
      },
      8.33,
    );
    expect(linha).toBe('NR: 23232 LUIZ_SILVA VALOR 3.334,00 COMISSÃO 8,33 08/07');
  });

  it('usa "—" quando operador é nulo e normaliza espaços', () => {
    const linha = formatarLinhaPix(
      { nr_cliente: 'NR-1', operador_nome: null, valor: 100.5, criado_em: '2026-01-02T12:00:00.000Z' },
      0.25,
    );
    expect(linha).toBe('NR: NR-1 — VALOR 100,50 COMISSÃO 0,25 02/01');
  });
});
