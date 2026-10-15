/**
 * O aviso de pedido de autorização (15/10/2026): vai para os líderes do setor
 * e leva ao chat. As duas portas que criam pedido — registrar e tornar DIRETO —
 * têm que avisar pelo MESMO lugar; uma migration que copie uma delas de um
 * arquivo antigo traria de volta o aviso para a empresa inteira, sem link.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

/** O corpo da última definição da função, pela ordem dos arquivos. */
function ultimaDefinicao(nome: string): string {
  let corpo = '';
  const inicio = new RegExp(String.raw`CREATE OR REPLACE FUNCTION public\.${nome}\(`, 'i');
  for (const f of ARQUIVOS) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');
    let resto = sql;
    for (let m = inicio.exec(resto); m; m = inicio.exec(resto)) {
      const de = m.index;
      const ate = resto.toLowerCase().indexOf('$function$;', de);
      if (ate < 0) break;
      corpo = resto.slice(de, ate);
      resto = resto.slice(ate);
    }
  }
  return corpo;
}

describe('aviso de pedido de autorização', () => {
  it('as duas portas avisam pela função única', () => {
    for (const nome of ['fn_autorizacao_solicitar', 'fn_tornar_direto']) {
      const f = ultimaDefinicao(nome);
      expect(f, nome).toMatch(/fn_autorizacao_notificar\(/);
      expect(f, nome).not.toMatch(/'Autorização solicitada'/);
    }
  });

  it('o aviso leva ao chat e vai primeiro para a liderança do setor', () => {
    const f = ultimaDefinicao('fn_autorizacao_notificar');
    expect(f).toMatch(/'\/autorizacoes'/);
    expect(f).toMatch(/p\.perfil IN \('lider', 'elite', 'gerencia'\)/);
    // Diretoria só quando o setor não tem quem decida.
    expect(f).toMatch(/IF v_n = 0 THEN[\s\S]*'diretoria', 'administrador'/);
  });

  it('o histórico fica 30 dias', () => {
    expect(ultimaDefinicao('fn_autorizacao_faxina')).toMatch(/INTERVAL '30 days'/);
  });
});
