import { describe, it, expect } from 'vitest';
import {
  norm,
  extrairCodigo,
  extrairNome,
  toDate,
  isCartao,
  mapearFormaPgto,
  resolveCols,
  ehEquipeRetencao,
} from './analiticoParser';

// ── norm ────────────────────────────────────────────────────────────────────

describe('norm', () => {
  it('remove acentos e passa para lower sem espaços', () => {
    expect(norm('Equipe/SubGrupo')).toBe('equipe/subgrupo');
    expect(norm('TpDoc')).toBe('tpdoc');
    expect(norm('Cobradora')).toBe('cobradora');
    expect(norm('Total HO')).toBe('totalho');
  });

  it('retorna string vazia para null/undefined', () => {
    expect(norm(null)).toBe('');
    expect(norm(undefined)).toBe('');
  });
});

// ── extrairCodigo ────────────────────────────────────────────────────────────

describe('extrairCodigo', () => {
  it('extrai código numérico do início', () => {
    expect(extrairCodigo('1994034 - DIELY NEVES MEIRELES')).toBe('1994034');
    expect(extrairCodigo('001234 - NOME')).toBe('001234');
  });

  it('retorna tudo antes do " - " quando há código', () => {
    expect(extrairCodigo('5375194 - SIMONE MARIA')).toBe('5375194');
  });

  it('lida com string sem separador', () => {
    expect(extrairCodigo('1375834')).toBe('1375834');
  });

  it('retorna string vazia para null', () => {
    expect(extrairCodigo(null)).toBe('');
    expect(extrairCodigo('')).toBe('');
  });
});

// ── extrairNome ──────────────────────────────────────────────────────────────

describe('extrairNome', () => {
  it('extrai nome após " - "', () => {
    expect(extrairNome('1994034 - DIELY NEVES MEIRELES')).toBe('DIELY NEVES MEIRELES');
    expect(extrairNome('5375194 - SIMONE MARIA CAVALCANTI')).toBe('SIMONE MARIA CAVALCANTI');
  });

  it('retorna string inteira quando não há separador', () => {
    expect(extrairNome('ALGUM NOME')).toBe('ALGUM NOME');
  });
});

// ── toDate ───────────────────────────────────────────────────────────────────

describe('toDate', () => {
  it('converte Date object', () => {
    const d = new Date(2026, 5, 15); // junho 2026
    expect(toDate(d)).toEqual(new Date(2026, 5, 15));
  });

  it('converte serial Excel (número)', () => {
    // Serial 46095 = 2026-03-03 em UTC
    const d = toDate(46095);
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
  });

  it('converte string dd/mm/yyyy', () => {
    const d = toDate('23/06/2026');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5);   // junho = índice 5
    expect(d!.getDate()).toBe(23);
  });

  it('converte string yyyy-mm-dd', () => {
    const d = toDate('2026-06-23');
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(23);
  });

  it('retorna null para valores inválidos', () => {
    expect(toDate(null)).toBeNull();
    expect(toDate('')).toBeNull();
    expect(toDate('não é data')).toBeNull();
  });
});

// ── isCartao e mapearFormaPgto ────────────────────────────────────────────────

describe('isCartao', () => {
  it('detecta CARTÃO DE CRÉDITO', () => {
    expect(isCartao('CARTÃO DE CRÉDITO')).toBe(true);
    expect(isCartao('Cartao de Credito')).toBe(true);
    expect(isCartao('cartao')).toBe(true);
  });

  it('não detecta BOLETO como cartão', () => {
    expect(isCartao('BOLETO NEGOCIAÇÃO')).toBe(false);
    expect(isCartao('PIX')).toBe(false);
    expect(isCartao('BOLEPIX')).toBe(false);
  });
});

describe('mapearFormaPgto', () => {
  it('mapeia BOLETO NEGOCIAÇÃO para boleto_pix', () => {
    expect(mapearFormaPgto('BOLETO NEGOCIAÇÃO')).toBe('boleto_pix');
    expect(mapearFormaPgto('PIX')).toBe('boleto_pix');
  });

  it('mapeia CARTÃO DE CRÉDITO para cartao', () => {
    expect(mapearFormaPgto('CARTÃO DE CRÉDITO')).toBe('cartao');
  });
});

// ── resolveCols ───────────────────────────────────────────────────────────────

describe('resolveCols', () => {
  it('resolve colunas do relatório real', () => {
    const headers = [
      'Cobradora', 'Equipe/SubGrupo', 'Cliente', 'Email', 'Título',
      'Parcela', 'NrDocumento', 'Empresa', 'Tipo Venda', 'TpDoc',
      'DtLig', 'DtPgto', 'Dias em atraso', 'Recebido',
      'Dias entre ligação e baixa', 'Total HO',
    ];
    const cols = resolveCols(headers);
    expect(cols).not.toBeNull();
    expect(cols!.op).toBe(0);   // Cobradora
    expect(cols!.eq).toBe(1);   // Equipe/SubGrupo
    expect(cols!.cli).toBe(2);  // Cliente
    expect(cols!.tp).toBe(9);   // TpDoc (índice 9 — NÃO Tipo Venda que é índice 8)
    expect(cols!.dt).toBe(11);  // DtPgto
    expect(cols!.rec).toBe(13); // Recebido
    expect(cols!.ho).toBe(15);  // Total HO
  });

  it('rejeita planilha sem colunas obrigatórias', () => {
    expect(resolveCols(['A', 'B', 'C'])).toBeNull();
  });

  it('tolera variações de nome', () => {
    const headers = ['operador', 'cliente', 'formapagamento', 'datapagamento', 'valorrecebido'];
    const cols = resolveCols(headers);
    expect(cols).not.toBeNull();
    expect(cols!.tp).toBe(2);   // formapagamento
    expect(cols!.dt).toBe(3);   // datapagamento
    expect(cols!.rec).toBe(4);  // valorrecebido
  });

  it('NÃO mapeia Tipo Venda para coluna tp', () => {
    // "tipovenda" não deve ser mapeado para tp (só TpDoc/formapagamento)
    const headers = ['Cobradora', 'Cliente', 'Tipo Venda', 'TpDoc', 'DtPgto', 'Recebido'];
    const cols = resolveCols(headers);
    expect(cols).not.toBeNull();
    expect(cols!.tp).toBe(3); // TpDoc, não Tipo Venda (índice 2)
  });
});

// ── ehEquipeRetencao ─────────────────────────────────────────────────────────

describe('ehEquipeRetencao', () => {
  it('reconhece a equipe de Retenção com e sem acento', () => {
    expect(ehEquipeRetencao('Retenção')).toBe(true);
    expect(ehEquipeRetencao('RETENCAO')).toBe(true);
    expect(ehEquipeRetencao('retencao')).toBe(true);
  });

  it('reconhece as variações com subgrupo', () => {
    // A coluna Equipe/SubGrupo do relatório 58 traz as duas grafias.
    expect(ehEquipeRetencao('Retenção e Retenção')).toBe(true);
    expect(ehEquipeRetencao('Retenção / Retenção')).toBe(true);
    expect(ehEquipeRetencao('  Retenção  ')).toBe(true);
  });

  it('não confunde com as equipes do Receptivo', () => {
    expect(ehEquipeRetencao('Receptivo')).toBe(false);
    expect(ehEquipeRetencao('Play 1')).toBe(false);
    expect(ehEquipeRetencao('')).toBe(false);
    expect(ehEquipeRetencao(null)).toBe(false);
    expect(ehEquipeRetencao(undefined)).toBe(false);
  });
});
