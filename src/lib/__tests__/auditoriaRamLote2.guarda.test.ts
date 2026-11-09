/**
 * Guarda da auditoria de RAM, lote 2 (migration 20261109210000, 09/11/2026).
 *
 * `acordos_select` e `ajustes_select` deixaram de chamar função por linha: o
 * que depende de quem lê virou conjunto calculado uma vez (InitPlan). Em
 * 30/09/2026 uma migration recriou uma policy a partir de um arquivo antigo e
 * desfez uma otimização sem ninguém ver. Este teste olha a ÚLTIMA migration que
 * mexe em cada policy — é a que vale no banco — e falha se ela voltar a ter:
 *
 *   - `fn_operador_clonado_no_setor` / `fn_operador_setor_id` (acordos: ~29 mil
 *     chamadas por leitura da empresa para quem tem escopo de setor);
 *   - `fn_user_escopo_acordos` mais de uma vez (cada uma é um InitPlan de ~10 ms);
 *   - `fn_ajuste_alvo_no_meu_alcance` (ajustes: duas `fn_user_tem` por linha).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();

const semComentarios = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

/** Cada `ANY ((SELECT ...))` cujo `(SELECT ...)` interno não é seguido de `::` (cast para array). */
function anyComSubconsulta(sql: string): string[] {
  const ofensores: string[] = [];
  for (const m of sql.matchAll(/ANY\s*\(\s*\(\s*SELECT\b/gi)) {
    const inicio = m.index ?? 0;
    // O segundo `(`: o que abre o `(SELECT ...)` interno. Anda até fechá-lo.
    let i = sql.indexOf('(', sql.indexOf('(', inicio) + 1);
    for (let nivel = 0; i < sql.length; i++) {
      if (sql[i] === '(') nivel++;
      else if (sql[i] === ')' && --nivel === 0) break;
    }
    if (!sql.slice(i + 1).trimStart().startsWith('::')) {
      ofensores.push(sql.slice(inicio, i + 1).replace(/\s+/g, ' ').slice(0, 120));
    }
  }
  return ofensores;
}

/** O texto da última `CREATE/ALTER POLICY <nome> ON <tabela>` até o `;` que a fecha. */
function ultimaPolicy(nome: string, tabela: string): { arquivo: string; sql: string } {
  const abre = new RegExp(`(CREATE|ALTER)\\s+POLICY\\s+"?${nome}"?\\s+ON\\s+(public\\.)?"?${tabela}"?`, 'gi');
  for (const arquivo of [...ARQUIVOS].reverse()) {
    const sql = semComentarios(fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8'));
    const achados = [...sql.matchAll(abre)];
    if (!achados.length) continue;
    const inicio = achados[achados.length - 1].index ?? 0;
    const fim = sql.indexOf(';', inicio);
    return { arquivo, sql: sql.slice(inicio, fim >= 0 ? fim : undefined) };
  }
  throw new Error(`nenhuma migration define a policy ${nome}`);
}

describe('auditoria de RAM, lote 2: policies de leitura em conjunto', () => {
  it('acordos_select não chama função por linha no escopo de setor', () => {
    const { arquivo, sql } = ultimaPolicy('acordos_select', 'acordos');
    expect(arquivo >= '20261109210000', `a última é ${arquivo}`).toBe(true);
    expect(sql).not.toMatch(/fn_operador_clonado_no_setor|fn_operador_setor_id/);
    expect(sql).toMatch(/fn_operadores_clonados_no_setor/);
    expect(sql.match(/fn_user_escopo_acordos/g) ?? []).toHaveLength(1);
  });

  it('ajustes_select não chama fn_ajuste_alvo_no_meu_alcance', () => {
    const { arquivo, sql } = ultimaPolicy('ajustes_select', 'analitico_ajustes_manuais');
    expect(arquivo >= '20261109210000', `a última é ${arquivo}`).toBe(true);
    expect(sql).not.toMatch(/fn_ajuste_alvo_no_meu_alcance|fn_ajuste_no_meu_alcance/);
    expect(sql).toMatch(/fn_pessoas_no_alcance_do_setor/);
  });

  /**
   * `x = ANY ((SELECT fn()))` é lido como SUBCONSULTA (os parênteses duplos
   * fecham um `select_with_parens`), não como array: «operator does not exist:
   * uuid = uuid[]». Foi o que derrubou a primeira aplicação de 20261109210000.
   * O cast depois do `(SELECT ...)` força a forma de array.
   */
  it.each(ARQUIVOS)('%s: ANY ((SELECT ...)) sempre com cast para array', (arquivo) => {
    const sql = semComentarios(fs.readFileSync(path.join(MIGRATIONS, arquivo), 'utf8'));
    expect(anyComSubconsulta(sql)).toEqual([]);
  });

  it('a regra do cast pega o erro que derrubou a primeira aplicação', () => {
    expect(anyComSubconsulta('x = ANY ((SELECT public.fn_a((SELECT public.fn_b()))))')).toHaveLength(1);
    expect(anyComSubconsulta('x = ANY ((SELECT public.fn_a((SELECT public.fn_b())))::uuid[])')).toEqual([]);
    expect(anyComSubconsulta('x = ANY (SELECT c FROM t)')).toEqual([]);
  });

  it('toda chamada de função das duas policies está dentro de (SELECT ...)', () => {
    for (const [nome, tabela] of [['acordos_select', 'acordos'], ['ajustes_select', 'analitico_ajustes_manuais']] as const) {
      const { sql } = ultimaPolicy(nome, tabela);
      const corpo = sql.slice(sql.search(/USING/i));
      // Função nua = `public.fn_x(` sem `SELECT ` logo antes. A única aceita é a
      // do escopo de equipe (ninguém tem; o CASE nem chega nela).
      const nuas = [...corpo.matchAll(/(\(SELECT\s+)?public\.(fn_[a-z_]+)\(/gi)]
        .filter(m => !m[1] && m[2] !== 'fn_operador_no_meu_alcance_de_equipe')
        .map(m => m[2]);
      expect(nuas, nome).toEqual([]);
    }
  });
});
