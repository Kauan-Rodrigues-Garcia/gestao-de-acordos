import { describe, expect, it } from 'vitest';
import { idsAusentesDoRelatorioMensal } from './analitico.service';

const linha = (id: string, operador: string, codigo: string, mes = '2026-08-01') => ({
  id,
  operador_usuario: operador,
  codigo,
  mes_referencia: mes,
});

describe('sincronização do relatório mensal completo', () => {
  it('remove apenas grupos antigos que não aparecem no arquivo atual', () => {
    const existentes = [
      linha('mantem-1', 'AGATHA_ROCHA', '13000001'),
      linha('mantem-2', 'AGATHA_ROCHA', '13000001'),
      linha('retencao-antiga', 'tamiris_hilario', '13010424'),
      linha('colchao-antigo', 'KAUAN_TEIXEIRA', '12980581'),
      linha('nr-retirado', 'THIAGO_ALVES', '12995133'),
    ];
    const relatorioAtual = [
      linha('arquivo', 'AGATHA_ROCHA', '13000001'),
    ];

    expect(idsAusentesDoRelatorioMensal(existentes, relatorioAtual)).toEqual([
      'retencao-antiga',
      'colchao-antigo',
      'nr-retirado',
    ]);
  });

  it('considera operador, NR e mês na identidade do grupo', () => {
    const existentes = [
      linha('outro-operador', 'OPERADOR_B', '13000001'),
      linha('outro-nr', 'OPERADOR_A', '13000002'),
      linha('outro-mes', 'OPERADOR_A', '13000001', '2026-07-01'),
    ];
    const relatorioAtual = [linha('arquivo', 'OPERADOR_A', '13000001')];

    expect(idsAusentesDoRelatorioMensal(existentes, relatorioAtual)).toEqual([
      'outro-operador',
      'outro-nr',
      'outro-mes',
    ]);
  });
});
