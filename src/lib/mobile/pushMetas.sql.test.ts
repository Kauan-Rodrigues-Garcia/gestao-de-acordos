/**
 * Migration 20260930195304: avisos de META por cargo. Executada num Postgres 16
 * local descartável (30/09/2026):
 *   • semente: a faixa já alcançada ao ligar não avisou;
 *   • 2ª faixa da operadora → ela e o líder; 1ª do outro → líder e a elite que
 *     ligou «metas dos operadores»; «equipe alcançou a meta» → só o líder;
 *   • limpar e reimportar: nada; PaguePlay em H.O.;
 *   • preferências: líder fixo, elite começa desligado, chave inválida recusada;
 *   • `fn_push_metas_equipe_batidas` (a enviar-push anterior) responde vazio e
 *     não consome a marca; reexecutável.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const arquivo = fs.readdirSync(MIGRATIONS).find(f => f.endsWith('_push_metas_por_cargo.sql'));
const LISO = fs.readFileSync(path.join(MIGRATIONS, arquivo as string), 'utf8')
  .replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ');

describe('push: metas por cargo', () => {
  it('líder sempre; os outros só com a chave ligada', () => {
    expect(LISO).toContain("WHEN p.perfil = 'lider' THEN TRUE");
    expect(LISO).toContain("WHEN p_chave = 'metas_operadores' THEN pr.metas_operadores IS TRUE");
    expect(LISO).toContain("WHEN p_chave = 'meta_equipe' THEN pr.meta_equipe IS TRUE");
  });
  it('meta de operador por estado: uma linha por pessoa, mês e faixa, com semente', () => {
    expect(LISO).toContain('PRIMARY KEY (perfil_id, mes, faixa)');
    expect(LISO).toContain('ON CONFLICT (perfil_id, mes, faixa) DO NOTHING RETURNING perfil_id, faixa, empresa_id');
    expect(LISO).toContain("'semente'");
  });
  it('equipe alcançou a meta: destinatários da chave meta_equipe (não a equipe toda)', () => {
    expect(LISO).toContain("public.fn_push_destinatarios_equipe('meta_equipe') d JOIN novas n");
  });
  it('a função antiga não consome a marca durante a troca', () => {
    expect(LISO).toMatch(/FUNCTION public\.fn_push_metas_equipe_batidas\(\) RETURNS JSONB LANGUAGE sql .* SELECT '\[\]'::JSONB;/);
  });
  it('fechada para a API', () => {
    expect(LISO).toContain('REVOKE ALL ON public.push_marcos_operador FROM anon, authenticated');
    expect(LISO).toContain('GRANT EXECUTE ON FUNCTION public.fn_push_metas_da_rodada() TO service_role');
  });
});
