/**
 * O Extra do relatório não é Divergente — conferido no SQL da migration
 * 20261028180000.
 *
 * Em out/2026 eram 464 linhas «Extra» do Receptivo (R$ 196.543,73) marcadas
 * Divergente, e «Confirmar transferência» tirava o DIRETO do colega. As três
 * funções são reescritas inteiras a cada `CREATE OR REPLACE`; uma reescrita a
 * partir das versões antigas devolveria o defeito sem erro nenhum.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_analitico_extra_nao_e_divergente.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ')
  .replace(/\s+/g, ' ');

function corpoDe(nome: string): string {
  const i = LISO.indexOf(`FUNCTION public.${nome}(`);
  expect(i, `função ${nome} não está na migration`).toBeGreaterThan(-1);
  return LISO.slice(i, LISO.indexOf('$function$;', i));
}

const EXTRA = "COALESCE(v_linha.tipo_comissao, '') ILIKE '%extra%'";

describe('fn_analitico_status_tabulacao', () => {
  const corpo = corpoDe('fn_analitico_status_tabulacao');
  it('Extra com direto do colega é tabulado nele, antes do ramo Divergente', () => {
    const extra = corpo.indexOf(`v_achado.alvo_id IS NOT NULL AND ${EXTRA}`);
    expect(extra).toBeGreaterThan(-1);
    expect(extra).toBeLessThan(corpo.indexOf("'divergente'"));
    expect(corpo).toContain("'extra_do_direto', true");
  });
});

describe('fn_analitico_status_tabulacao_lote', () => {
  const corpo = corpoDe('fn_analitico_status_tabulacao_lote');
  it('lê o tipo de comissão da linha', () => {
    expect(corpo).toContain('r.acordo_id, r.tipo_comissao FROM public.analitico_recebimentos r');
  });
  it('o ramo Extra vem antes do Divergente e grava tabulado', () => {
    const extra = corpo.indexOf(`ELSIF v_achado.alvo_id IS NOT NULL AND ${EXTRA}`);
    expect(extra).toBeGreaterThan(-1);
    expect(extra).toBeLessThan(corpo.indexOf("v_status := 'divergente'"));
  });
});

describe('fn_analitico_tabular_divergente', () => {
  const corpo = corpoDe('fn_analitico_tabular_divergente');
  it('nunca transfere o direto de uma linha Extra', () => {
    const extra = corpo.indexOf(`IF ${EXTRA} THEN`);
    expect(extra).toBeGreaterThan(-1);
    expect(extra).toBeLessThan(corpo.indexOf('FOR UPDATE', extra));
    expect(corpo).toContain("'resultado', 'extra_do_direto'");
  });
});

describe('acerto das linhas já gravadas', () => {
  it('só Divergente com tipo Extra, só status e acordo', () => {
    expect(LISO).toContain("WHERE l.status_tabulacao = 'divergente' AND COALESCE(l.tipo_comissao, '') ILIKE '%extra%'");
    expect(LISO).toContain("SET status_tabulacao = 'tabulado', acordo_id = COALESCE(x.meu_id, x.alvo_id)");
  });
});
