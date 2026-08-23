/**
 * ajusteManual.service.test.ts
 *
 * A correção manual mexe em número de dinheiro que sobe para operador, equipe e
 * setor. O que estes casos travam é o que ela promete e o que ela NÃO deve
 * fazer:
 *
 *   • soma e subtração chegam com o sinal certo;
 *   • o cancelado não conta — nem como zero, nem como negativo;
 *   • não é Pix e não é cartão: o rótulo é próprio, senão o valor entraria numa
 *     conta que a conciliação bancária confere;
 *   • `qtd = 0`, porque o ajuste não é um pagamento — contá-lo estragaria o
 *     ticket médio de quem recebeu o ajuste.
 */
import { describe, it, expect } from 'vitest';
import {
  ajustesComoLinhas, primeiroDiaDaCompetencia, ROTULO_AJUSTE, traduzir,
} from './ajusteManual.service';
import { PP_HO_PERCENTUAL } from '@/lib/index';

type Somas = Map<string, { valor: number; setorId: string | null; equipeId: string | null }>;

function somas(entradas: [string, number, string | null][]): Somas {
  const m: Somas = new Map();
  for (const [id, valor, setorId] of entradas) {
    m.set(id, { valor, setorId, equipeId: null });
  }
  return m;
}

describe('primeiroDiaDaCompetencia', () => {
  it('joga qualquer data do mês para o dia 1', () => {
    expect(primeiroDiaDaCompetencia('2026-08')).toBe('2026-08-01');
    expect(primeiroDiaDaCompetencia('2026-08-27')).toBe('2026-08-01');
  });
});

describe('ajustesComoLinhas', () => {
  it('devolve uma linha por operador, com o valor no total', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 10_000, 'setor-a']]), '2026-08', true);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].operador_id).toBe('op-1');
    expect(linhas[0].total).toBe(10_000);
    expect(linhas[0].setor_id).toBe('setor-a');
  });

  it('preserva o sinal negativo — tirar é tirar', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', -2_500, null]]), '2026-08', true);
    expect(linhas[0].total).toBe(-2_500);
  });

  it('NÃO é Pix e NÃO é cartão: o rótulo é próprio', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 100, null]]), '2026-08', true);
    expect(linhas[0].forma_detalhe).toBe(ROTULO_AJUSTE);
    expect(linhas[0].forma_detalhe).not.toMatch(/pix|cart/i);
  });

  it('qtd é zero — o ajuste não é um pagamento', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 5_000, null]]), '2026-08', true);
    expect(linhas[0].qtd).toBe(0);
  });

  it('calcula H.O. na PaguePlay com a constante do projeto', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 1_000, null]]), '2026-08', true);
    expect(linhas[0].total_ho).toBeCloseTo(1_000 * PP_HO_PERCENTUAL, 6);
  });

  it('H.O. é zero na BookPlay — lá nenhuma linha do relatório tem H.O.', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 1_000, null]]), '2026-08', false);
    expect(linhas[0].total_ho).toBe(0);
  });

  it('entra no dia 1: o ajuste é de competência, não tem data de pagamento', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 100, null]]), '2026-08', true);
    expect(linhas[0].dia).toBe('2026-08-01');
  });

  it('marca como tabulado — o ajuste tem dono e motivo', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 100, null]]), '2026-08', true);
    // 'nao_tabulado' o jogaria no aviso de "recebimento sem acordo", que é
    // outra conversa e assustaria quem lê o painel.
    expect(linhas[0].status_tabulacao).toBe('tabulado');
  });

  it('operador com saldo zero não vira linha', () => {
    const linhas = ajustesComoLinhas(somas([['op-1', 0, null]]), '2026-08', true);
    expect(linhas).toEqual([]);
  });

  it('sem ajuste nenhum, não inventa linha', () => {
    expect(ajustesComoLinhas(new Map(), '2026-08', true)).toEqual([]);
  });

  it('vários operadores viram várias linhas', () => {
    const linhas = ajustesComoLinhas(
      somas([['op-1', 100, 'a'], ['op-2', -50, 'b'], ['op-3', 25, 'a']]),
      '2026-08', true,
    );
    expect(linhas.map(l => l.operador_id).sort()).toEqual(['op-1', 'op-2', 'op-3']);
    expect(linhas.reduce((s, l) => s + l.total, 0)).toBe(75);
  });
});

describe('traduzir', () => {
  it('nomeia a migration quando a tabela não existe', () => {
    expect(traduzir('relation "analitico_ajustes_manuais" does not exist'))
      .toContain('20260823150000');
  });

  it('explica a recusa por permissão sem despejar SQL na tela', () => {
    const texto = traduzir('new row violates row-level security policy');
    expect(texto).toBe('O banco recusou: você não tem permissão para isso.');
  });

  it('traduz o valor zero e o motivo em branco', () => {
    expect(traduzir('violates check constraint "ajuste_valor_nao_zero"'))
      .toContain('diferente de zero');
    expect(traduzir('violates check constraint "ajuste_motivo_preenchido"'))
      .toContain('motivo');
  });

  it('deixa passar o que não sabe traduzir', () => {
    expect(traduzir('connection reset by peer')).toBe('connection reset by peer');
  });
});
