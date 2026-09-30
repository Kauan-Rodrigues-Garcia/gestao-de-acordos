/**
 * Migration 20260930140000: fila do aviso automático.
 * Executada também num Postgres 16 local (30/09/2026) com o cenário de limpar e
 * reimportar, data antiga, sem aparelho, upsert, cron sem pendente e meta.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_push_fila.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('push_fila', () => {
  it('lembra a chave natural do analítico (limpar e reimportar não repete)', () => {
    expect(LISO).toContain('UNIQUE (empresa_id, codigo, data_pagamento, forma_pagamento, operador_usuario)');
    expect(LISO).toContain('ON CONFLICT ON CONSTRAINT push_fila_chave_natural DO NOTHING');
  });
  it('gatilho por comando, só INSERT, só quem tem aparelho, dentro da janela', () => {
    expect(LISO).toContain('AFTER INSERT ON public.analitico_recebimentos REFERENCING NEW TABLE AS novas FOR EACH STATEMENT');
    expect(LISO).toContain('EXISTS (SELECT 1 FROM public.push_inscricoes i WHERE i.perfil_id = n.operador_id)');
    expect(LISO).toContain("- v_janela");
  });
  it('erro no gatilho não derruba a importação', () => {
    expect(LISO).toContain('EXCEPTION WHEN OTHERS THEN');
  });
  it('o cron só chama a função com pendente', () => {
    expect(LISO).toContain('IF NOT EXISTS (SELECT 1 FROM public.push_fila WHERE enviado_em IS NULL) THEN RETURN;');
    expect(LISO).toContain("cron.schedule('push-disparar', '* * * * *'");
  });
  it('configuração e fila fechadas para a API; rodada só para service_role', () => {
    expect(LISO).toContain('REVOKE ALL ON public.push_config FROM anon, authenticated');
    expect(LISO).toContain('REVOKE ALL ON public.push_fila FROM anon, authenticated');
    expect(LISO).toContain('GRANT EXECUTE ON FUNCTION public.fn_push_pegar_lote(INTEGER) TO service_role');
  });
  it('faxina de 7 dias (maior que a janela)', () => {
    expect(LISO).toContain("INTERVAL '7 days'");
  });
});
