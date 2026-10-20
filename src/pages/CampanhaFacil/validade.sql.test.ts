/**
 * Quando a campanha vai para o histórico (20/10/2026, 20261020120000):
 *
 * - lançar e relançar valem 3 dias (antes, até o mês virar; antes disso, 2 dias);
 * - vencida, a faxina encerra só a que ainda tem mensagem pendente;
 * - a completa (tudo enviado ou «não deu») espera o líder finalizar.
 *
 * Quem decide é o banco. O teste lê a definição MAIS RECENTE de cada função
 * nas migrations: uma migration nova que copie a função de um arquivo antigo e
 * traga o fim do mês de volta, ou volte a encerrar a completa, quebra aqui.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

/** O corpo da última definição da função, sem comentários. */
function ultimaDefinicao(nome: string): string {
  let corpo = '';
  for (const f of ARQUIVOS) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8').replace(/--[^\n]*/g, ' ');
    const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${nome}\\b[\\s\\S]*?\\$function\\$;`, 'gi');
    for (const m of sql.matchAll(re)) corpo = m[0];
  }
  return corpo;
}

describe('Campanha Fácil: 3 dias para a incompleta, «Finalizar» para a completa', () => {
  it('lançar e relançar gravam 3 dias', () => {
    const f = ultimaDefinicao('fn_campanha_facil_lote_ativar');
    expect(f).toMatch(/v_expira\s+TIMESTAMPTZ\s*:=\s*now\(\)\s*\+\s*INTERVAL '3 days'/i);
    expect(f).not.toMatch(/fn_cf_fim_do_mes/i);
  });

  it('a faxina encerra pela validade só a campanha incompleta', () => {
    const f = ultimaDefinicao('fn_campanha_facil_envios_faxina');
    expect(f).toMatch(/l\.lancada_em IS NOT NULL AND l\.expira_em <= now\(\) AND NOT public\.fn_cf_lote_completo\(l\.id\)/i);
  });

  it('completa é ter mensagem e nenhuma pendente', () => {
    const f = ultimaDefinicao('fn_cf_lote_completo');
    expect(f).toMatch(/EXISTS/i);
    expect(f).toMatch(/NOT EXISTS[\s\S]*c\.status = 'pendente'/i);
  });

  it('finalizar é só de quem lançou e só da campanha completa', () => {
    const f = ultimaDefinicao('fn_campanha_facil_lote_finalizar');
    expect(f).toMatch(/criado_por = \(SELECT auth\.uid\(\)\)/i);
    expect(f).toMatch(/IF NOT public\.fn_cf_lote_completo\(l\.id\) THEN\s+RAISE EXCEPTION/i);
    expect(f).toMatch(/placar = public\.fn_cf_placar_do_lote\(l\.id\)/i);
  });
});
