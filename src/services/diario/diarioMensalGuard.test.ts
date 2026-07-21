/**
 * Testes do guard "primeiro relatório do dia deve ser o MENSAL" (PaguePlay).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { LinhaDiario } from './diarioParser';
import {
  diasDoLote,
  loteEhMensal,
  mensalJaImportadoHoje,
  marcarMensalImportadoHoje,
  limparMarcaMensal,
} from './diarioMensalGuard';

function linha(dia: string | null): LinhaDiario {
  return {
    operador_usuario: 'op_teste',
    cpf: '12345678901',
    nome_cliente: 'Cliente Teste',
    acordo_codigo: '123',
    forma_pagamento: 'Pix',
    valor_recebido: 100,
    data_pagamento: dia ? new Date(dia + 'T12:00:00') : null,
    prox_contato: null,
    tabulacao: '',
    id_baixa: '',
    chave_unica: `chave-${dia ?? 'sem-data'}-${Math.random()}`,
  };
}

describe('diasDoLote', () => {
  it('retorna os dias distintos ordenados, ignorando linhas sem data', () => {
    const linhas = [
      linha('2026-07-02'), linha('2026-07-01'), linha('2026-07-02'), linha(null),
    ];
    expect(diasDoLote(linhas)).toEqual(['2026-07-01', '2026-07-02']);
  });

  it('retorna vazio quando nenhuma linha tem data', () => {
    expect(diasDoLote([linha(null)])).toEqual([]);
  });
});

describe('loteEhMensal', () => {
  it('multi-dia é mensal', () => {
    expect(loteEhMensal([linha('2026-07-01'), linha('2026-07-02')])).toBe(true);
  });

  it('um único dia comum NÃO é mensal', () => {
    expect(loteEhMensal([linha('2026-07-15'), linha('2026-07-15')])).toBe(false);
  });

  it('um único dia que é o 1º do mês conta como mensal (exceção do dia 1º)', () => {
    expect(loteEhMensal([linha('2026-07-01')])).toBe(true);
  });

  it('lote sem nenhuma data não é mensal (bloqueia por segurança)', () => {
    expect(loteEhMensal([linha(null)])).toBe(false);
  });
});

describe('marca do mensal (localStorage por empresa + dia)', () => {
  const EMPRESA = 'empresa-teste';
  const HOJE    = '2026-07-21';

  beforeEach(() => localStorage.clear());

  it('sem marca: mensal ainda não importado hoje', () => {
    expect(mensalJaImportadoHoje(EMPRESA, HOJE)).toBe(false);
  });

  it('marcar libera o dia; limpar derruba a marca', () => {
    marcarMensalImportadoHoje(EMPRESA, HOJE);
    expect(mensalJaImportadoHoje(EMPRESA, HOJE)).toBe(true);

    limparMarcaMensal(EMPRESA, HOJE);
    expect(mensalJaImportadoHoje(EMPRESA, HOJE)).toBe(false);
  });

  it('marca é por dia: ontem marcado não libera hoje', () => {
    marcarMensalImportadoHoje(EMPRESA, '2026-07-20');
    expect(mensalJaImportadoHoje(EMPRESA, HOJE)).toBe(false);
  });

  it('marca é por empresa', () => {
    marcarMensalImportadoHoje('outra-empresa', HOJE);
    expect(mensalJaImportadoHoje(EMPRESA, HOJE)).toBe(false);
  });
});
