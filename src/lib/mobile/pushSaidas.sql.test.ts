/**
 * Migration 20260930170000: aviso de pagamento que SAIU do recebimento, e o NR
 * e o «hoje» nos avisos. Executada num Postgres 16 local descartável
 * (30/09/2026) com: limpar e reimportar (3 saídas → 3 «voltou», 0 avisos),
 * transferência e exclusão real (2 avisos), upsert com o mesmo operador (nada),
 * espera (nada antes; cron só dispara com saída vencida), limpeza em massa e
 * push desligado (nada). NÃO aplicada em produção — só com o «pode».
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_push_saidas_e_nr.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('push_saidas', () => {
  it('gatilhos por comando: DELETE e UPDATE, com tabela de transição', () => {
    expect(LISO).toContain('AFTER DELETE ON public.analitico_recebimentos REFERENCING OLD TABLE AS velhas FOR EACH STATEMENT');
    expect(LISO).toContain('AFTER UPDATE ON public.analitico_recebimentos REFERENCING OLD TABLE AS antes NEW TABLE AS depois FOR EACH STATEMENT');
  });
  it('UPDATE só conta quando o operador da linha muda', () => {
    expect(LISO).toContain('a.operador_id IS DISTINCT FROM d.operador_id');
  });
  it('limpar e reimportar não avisa: espera e «voltou»', () => {
    expect(LISO).toContain('make_interval(mins => v_cfg.saida_espera_min)');
    expect(LISO).toContain("situacao = 'voltou'");
    expect(LISO).toContain('AND ar.operador_id = s.perfil_id');
  });
  it('limpeza em massa não entra na fila', () => {
    expect(LISO).toContain('IF (SELECT count(*) FROM velhas) > v_cfg.saida_limite_massa THEN RETURN NULL');
  });
  it('só quem tem aparelho; mês corrente; memória por pagamento e pessoa', () => {
    expect(LISO).toContain('EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = v.operador_id)');
    expect(LISO).toContain('UNIQUE (empresa_id, codigo, data_pagamento, forma_pagamento, perfil_id)');
    expect(LISO).toContain('ON CONFLICT ON CONSTRAINT push_saidas_unica DO NOTHING');
  });
  it('erro nos gatilhos não derruba exclusão nem sincronização', () => {
    expect((LISO.match(/EXCEPTION WHEN OTHERS THEN/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('o lote de entrada passa a levar o NR e o total de hoje', () => {
    expect(LISO).toContain("'codigo', g.codigo");
    expect(LISO).toContain("'hoje', ROUND(a.hoje, 2)");
  });
  it('o cron também acorda para saída vencida', () => {
    expect(LISO).toContain('WHERE enviado_em IS NULL AND verificar_apos <= now()');
  });
  it('fechada para a API; rodada só para service_role', () => {
    expect(LISO).toContain('REVOKE ALL ON public.push_saidas FROM anon, authenticated');
    expect(LISO).toContain('GRANT EXECUTE ON FUNCTION public.fn_push_pegar_saidas(INTEGER) TO service_role');
  });
});
