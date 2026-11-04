/**
 * Modo TV na regra Cofen (30/10/2026): o setor pela conciliação, equipe e
 * pessoas pelo 58, e a unidade dita onde o valor não é H.O.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { montarVisao } from './numeros';
import { numerosDemo } from './demo';
import { dadosDoDestaque } from './destaque/comum';
import { TelaTv } from './TelaTv';
import type { NumerosTv, TelaDoPainel } from './tipos';

const cofen = (parcial: Partial<NumerosTv> = {}) => ({ ...numerosDemo(), regra: 'cofen' as const, ...parcial });
const tela = (template: TelaDoPainel['template'], opcoes: Record<string, unknown> = {}): TelaDoPainel =>
  ({ id: template, template, opcoes });

describe('a migration do setor Cofen', () => {
  const sql = readFileSync(
    resolve(__dirname, '../../../supabase/migrations/20261030230000_modo_tv_setor_cofen_pela_conciliacao.sql'), 'utf8');
  const ramo = sql.slice(sql.indexOf('-- ── Setor Cofen: a conciliação'), sql.indexOf('-- ── Destaques'));

  it('só o painel de setor Cofen troca de fonte, e só com um setor Cofen', () => {
    expect(ramo).toContain("IF p_equipe IS NULL AND COALESCE(to_jsonb(v_setor)->>'regra', '') = 'cofen' THEN");
    expect(ramo).toContain('cardinality(v_cofen), 0) = 1 AND v_cofen[1] = p_setor');
  });

  it('mês, hoje e curva vêm da conciliação, em centavos, pela competência', () => {
    expect(ramo).toContain('INTO v_total, v_total_ho, v_qtd, v_hoje_total, v_hoje_ho');
    expect(ramo).toContain('INTO v_serie');
    expect(ramo.match(/FROM public\.pp_relatorio_conciliacoes c/g)).toHaveLength(2);
    expect(ramo).toContain('SUM(c.pp)');
    expect(ramo).toContain('/ 100.0');
    expect(ramo).toContain('c.data = v_hoje');
    expect(ramo).not.toContain('data_pagamento');
  });

  it('o ramo vem depois da série e antes do ranking das equipes: equipe e pessoas seguem no 58', () => {
    expect(sql.indexOf('-- ── Setor Cofen')).toBeGreaterThan(sql.indexOf('INTO v_serie'));
    expect(ramo).not.toContain('v_ranking');
    expect(ramo).not.toContain('v_destaques');
  });

  it('o pacote diz a fonte, e a prova cobre os setores fora do Cofen', () => {
    expect(sql).toContain("'fonte_setor',     v_fonte,");
    expect(sql).toContain("<> 'cofen'");
    expect(sql).toContain("RAISE EXCEPTION 'PROVA");
    expect(sql).toContain('DELETE FROM public.tv_numeros_cache');
  });
});

describe('a unidade onde o valor aparece', () => {
  const destaque = tela('destaque', { dia: 'mes', mostrar_valor: true });

  it('o Destaque no Cofen em H.O. diz que o valor é H.O., na linha da data', () => {
    const d = dadosDoDestaque(montarVisao(cofen(), 'ho'), destaque);
    expect(d.pessoa).not.toBeNull();
    expect(d.unidade).toBe('em H.O.');
    expect(d.quandoNaTela).toBe(`${d.quando} · valor em H.O.`);
  });

  it('em bruto, ou sem o valor na tela, não diz nada', () => {
    expect(dadosDoDestaque(montarVisao(cofen(), 'bruto'), destaque).quandoNaTela)
      .toBe(dadosDoDestaque(montarVisao(cofen(), 'bruto'), destaque).quando);
    const semValor = dadosDoDestaque(montarVisao(cofen(), 'ho'), tela('destaque', { dia: 'mes', mostrar_valor: false }));
    expect(semValor.unidade).toBe('');
  });

  it('a quitação (Valor Acordo) não leva o «Valores em H.O.» do rodapé; as telas de meta levam', () => {
    const v = montarVisao(cofen(), 'ho');
    const rodape = (t: TelaDoPainel) =>
      render(createElement(TelaTv, { tela: t, tema: 'noite', visao: v, midiaUrl: null })).container.textContent ?? '';
    expect(rodape(tela('quitacao'))).not.toContain('Valores em H.O.');
    expect(rodape(tela('placar'))).toContain('Valores em H.O.');
  });
});
