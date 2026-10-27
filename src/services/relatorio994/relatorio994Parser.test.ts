import { describe, expect, it } from 'vitest';
import { parseRelatorio994Rows, valorDaCelula } from './relatorio994Parser';

// Cabeçalho real do 994 de outubro/2026. Linhas inventadas — nada de cliente real.
const CAB = ['Cód. Venda', 'Nr. Doc.', 'Cód. Acordo', 'Cód. Cliente', 'Cliente', 'Franquia', 'Operador',
  'Tp. Documento', 'Data Acordo', 'Data Pagamento', 'Pago no mesmo dia?', 'Valor Pagto', 'CodItens', 'Item',
  'TipoVenda', 'Setor Original', 'Sub Grupo'];

const HOJE = new Date(2026, 9, 27);

function linha(p: {
  nr?: string; op?: string; tp?: string; acordo?: string; pgto?: string; valor?: unknown; sub?: string; cliente?: string;
}): unknown[] {
  return ['1', p.nr ?? '100', '1', '1', p.cliente ?? 'FULANA DE TAL', 'FRANQUIA', p.op ?? 'ana_retencao',
    p.tp ?? 'PIX', p.acordo ?? '10/10/2026 10:00:00', p.pgto ?? '10/10/2026', 'Sim', p.valor ?? 100, '1', 'ITEM',
    'PEC', 'JORNADAPLAY', p.sub ?? 'RETENÇÃO'];
}

const ler = (...linhas: unknown[][]) => parseRelatorio994Rows([CAB, ...linhas], HOJE);

describe('parseRelatorio994Rows', () => {
  it('importa só a Retenção — o resto do Jornada vem pelo 58', () => {
    const r = ler(
      linha({ nr: '1', valor: 200 }),
      linha({ nr: '2', op: 'bia_digital', sub: 'DIGITAL', valor: 300 }),
      linha({ nr: '3', op: 'cris_acesso', sub: 'ACESSO/ RECEBIMENTO', valor: 50 }),
    );
    expect(r.linhas.map(l => l.codigo)).toEqual(['1']);
    expect(r.fora.outraEquipe).toEqual({ linhas: 2, valor: 350 });
  });

  it('pagamento com data depois de hoje não é recebimento', () => {
    const r = ler(
      linha({ nr: '1', tp: 'PADRÃO', acordo: '16/10/2026 09:00:00', pgto: '16/09/2027', valor: 3345 }),
      linha({ nr: '2', tp: 'PADRÃO', acordo: '13/10/2026 09:00:00', pgto: '13/10/2026', valor: 1910.4 }),
    );
    expect(r.linhas.map(l => l.codigo)).toEqual(['2']);
    expect(r.fora.pagamentoFuturo).toEqual({ linhas: 1, valor: 3345 });
  });

  it('linha futura sem Nr. Doc. sai como futura, não como erro', () => {
    const r = ler(linha({ nr: '', tp: 'PADRÃO', pgto: '08/09/2027', valor: 1200 }));
    expect(r.erros).toEqual([]);
    expect(r.fora.pagamentoFuturo.linhas).toBe(1);
  });

  it('Pix Automático de acordo antigo é Colchão; o primeiro débito conta', () => {
    const r = ler(
      linha({ nr: '1', tp: 'PIX AUTOMÁTICO', acordo: '07/07/2026 09:11:12', pgto: '08/10/2026', valor: 224.1 }),
      linha({ nr: '2', tp: 'PIX AUTOMÁTICO', acordo: '13/10/2026 09:00:00', pgto: '15/10/2026', valor: 186 }),
      // Pix comum de acordo antigo não é recorrência: conta.
      linha({ nr: '3', tp: 'PIX', acordo: '06/08/2026 09:00:00', pgto: '01/10/2026', valor: 268 }),
    );
    expect(r.colchao.map(l => l.codigo)).toEqual(['1']);
    expect(r.linhas.map(l => l.codigo).sort()).toEqual(['2', '3']);
  });

  it('soma o mesmo NR no mesmo dia e separa dias diferentes', () => {
    const r = ler(
      linha({ nr: '7', pgto: '05/10/2026', valor: 100 }),
      linha({ nr: '7', pgto: '05/10/2026', valor: 50 }),
      linha({ nr: '7', pgto: '06/10/2026', valor: 10 }),
    );
    expect(r.linhas.map(l => [l.data_pagamento.getDate(), l.valor_recebido])).toEqual([[5, 150], [6, 10]]);
  });

  it('a linha de total do fim do arquivo sai calada', () => {
    const total = Array(CAB.length).fill(null);
    total[11] = 264868.21;
    const r = ler(linha({ nr: '1' }), total);
    expect(r.linhas).toHaveLength(1);
    expect(r.erros).toEqual([]);
    expect(r.fora.outraEquipe.linhas).toBe(0);
  });

  it('PADRÃO vira cartão; Pix fica Boleto/Pix', () => {
    const r = ler(linha({ nr: '1', tp: 'PADRÃO' }), linha({ nr: '2', tp: 'PIX' }));
    const forma = Object.fromEntries(r.linhas.map(l => [l.codigo, l.forma_pagamento]));
    expect(forma).toEqual({ '1': 'cartao', '2': 'boleto_pix' });
  });

  it('recusa o 58 com o caminho certo', () => {
    const r = parseRelatorio994Rows([
      ['Cobradora', 'Equipe/SubGrupo', 'Cliente', 'NrDocumento', 'TpDoc', 'DtPgto', 'Recebido'],
      ['ana', '', '1 - X', '1', 'PIX', '01/10/2026', 10],
    ], HOJE);
    expect(r.linhas).toEqual([]);
    expect(r.erros[0]).toMatch(/relatório 58/);
  });
});

describe('valorDaCelula', () => {
  it('lê número, formato brasileiro e o do ERP em inglês', () => {
    expect(valorDaCelula(1432.8)).toBe(1432.8);
    expect(valorDaCelula('1.432,80')).toBe(1432.8);
    expect(valorDaCelula('1,432.80')).toBe(1432.8);
    expect(valorDaCelula('169.15')).toBe(169.15);
    expect(valorDaCelula('')).toBe(0);
  });
});
