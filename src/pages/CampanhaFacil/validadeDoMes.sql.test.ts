/**
 * A campanha vale até o mês virar (Cleber, 15/10/2026 — eram 2 dias).
 *
 * Quem decide é o banco: `fn_campanha_facil_lote_ativar` grava a validade e a
 * faxina de hora em hora encerra. O teste lê a definição MAIS RECENTE de cada
 * função nas migrations: uma migration nova que copie a função de um arquivo
 * antigo e traga os 2 dias de volta quebra aqui.
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

describe('Campanha Fácil: validade até o fim do mês', () => {
  it('lançar e relançar gravam o fim do mês', () => {
    const f = ultimaDefinicao('fn_campanha_facil_lote_ativar');
    expect(f).toMatch(/v_expira\s+TIMESTAMPTZ\s*:=\s*public\.fn_cf_fim_do_mes\(\)/i);
    expect(f).not.toMatch(/INTERVAL '2 days'/i);
  });

  it('a faxina encerra pela validade, sem a regra da desativada há 2 dias', () => {
    const f = ultimaDefinicao('fn_campanha_facil_envios_faxina');
    expect(f).toMatch(/l\.lancada_em IS NOT NULL AND l\.expira_em <= now\(\)/i);
    expect(f).not.toMatch(/INTERVAL '2 days'/i);
  });

  it('o fim do mês é contado no horário de Brasília', () => {
    expect(ultimaDefinicao('fn_cf_fim_do_mes')).toMatch(/America\/Sao_Paulo[\s\S]*America\/Sao_Paulo/);
  });
});
