/**
 * Guarda da auditoria de RAM, lote 1 (migration 20261109200000, 09/11/2026).
 *
 * Olha a ÚLTIMA migration que define cada função — é a que vale no banco — e
 * confere que ninguém desfez, numa reescrita futura, o que custou caro achar:
 *
 *   - `fn_analitico_mes_linhas` em `LANGUAGE sql` com `SET` passa o resultado
 *     por um tuplestore de `work_mem`: o mês grande (~8 MB) espalhava em disco
 *     a cada leitura (14,9 GB em 20 mil chamadas). Tem de ser plpgsql e
 *     continuar invocadora (a RLS é de quem chama).
 *   - `fn_calendario_setores` não pode voltar a chamar `fn_calendario_alcanca`
 *     por setor (91 ms por chamada, 4% do banco).
 *   - o cron `abobora-tick` não volta a ser agendado depois de desligado.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS = path.resolve(__dirname, '../../../supabase/migrations');
const ARQUIVOS = fs.readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
const ler = (f: string) => fs.readFileSync(path.join(MIGRATIONS, f), 'utf8');

/** O corpo da última `CREATE OR REPLACE FUNCTION public.<nome>(` até o `$function$;` que a fecha. */
function ultimaDefinicao(nome: string): { arquivo: string; sql: string } {
  const abre = new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${nome}\\s*\\(`, 'i');
  for (const arquivo of [...ARQUIVOS].reverse()) {
    const sql = ler(arquivo);
    const m = abre.exec(sql);
    if (!m) continue;
    // A última ocorrência dentro do arquivo.
    let inicio = m.index;
    for (let i = sql.slice(inicio + 1).search(abre); i >= 0; i = sql.slice(inicio + 1).search(abre)) {
      inicio = inicio + 1 + i;
    }
    const resto = sql.slice(inicio);
    const fim = resto.search(/\$function\$\s*;/);
    return { arquivo, sql: fim >= 0 ? resto.slice(0, fim) : resto };
  }
  throw new Error(`nenhuma migration define public.${nome}`);
}

describe('auditoria de RAM, lote 1', () => {
  it('fn_analitico_mes_linhas é plpgsql e invocadora', () => {
    const { arquivo, sql } = ultimaDefinicao('fn_analitico_mes_linhas');
    expect(arquivo >= '20261109200000', `a última definição é ${arquivo}`).toBe(true);
    expect(sql).toMatch(/LANGUAGE\s+plpgsql/i);
    expect(sql).not.toMatch(/SECURITY\s+DEFINER/i);
    // A mesma consulta: a ordem pela PK que as páginas paralelas exigiam.
    expect(sql).toMatch(/ORDER\s+BY\s+r\.id/i);
  });

  it('fn_calendario_setores pergunta sobre a pessoa uma vez, não por setor', () => {
    const { sql } = ultimaDefinicao('fn_calendario_setores');
    expect(sql).not.toMatch(/fn_calendario_alcanca|fn_calendario_edita/);
    expect(sql).toMatch(/SECURITY\s+DEFINER/i);
  });

  it('abobora-tick não volta a ser agendado depois de 20261109200000', () => {
    const depois = ARQUIVOS.filter(f => f > '20261109200000');
    for (const f of depois) {
      expect(ler(f), f).not.toMatch(/cron\.schedule\(\s*'abobora-tick'/);
    }
  });
});
