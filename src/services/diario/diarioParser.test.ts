import { describe, it, expect } from 'vitest';
import {
  normDiario,
  formaKindDiario,
  isCartaoDiario,
  soDigitos,
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

// ── soDigitos (código do cliente) ────────────────────────────────────────────

describe('soDigitos', () => {
  // O ERP exporta o Cód.Cliente com separador de milhar. No relatório de
  // 28/07/2026 veio com vírgula; outras exportações usam ponto. Descartar tudo
  // que não é dígito cobre os dois e devolve o código igual ao da tabulação.
  it('remove separador de milhar com vírgula', () => {
    expect(soDigitos('2,651,454')).toBe('2651454');
  });

  it('remove separador de milhar com ponto', () => {
    expect(soDigitos('2.651.454')).toBe('2651454');
  });

  it('mantém o código quando já vem limpo', () => {
    expect(soDigitos('2651454')).toBe('2651454');
    expect(soDigitos(2651454)).toBe('2651454');
  });

  it('devolve string vazia quando não há dígito', () => {
    expect(soDigitos('')).toBe('');
    expect(soDigitos(null)).toBe('');
    expect(soDigitos('—')).toBe('');
  });
});

// ── resolveColsDiario ────────────────────────────────────────────────────────

describe('resolveColsDiario', () => {
  // Cabeçalho do relatório de 28/07/2026 — o T.I. incluiu "Cód.Cliente" (F).
  const headersReais = [
    'Período', 'Data', 'Id.Baixa', 'Coren', 'Cód.Venda', 'Cód.Cliente',
    'Nr.Documento', 'Cód.Receber', 'CPF', 'Profissional', 'Cód.Acordo',
    'Parcela', 'Forma Pgto', 'Referência', 'Valor Recebido', 'Valor Tarifa',
    'Pague Play (24,96%)', 'Coren (56,28%)', 'Cofen (18,76%)', 'Dt.Baixa',
    'Horário', 'Dt.Pagamento', 'Dt.Repasse', 'Conferido', 'IA', 'Dt. Inicio',
    'Dt. Término', 'Operador', 'Dt. Prev. Pgto', 'Próx. Contato', 'Tabulação',
    'Status',
  ];

  it('resolve as colunas do relatório real do ERP', () => {
    const cols = resolveColsDiario(headersReais);
    expect(cols).not.toBeNull();
    expect(cols!.op).toBe(27);      // Operador
    expect(cols!.cli).toBe(5);      // Cód.Cliente
    expect(cols!.prof).toBe(9);     // Profissional
    expect(cols!.acordo).toBe(10);  // Cód.Acordo
    expect(cols!.forma).toBe(12);   // Forma Pgto
    expect(cols!.valor).toBe(14);   // Valor Recebido
    expect(cols!.idb).toBe(2);      // Id.Baixa
    expect(cols!.prox).toBe(29);    // Próx. Contato
    expect(cols!.dt).toBe(1);       // Data
    expect(cols!.tab).toBe(30);     // Tabulação
  });

  // "Cód.Cliente" e "Cód.Acordo" normalizam para strings parecidas; se a
  // resolução confundir as duas, o código do cliente vira o do acordo e o
  // cruzamento futuro com as tabulações sai errado sem ninguém perceber.
  it('não confunde Cód.Cliente com Cód.Acordo', () => {
    const cols = resolveColsDiario(headersReais)!;
    expect(cols.cli).not.toBe(cols.acordo);
  });

  // Relatórios antigos (antes de 28/07/2026) não têm a coluna. Devem continuar
  // importáveis — só ficam sem código.
  it('aceita relatório antigo, sem Cód.Cliente', () => {
    const antigos = headersReais.filter(h => h !== 'Cód.Cliente');
    const cols = resolveColsDiario(antigos);
    expect(cols).not.toBeNull();
    expect(cols!.cli).toBeUndefined();
    expect(cols!.valor).toBe(13);
  });

  it('retorna null quando faltam colunas obrigatórias', () => {
    expect(resolveColsDiario(['Foo', 'Bar'])).toBeNull();
    expect(resolveColsDiario(['Operador', 'Bar'])).toBeNull(); // sem Valor Recebido
  });
});

// ── diaReferencia ────────────────────────────────────────────────────────────

function linha(data: Date | null): LinhaDiario {
  return {
    operador_usuario: 'op', cliente_codigo: '', nome_cliente: '', acordo_codigo: '',
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
