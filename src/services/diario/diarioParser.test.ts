import { describe, it, expect } from 'vitest';
import {
  normDiario,
  formaKindDiario,
  isCartaoDiario,
  fmtCPF,
  dayKeyDiario,
  resolveColsDiario,
  diaReferencia,
  type LinhaDiario,
} from './diarioParser';

// ── normDiario ───────────────────────────────────────────────────────────────

describe('normDiario', () => {
  it('remove acentos, pontuação e espaços', () => {
    expect(normDiario('Cód.Acordo')).toBe('codacordo');
    expect(normDiario('Forma Pgto')).toBe('formapgto');
    expect(normDiario('Próx. Contato')).toBe('proxcontato');
    expect(normDiario('Id.Baixa')).toBe('idbaixa');
    expect(normDiario('Valor Recebido')).toBe('valorrecebido');
  });

  it('retorna string vazia para null/undefined', () => {
    expect(normDiario(null)).toBe('');
    expect(normDiario(undefined)).toBe('');
  });
});

// ── formaKindDiario ──────────────────────────────────────────────────────────

describe('formaKindDiario', () => {
  it('classifica pix, boleto e cartão', () => {
    expect(formaKindDiario('Pix')).toBe('pix');
    expect(formaKindDiario('Boleto')).toBe('boleto');
    expect(formaKindDiario('Cartão Padrão')).toBe('cartao');
    expect(formaKindDiario('CARTAO RECORRENTE')).toBe('cartao');
  });

  it('retorna outro para formas desconhecidas', () => {
    expect(formaKindDiario('Dinheiro')).toBe('outro');
    expect(formaKindDiario('')).toBe('outro');
  });
});

describe('isCartaoDiario', () => {
  it('detecta variações de cartão', () => {
    expect(isCartaoDiario('Cartão Padrão')).toBe(true);
    expect(isCartaoDiario('cartao')).toBe(true);
    expect(isCartaoDiario('Pix')).toBe(false);
  });
});

// ── fmtCPF ───────────────────────────────────────────────────────────────────

describe('fmtCPF', () => {
  it('formata CPF com 11 dígitos', () => {
    expect(fmtCPF('09822174470')).toBe('098.221.744-70');
  });

  it('completa zero à esquerda quando o Excel perde (10 dígitos)', () => {
    expect(fmtCPF('9822174470')).toBe('098.221.744-70');
  });

  it('remove máscara existente antes de reformatar', () => {
    expect(fmtCPF('098.221.744-70')).toBe('098.221.744-70');
  });

  it('retorna o valor bruto quando não é CPF', () => {
    expect(fmtCPF('123')).toBe('123');
    expect(fmtCPF(null)).toBe('');
  });
});

// ── resolveColsDiario ────────────────────────────────────────────────────────

describe('resolveColsDiario', () => {
  const headersReais = [
    'Período', 'Data', 'Id.Baixa', 'Coren', 'Cód.Venda', 'Nr.Documento',
    'Cód.Receber', 'CPF', 'Profissional', 'Cód.Acordo', 'Parcela', 'Forma Pgto',
    'Referência', 'Valor Recebido', 'Valor Tarifa', 'Pague Play (24,96%)',
    'Coren (56,28%)', 'Cofen (18,76%)', 'Dt.Baixa', 'Horário', 'Dt.Pagamento',
    'Dt.Repasse', 'Conferido', 'IA', 'Dt. Inicio', 'Dt. Término', 'Operador',
    'Dt. Prev. Pgto', 'Próx. Contato', 'Tabulação', 'Status',
  ];

  it('resolve as colunas do relatório real do ERP', () => {
    const cols = resolveColsDiario(headersReais);
    expect(cols).not.toBeNull();
    expect(cols!.op).toBe(26);      // Operador
    expect(cols!.cpf).toBe(7);      // CPF
    expect(cols!.prof).toBe(8);     // Profissional
    expect(cols!.acordo).toBe(9);   // Cód.Acordo
    expect(cols!.forma).toBe(11);   // Forma Pgto
    expect(cols!.valor).toBe(13);   // Valor Recebido
    expect(cols!.idb).toBe(2);      // Id.Baixa
    expect(cols!.prox).toBe(28);    // Próx. Contato
    expect(cols!.dt).toBe(1);       // Data
    expect(cols!.tab).toBe(29);     // Tabulação
  });

  it('retorna null quando faltam colunas obrigatórias', () => {
    expect(resolveColsDiario(['Foo', 'Bar'])).toBeNull();
    expect(resolveColsDiario(['Operador', 'Bar'])).toBeNull(); // sem Valor Recebido
  });
});

// ── diaReferencia ────────────────────────────────────────────────────────────

function linha(data: Date | null): LinhaDiario {
  return {
    operador_usuario: 'op', cpf: '', nome_cliente: '', acordo_codigo: '',
    forma_pagamento: 'Pix', valor_recebido: 10, data_pagamento: data,
    prox_contato: null, tabulacao: '', id_baixa: '', chave_unica: 'k',
  };
}

describe('diaReferencia', () => {
  it('retorna o dia mais frequente entre as datas de pagamento', () => {
    const linhas = [
      linha(new Date(2026, 6, 1)),
      linha(new Date(2026, 6, 1)),
      linha(new Date(2026, 5, 30)),
    ];
    expect(diaReferencia(linhas)).toBe('2026-07-01');
  });

  it('retorna null quando nenhuma linha tem data', () => {
    expect(diaReferencia([linha(null)])).toBeNull();
  });
});

// ── dayKeyDiario ─────────────────────────────────────────────────────────────

describe('dayKeyDiario', () => {
  it('gera chave yyyy-MM-dd', () => {
    expect(dayKeyDiario(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
